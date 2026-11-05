import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApiException } from '@kubernetes/client-node';
import type { V1Secret } from '@kubernetes/client-node';
import {
  createFactorioServerSchema,
  updateFactorioServerSchema,
  zodErrorMessage,
} from '@factorio/shared';
import type {
  CreateFactorioServerInput,
  CredentialsInput,
  FactorioServer,
  FactorioServerList,
  FactorioServerSpec,
  UpdateFactorioServerInput,
} from '@factorio/shared';

import { KubernetesService } from '../kubernetes/kubernetes.service.js';

const GROUP = 'games.dev.streamixs.com';
const VERSION = 'v1alpha1';
const PLURAL = 'factorioservers';
const DEFAULT_VERSION = '2.1.24';

const NAME_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

const CREDENTIALS_SUFFIX = '-credentials';
const CREDENTIAL_KEYS = {
  gamePassword: 'game-password',
  password: 'password',
  token: 'token',
} as const;

@Injectable()
export class ServersService {
  constructor(private readonly kubernetes: KubernetesService) {}

  async list(): Promise<FactorioServer[]> {
    const result = await this.call(() =>
      this.kubernetes.customObjects.listNamespacedCustomObject({
        group: GROUP,
        version: VERSION,
        namespace: this.kubernetes.namespace,
        plural: PLURAL,
      }),
    );

    return (result as FactorioServerList).items ?? [];
  }

  async get(name: string): Promise<FactorioServer> {
    this.assertName(name);

    const result = await this.call(() =>
      this.kubernetes.customObjects.getNamespacedCustomObject({
        group: GROUP,
        version: VERSION,
        namespace: this.kubernetes.namespace,
        plural: PLURAL,
        name,
      }),
    );

    return result as FactorioServer;
  }

  async create(input: CreateFactorioServerInput): Promise<FactorioServer> {
    const parsed = createFactorioServerSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(zodErrorMessage(parsed.error));
    }

    const data = parsed.data;
    const spec: FactorioServerSpec = {
      version: data.version ?? DEFAULT_VERSION,
      suspended: data.suspended,
      server: data.server,
      mapGenSettings: data.mapGenSettings,
      mapSettings: data.mapSettings,
      storage: data.storage,
      service: data.service,
    };

    const created = (await this.call(() =>
      this.kubernetes.customObjects.createNamespacedCustomObject({
        group: GROUP,
        version: VERSION,
        namespace: this.kubernetes.namespace,
        plural: PLURAL,
        body: {
          apiVersion: `${GROUP}/${VERSION}`,
          kind: 'FactorioServer',
          metadata: {
            name: data.name,
            namespace: this.kubernetes.namespace,
          },
          spec,
        },
      }),
    )) as FactorioServer;

    if (!hasCredentialChanges(data.credentials)) {
      return created;
    }

    try {
      await this.writeCredentialsSecret(created, data.credentials);
      this.applyCredentialRefs(spec, created.metadata.name, data.credentials);
      return await this.replace(created, spec);
    } catch (error) {
      await this.deleteQuietly(created.metadata.name);
      throw error;
    }
  }

  async update(
    name: string,
    input: UpdateFactorioServerInput,
  ): Promise<FactorioServer> {
    this.assertName(name);

    const parsed = updateFactorioServerSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(zodErrorMessage(parsed.error));
    }

    const existing = await this.get(name);
    const spec = structuredClone(parsed.data.spec);

    if (hasCredentialChanges(parsed.data.credentials)) {
      await this.writeCredentialsSecret(existing, parsed.data.credentials);
      this.applyCredentialRefs(spec, existing.metadata.name, parsed.data.credentials);
    }

    return this.replace(existing, spec);
  }

  async remove(name: string): Promise<void> {
    this.assertName(name);

    await this.call(() =>
      this.kubernetes.customObjects.deleteNamespacedCustomObject({
        group: GROUP,
        version: VERSION,
        namespace: this.kubernetes.namespace,
        plural: PLURAL,
        name,
        propagationPolicy: 'Background',
      }),
    );
  }

  async setSuspended(
    name: string,
    suspended: boolean,
  ): Promise<FactorioServer> {
    const server = await this.get(name);
    server.spec.suspended = suspended;
    return this.replace(server, server.spec);
  }

  private async replace(
    server: FactorioServer,
    spec: FactorioServerSpec,
  ): Promise<FactorioServer> {
    const result = await this.call(() =>
      this.kubernetes.customObjects.replaceNamespacedCustomObject({
        group: GROUP,
        version: VERSION,
        namespace: this.kubernetes.namespace,
        plural: PLURAL,
        name: server.metadata.name,
        body: { ...server, spec },
      }),
    );

    return result as FactorioServer;
  }

  /**
   * Writes the managed credentials Secret. A key set to null is removed, an
   * undefined key is left untouched, and a string value is written. The Secret
   * is owned by the FactorioServer so it is garbage collected with it.
   */
  private async writeCredentialsSecret(
    server: FactorioServer,
    credentials: CredentialsInput,
  ): Promise<void> {
    const name = credentialsSecretName(server.metadata.name);
    const namespace = this.kubernetes.namespace;

    let existing: V1Secret | undefined;
    try {
      existing = await this.kubernetes.core.readNamespacedSecret({
        name,
        namespace,
      });
    } catch (error) {
      if (!(error instanceof ApiException) || error.code !== 404) {
        throw error;
      }
    }

    if (existing !== undefined && !this.isOwnedBy(existing, server)) {
      throw new ConflictException(
        `secret ${name} already exists and is not managed by ${server.metadata.name}`,
      );
    }

    const data: Record<string, string> = { ...existing?.data };

    if (credentials.gamePassword !== undefined) {
      setSecretValue(data, CREDENTIAL_KEYS.gamePassword, credentials.gamePassword);
    }
    if (credentials.password !== undefined) {
      setSecretValue(data, CREDENTIAL_KEYS.password, credentials.password);
    }
    if (credentials.token !== undefined) {
      setSecretValue(data, CREDENTIAL_KEYS.token, credentials.token);
    }

    if (Object.keys(data).length === 0) {
      if (existing !== undefined) {
        await this.kubernetes.core.deleteNamespacedSecret({ name, namespace });
      }
      return;
    }

    if (existing !== undefined) {
      const updated = structuredClone(existing);
      updated.data = data;
      await this.kubernetes.core.replaceNamespacedSecret({
        name,
        namespace,
        body: updated,
      });
      return;
    }

    await this.kubernetes.core.createNamespacedSecret({
      namespace,
      body: {
        metadata: {
          name,
          namespace,
          ownerReferences: [this.ownerReference(server)],
        },
        type: 'Opaque',
        data,
      },
    });
  }

  private applyCredentialRefs(
    spec: FactorioServerSpec,
    serverName: string,
    credentials: CredentialsInput,
  ): void {
    const secretName = credentialsSecretName(serverName);

    if (credentials.gamePassword !== undefined) {
      spec.server ??= {};
      spec.server.access ??= {};
      if (credentials.gamePassword === null) {
        delete spec.server.access.gamePasswordRef;
      } else {
        spec.server.access.gamePasswordRef = {
          name: secretName,
          key: CREDENTIAL_KEYS.gamePassword,
        };
      }
    }

    if (
      credentials.password !== undefined ||
      credentials.token !== undefined
    ) {
      spec.server ??= {};
      spec.server.authentication ??= {};

      if (credentials.password !== undefined) {
        if (credentials.password === null) {
          delete spec.server.authentication.passwordRef;
        } else {
          spec.server.authentication.passwordRef = {
            name: secretName,
            key: CREDENTIAL_KEYS.password,
          };
        }
      }

      if (credentials.token !== undefined) {
        if (credentials.token === null) {
          delete spec.server.authentication.tokenRef;
        } else {
          spec.server.authentication.tokenRef = {
            name: secretName,
            key: CREDENTIAL_KEYS.token,
          };
        }
      }
    }
  }

  private isOwnedBy(secret: V1Secret, server: FactorioServer): boolean {
    return (secret.metadata?.ownerReferences ?? []).some(
      (reference) =>
        reference.kind === 'FactorioServer' &&
        reference.uid === server.metadata.uid,
    );
  }

  private ownerReference(server: FactorioServer): {
    apiVersion: string;
    kind: string;
    name: string;
    uid: string;
    controller: boolean;
    blockOwnerDeletion: boolean;
  } {
    if (server.metadata.uid === undefined) {
      throw new Error(`FactorioServer ${server.metadata.name} has no UID`);
    }

    return {
      apiVersion: `${GROUP}/${VERSION}`,
      kind: 'FactorioServer',
      name: server.metadata.name,
      uid: server.metadata.uid,
      controller: true,
      blockOwnerDeletion: true,
    };
  }

  private async deleteQuietly(name: string): Promise<void> {
    try {
      await this.kubernetes.customObjects.deleteNamespacedCustomObject({
        group: GROUP,
        version: VERSION,
        namespace: this.kubernetes.namespace,
        plural: PLURAL,
        name,
        propagationPolicy: 'Background',
      });
    } catch {
      // Best effort cleanup after a failed create with credentials.
    }
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ApiException) {
        switch (error.code) {
          case 404:
            throw new NotFoundException('FactorioServer not found');
          case 409:
            throw new ConflictException(
              'FactorioServer was modified concurrently; retry',
            );
          case 422:
            throw new BadRequestException('FactorioServer is invalid');
          default:
            break;
        }
      }

      throw error;
    }
  }

  private assertName(name: string): void {
    if (
      typeof name !== 'string' ||
      name.length === 0 ||
      name.length > 63 ||
      !NAME_PATTERN.test(name)
    ) {
      throw new BadRequestException(
        'name must be a valid DNS-1123 label (lowercase alphanumeric and dashes, at most 63 characters)',
      );
    }
  }
}

function credentialsSecretName(serverName: string): string {
  return `${serverName}${CREDENTIALS_SUFFIX}`;
}

function hasCredentialChanges(
  credentials?: CredentialsInput,
): credentials is CredentialsInput {
  return (
    credentials !== undefined &&
    (credentials.gamePassword !== undefined ||
      credentials.password !== undefined ||
      credentials.token !== undefined)
  );
}

function setSecretValue(
  data: Record<string, string>,
  key: string,
  value: string | null,
): void {
  if (value === null) {
    delete data[key];
    return;
  }

  data[key] = Buffer.from(value, 'utf8').toString('base64');
}
