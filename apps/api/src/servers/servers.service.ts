import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ApiException } from '@kubernetes/client-node';
import type {
  CoreV1Event,
  V1Job,
  V1OwnerReference,
  V1Pod,
  V1Secret,
  V1Service,
} from '@kubernetes/client-node';
import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Socket } from 'node:net';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  createFactorioServerSchema,
  rconCommandSchema,
  updateFactorioServerSchema,
  zodErrorMessage,
} from '@factorio/shared';
import type {
  CreateFactorioServerInput,
  CredentialsInput,
  EffectiveSettings,
  FactorioServer,
  FactorioServerList,
  FactorioServerSpec,
  ServerBackup,
  ServerBackups,
  ServerConnection,
  ServerEvent,
  ServerLogs,
  ServerUsage,
  ServicePortInfo,
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

const SAVES_HTTP_PORT = 8080;
const BACKUP_FILE_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]*\.zip$/;
const PRIMARY_SAVE_NAME = '_autosave1.zip';
const RCON_PORT = 27015;
const RCON_SECRET_SUFFIX = '-rcon';
const RCON_PASSWORD_KEY = 'rconpw';
const RCON_TIMEOUT_MS = 30_000;
const RCON_AUTH_ID = 1;
const RCON_EXEC_ID = 2;
const RCON_AUTH_TYPE = 3;
const RCON_EXEC_TYPE = 2;
const RCON_RESPONSE_TYPE = 0;
const IMPORT_DIR = join(tmpdir(), 'factorio-imports');
const MAX_IMPORT_BYTES = 1024 * 1024 * 1024;
const IMPORT_TTL_MS = 10 * 60 * 1000;
const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL ??
  'http://factorio-api.factorio-system.svc.cluster.local:3001';
const RESTORE_SCRIPT = `set -eu
mkdir -p /factorio/saves
if [ -f "/factorio/saves/$TARGET_SAVE" ]; then
  cp -p "/factorio/saves/$TARGET_SAVE" "/factorio/saves/pre-restore-$(date -u +%Y%m%dT%H%M%SZ)-$TARGET_SAVE"
fi
if [ "$SAVE_FILE" != "$TARGET_SAVE" ]; then
  cp "/factorio/saves/$SAVE_FILE" "/factorio/saves/$TARGET_SAVE"
fi
touch "/factorio/saves/$TARGET_SAVE"
`;
const IMPORT_SCRIPT = `set -eu
mkdir -p /factorio/saves
target="/factorio/saves/$TARGET_SAVE"
tmp="/factorio/saves/.import.tmp.zip"
trap 'rm -f "$tmp"' EXIT
if [ -f "$target" ]; then
  cp -p "$target" "/factorio/saves/pre-import-$(date -u +%Y%m%dT%H%M%SZ)-$TARGET_SAVE"
fi
wget -q -O "$tmp" "$IMPORT_URL"
mv "$tmp" "$target"
touch "$target"
`;

interface PendingImport {
  name: string;
  path: string;
  expiresAt: number;
}

@Injectable()
export class ServersService {
  private readonly logger = new Logger(ServersService.name);
  private readonly imports = new Map<string, PendingImport>();

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

  async logs(
    name: string,
    options: { tailLines?: number; previous?: boolean } = {},
  ): Promise<ServerLogs> {
    this.assertName(name);

    const namespace = this.kubernetes.namespace;
    const pods = await this.kubernetes.core.listNamespacedPod({
      namespace,
      labelSelector: `app.kubernetes.io/instance=${name}`,
    });

    const pod = selectPod(pods.items ?? []);
    if (pod?.metadata?.name === undefined) {
      return { pod: null, container: 'factorio', logs: '' };
    }

    try {
      const logs = await this.kubernetes.core.readNamespacedPodLog({
        name: pod.metadata.name,
        namespace,
        container: 'factorio',
        tailLines: clampTailLines(options.tailLines),
        previous: options.previous === true,
      });

      return { pod: pod.metadata.name, container: 'factorio', logs };
    } catch (error) {
      if (error instanceof ApiException && error.code === 400) {
        throw new BadRequestException(
          'Logs are not available for this container yet',
        );
      }
      throw error;
    }
  }

  async events(name: string): Promise<ServerEvent[]> {
    this.assertName(name);

    const result = await this.kubernetes.core.listNamespacedEvent({
      namespace: this.kubernetes.namespace,
    });

    const prefix = `${name}-`;

    return (result.items ?? [])
      .filter((event) => {
        const objectName = event.involvedObject?.name ?? '';
        return objectName === name || objectName.startsWith(prefix);
      })
      .map(toServerEvent)
      .sort(
        (left, right) =>
          Date.parse(right.lastTimestamp) - Date.parse(left.lastTimestamp),
      )
      .slice(0, 100);
  }

  async connection(name: string): Promise<ServerConnection> {
    this.assertName(name);

    const nodeAddresses = await this.nodeAddresses();

    let service: V1Service;
    try {
      service = await this.kubernetes.core.readNamespacedService({
        name,
        namespace: this.kubernetes.namespace,
      });
    } catch (error) {
      if (error instanceof ApiException && error.code === 404) {
        return {
          available: false,
          serviceType: 'ClusterIP',
          ports: [],
          loadBalancer: [],
          nodeAddresses,
        };
      }
      throw error;
    }

    const ports: ServicePortInfo[] = (service.spec?.ports ?? []).map((port) => ({
      name: port.name,
      port: port.port,
      protocol: port.protocol ?? 'TCP',
      nodePort: port.nodePort,
    }));

    const loadBalancer = (service.status?.loadBalancer?.ingress ?? [])
      .map((ingress) => ingress.ip ?? ingress.hostname)
      .filter((value): value is string => value !== undefined);

    return {
      available: true,
      serviceType: service.spec?.type ?? 'ClusterIP',
      clusterIP: service.spec?.clusterIP,
      ports,
      loadBalancer,
      nodeAddresses,
    };
  }

  async usage(name: string): Promise<ServerUsage> {
    this.assertName(name);

    const pod = await this.findServerPod(name);
    const podName = pod?.metadata?.name;

    if (podName === undefined) {
      return {
        available: false,
        cpuMillicores: 0,
        memoryBytes: 0,
        containers: [],
      };
    }

    try {
      const metrics =
        (await this.kubernetes.customObjects.getNamespacedCustomObject({
          group: 'metrics.k8s.io',
          version: 'v1beta1',
          namespace: this.kubernetes.namespace,
          plural: 'pods',
          name: podName,
        })) as {
          containers?: Array<{
            name?: string;
            usage?: { cpu?: string; memory?: string };
          }>;
        };

      const containers = (metrics.containers ?? []).map((container) => ({
        name: container.name ?? 'unknown',
        cpuMillicores: parseCpuMillicores(container.usage?.cpu ?? '0'),
        memoryBytes: parseMemoryBytes(container.usage?.memory ?? '0'),
      }));

      return {
        available: true,
        cpuMillicores: containers.reduce(
          (sum, container) => sum + container.cpuMillicores,
          0,
        ),
        memoryBytes: containers.reduce(
          (sum, container) => sum + container.memoryBytes,
          0,
        ),
        containers,
      };
    } catch {
      return {
        available: false,
        cpuMillicores: 0,
        memoryBytes: 0,
        containers: [],
      };
    }
  }

  private async nodeAddresses(): Promise<string[]> {
    try {
      const nodes = await this.kubernetes.core.listNode({});
      const addresses = new Set<string>();

      for (const node of nodes.items ?? []) {
        for (const address of node.status?.addresses ?? []) {
          if (address.type === 'InternalIP' || address.type === 'ExternalIP') {
            addresses.add(address.address);
          }
        }
      }

      return [...addresses];
    } catch {
      return [];
    }
  }

  async effective(name: string): Promise<EffectiveSettings> {    this.assertName(name);

    let configMap;
    try {
      configMap = await this.kubernetes.core.readNamespacedConfigMap({
        name: `${name}-effective-settings`,
        namespace: this.kubernetes.namespace,
      });
    } catch (error) {
      if (error instanceof ApiException && error.code === 404) {
        throw new NotFoundException('Effective settings are not available yet');
      }
      throw error;
    }

    const defaults = configMap.data?.['defaults.json'];
    const effective = configMap.data?.['effective.json'];

    if (defaults === undefined || effective === undefined) {
      throw new NotFoundException('Effective settings are not available yet');
    }

    try {
      return {
        defaults: JSON.parse(defaults) as FactorioServerSpec,
        effective: JSON.parse(effective) as FactorioServerSpec,
      };
    } catch {
      throw new InternalServerErrorException(
        'Effective settings are not valid JSON',
      );
    }
  }

  async backups(name: string): Promise<ServerBackups> {
    this.assertName(name);

    const pod = await this.findServerPod(name);
    const podIP = pod?.status?.podIP;

    if (podIP === undefined) {
      return { available: false, backups: [] };
    }

    try {
      const response = await this.fetchFromPod(podIP, '/index.txt');
      if (!response.ok) {
        return { available: false, backups: [] };
      }

      const backups = (await response.text())
        .split('\n')
        .map(parseBackupLine)
        .filter((backup): backup is ServerBackup => backup !== undefined)
        .sort(
          (left, right) =>
            Date.parse(right.createdAt) - Date.parse(left.createdAt),
        );

      return { available: true, backups };
    } catch {
      return { available: false, backups: [] };
    }
  }

  async downloadBackup(
    name: string,
    file: string,
  ): Promise<{ data: Buffer; filename: string }> {
    this.assertName(name);
    assertBackupFile(file);

    const pod = await this.findServerPod(name);
    const podIP = pod?.status?.podIP;

    if (podIP === undefined) {
      throw new NotFoundException('Server is not running');
    }

    const response = await this.fetchFromPod(
      podIP,
      `/${encodeURIComponent(file)}`,
    );

    if (!response.ok) {
      throw new NotFoundException('Save not found');
    }

    return {
      data: Buffer.from(await response.arrayBuffer()),
      filename: file,
    };
  }

  async restoreBackup(
    name: string,
    file: string,
  ): Promise<{ save: string; job: string }> {
    this.assertName(name);
    assertBackupFile(file);

    const server = await this.get(name);
    const wasSuspended = server.spec.suspended === true;
    const save = PRIMARY_SAVE_NAME;
    const jobName = restoreJobName(name);

    void this.runRestore(server, name, file, save, jobName, wasSuspended);

    return { save, job: jobName };
  }

  /**
   * Stores an uploaded save and starts a Job that installs it as the world of
   * the server. The file is streamed to a temporary file on the API pod and
   * fetched by the Job from the API over the pod network, so the API never
   * needs to mount the data volume.
   */
  async importSave(
    name: string,
    body: Readable,
    contentLength?: string,
  ): Promise<{ job: string }> {
    this.assertName(name);

    const declared = Number(contentLength ?? '0');
    if (Number.isFinite(declared) && declared > MAX_IMPORT_BYTES) {
      throw new PayloadTooLargeException('Save file is larger than 1 GiB');
    }

    const server = await this.get(name);
    const token = randomBytes(24).toString('base64url');
    const filePath = join(IMPORT_DIR, `${token}.zip`);

    await mkdir(IMPORT_DIR, { recursive: true });

    try {
      await writeLimited(body, filePath);
    } catch (error) {
      await unlink(filePath).catch(() => undefined);
      throw error;
    }

    if (!(await hasZipMagic(filePath))) {
      await unlink(filePath).catch(() => undefined);
      throw new BadRequestException(
        'The uploaded file is not a Factorio save (.zip)',
      );
    }

    this.pruneImports();
    this.imports.set(token, {
      name,
      path: filePath,
      expiresAt: Date.now() + IMPORT_TTL_MS,
    });

    const jobName = importJobName(name);
    void this.runImport(
      server,
      name,
      filePath,
      token,
      jobName,
      server.spec.suspended === true,
    );

    return { job: jobName };
  }

  /**
   * Resolves the one-time URL the import Job uses to fetch the uploaded save.
   * The token is scoped to the server and expires after a few minutes.
   */
  claimImport(name: string, token: string): { path: string; filename: string } {
    this.assertName(name);

    const entry = this.imports.get(token);
    if (
      entry === undefined ||
      entry.name !== name ||
      entry.expiresAt <= Date.now()
    ) {
      this.imports.delete(token);
      throw new NotFoundException('Import not found');
    }

    return { path: entry.path, filename: `${name}.zip` };
  }

  /**
   * Runs a command on the Factorio server over RCON. The password is read
   * from the Secret the agent mounts at config/rconpw.
   */
  async rcon(name: string, input: unknown): Promise<{ output: string }> {
    this.assertName(name);

    const parsed = rconCommandSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(zodErrorMessage(parsed.error));
    }

    await this.get(name);

    const pod = await this.findServerPod(name);
    const podIP = pod?.status?.podIP;
    if (podIP === undefined) {
      throw new NotFoundException('Server is not running');
    }

    let secret: V1Secret;
    try {
      secret = await this.kubernetes.core.readNamespacedSecret({
        name: `${name}${RCON_SECRET_SUFFIX}`,
        namespace: this.kubernetes.namespace,
      });
    } catch {
      throw new InternalServerErrorException('RCON password is not available');
    }

    const encoded = secret.data?.[RCON_PASSWORD_KEY];
    if (encoded === undefined) {
      throw new InternalServerErrorException('RCON password is missing');
    }

    const password = Buffer.from(encoded, 'base64').toString('utf8').trim();

    try {
      const output = await rconExec(
        podIP,
        RCON_PORT,
        password,
        parsed.data.command,
      );
      return { output };
    } catch (error) {
      this.logger.error(
        `RCON command failed for ${name}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new BadGatewayException(
        error instanceof Error ? error.message : 'RCON command failed',
      );
    }
  }

  private async runImport(
    server: FactorioServer,
    name: string,
    filePath: string,
    token: string,
    jobName: string,
    wasSuspended: boolean,
  ): Promise<void> {
    try {
      if (!wasSuspended) {
        await this.setSuspended(name, true);
      }

      await this.waitForPodsGone(name);

      const job = buildImportJob(
        server,
        importUrl(name, token),
        jobName,
        this.ownerReference(server),
      );
      await this.kubernetes.batch.createNamespacedJob({
        namespace: this.kubernetes.namespace,
        body: job,
      });
      await this.waitForJob(jobName);
    } catch (error) {
      this.logger.error(
        `Import of the save for ${name} failed`,
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.imports.delete(token);
      await unlink(filePath).catch(() => undefined);
      await this.deleteJobQuietly(jobName);

      if (!wasSuspended) {
        try {
          await this.setSuspended(name, false);
        } catch (error) {
          this.logger.error(
            'Import completed but the server could not be restarted',
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    }
  }

  private pruneImports(): void {
    const now = Date.now();
    for (const [token, entry] of this.imports) {
      if (entry.expiresAt <= now) {
        this.imports.delete(token);
        void unlink(entry.path).catch(() => undefined);
      }
    }
  }

  private async runRestore(
    server: FactorioServer,
    name: string,
    file: string,
    save: string,
    jobName: string,
    wasSuspended: boolean,
  ): Promise<void> {
    try {
      if (!wasSuspended) {
        await this.setSuspended(name, true);
      }

      await this.waitForPodsGone(name);

      const job = buildRestoreJob(
        server,
        file,
        save,
        jobName,
        this.ownerReference(server),
      );
      await this.kubernetes.batch.createNamespacedJob({
        namespace: this.kubernetes.namespace,
        body: job,
      });
      await this.waitForJob(jobName);
    } catch (error) {
      this.logger.error(
        `Restore of ${file} failed`,
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      await this.deleteJobQuietly(jobName);

      if (!wasSuspended) {
        try {
          await this.setSuspended(name, false);
        } catch (error) {
          this.logger.error(
            'Restore completed but the server could not be restarted',
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    }
  }

  private async findServerPod(name: string): Promise<V1Pod | undefined> {
    const pods = await this.kubernetes.core.listNamespacedPod({
      namespace: this.kubernetes.namespace,
      labelSelector: `app.kubernetes.io/instance=${name}`,
    });

    return selectPod(pods.items ?? []);
  }

  private async fetchFromPod(podIP: string, path: string): Promise<Response> {
    const host = podIP.includes(':') ? `[${podIP}]` : podIP;
    return fetch(`http://${host}:${SAVES_HTTP_PORT}${path}`, {
      signal: AbortSignal.timeout(5000),
    });
  }

  private async waitForPodsGone(name: string): Promise<void> {
    for (let attempt = 0; attempt < 60; attempt++) {
      const pods = await this.kubernetes.core.listNamespacedPod({
        namespace: this.kubernetes.namespace,
        labelSelector: `app.kubernetes.io/instance=${name}`,
      });

      if ((pods.items ?? []).length === 0) {
        return;
      }

      await delay(2000);
    }

    throw new ConflictException('Server pod did not terminate');
  }

  private async waitForJob(jobName: string): Promise<void> {
    for (let attempt = 0; attempt < 90; attempt++) {
      const job = await this.kubernetes.batch.readNamespacedJob({
        name: jobName,
        namespace: this.kubernetes.namespace,
      });

      if ((job.status?.succeeded ?? 0) > 0) {
        return;
      }

      if ((job.status?.failed ?? 0) > 0) {
        throw new InternalServerErrorException('Restore job failed');
      }

      await delay(2000);
    }

    throw new InternalServerErrorException('Restore job timed out');
  }

  private async deleteJobQuietly(jobName: string): Promise<void> {
    try {
      await this.kubernetes.batch.deleteNamespacedJob({
        name: jobName,
        namespace: this.kubernetes.namespace,
        propagationPolicy: 'Background',
      });
    } catch {
      // The restore result matters more than a leftover Job.
    }
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

function assertBackupFile(file: string): void {
  if (!BACKUP_FILE_PATTERN.test(file) || file.includes('..')) {
    throw new BadRequestException('Invalid save file name');
  }
}

function restoreJobName(serverName: string): string {
  const suffix = Date.now().toString(36).slice(-6);
  return `${serverName.slice(0, 40)}-restore-${suffix}`;
}

async function writeLimited(body: Readable, path: string): Promise<void> {
  let total = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length;
      if (total > MAX_IMPORT_BYTES) {
        callback(new PayloadTooLargeException('Save file is larger than 1 GiB'));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(body, limiter, createWriteStream(path));
  } catch (error) {
    if (error instanceof PayloadTooLargeException) {
      throw error;
    }
    throw new BadRequestException('Could not read the uploaded save');
  }
}

async function hasZipMagic(path: string): Promise<boolean> {
  const handle = await open(path, 'r');
  try {
    const header = Buffer.alloc(4);
    const { bytesRead } = await handle.read(header, 0, 4, 0);
    return (
      bytesRead === 4 &&
      header[0] === 0x50 &&
      header[1] === 0x4b &&
      header[2] === 0x03 &&
      header[3] === 0x04
    );
  } finally {
    await handle.close();
  }
}

function importJobName(serverName: string): string {
  const suffix = Date.now().toString(36).slice(-6);
  return `${serverName.slice(0, 40)}-import-${suffix}`;
}

function importUrl(serverName: string, token: string): string {
  return `${API_INTERNAL_URL}/api/servers/${encodeURIComponent(serverName)}/imports/${encodeURIComponent(token)}`;
}

interface RconPacket {
  id: number;
  type: number;
  body: string;
}

function encodeRconPacket(id: number, type: number, body: string): Buffer {
  const payload = Buffer.from(body, 'utf8');
  const packet = Buffer.alloc(14 + payload.length);
  packet.writeInt32LE(10 + payload.length, 0);
  packet.writeInt32LE(id, 4);
  packet.writeInt32LE(type, 8);
  payload.copy(packet, 12);
  packet[12 + payload.length] = 0;
  packet[13 + payload.length] = 0;
  return packet;
}

function readRconPackets(buffer: Buffer): {
  packets: RconPacket[];
  rest: Buffer;
} {
  const packets: RconPacket[] = [];
  let offset = 0;

  while (buffer.length - offset >= 4) {
    const length = buffer.readInt32LE(offset);
    if (length < 10 || buffer.length - offset < 4 + length) {
      break;
    }

    const id = buffer.readInt32LE(offset + 4);
    const type = buffer.readInt32LE(offset + 8);
    const body = buffer
      .subarray(offset + 12, offset + 4 + length - 2)
      .toString('utf8');

    packets.push({ id, type, body });
    offset += 4 + length;
  }

  return { packets, rest: buffer.subarray(offset) };
}

function rconExec(
  host: string,
  port: number,
  password: string,
  command: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let buffer: Buffer = Buffer.alloc(0);
    let authenticated = false;
    let settled = false;
    let output = '';
    let quietTimer: NodeJS.Timeout | undefined;

    const timer = setTimeout(() => {
      fail(new Error('RCON timed out'));
    }, RCON_TIMEOUT_MS);

    function cleanup(): void {
      clearTimeout(timer);
      if (quietTimer !== undefined) {
        clearTimeout(quietTimer);
      }
      socket.destroy();
    }

    function fail(error: Error): void {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    }

    function succeed(value: string): void {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    }

    socket.setTimeout(RCON_TIMEOUT_MS);
    socket.on('timeout', () => fail(new Error('RCON timed out')));
    socket.on('error', (error) => fail(error));
    socket.on('connect', () => {
      socket.write(encodeRconPacket(RCON_AUTH_ID, RCON_AUTH_TYPE, password));
    });
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      const parsed = readRconPackets(buffer);
      buffer = parsed.rest;

      for (const packet of parsed.packets) {
        if (!authenticated) {
          if (packet.id === -1) {
            fail(new Error('RCON authentication failed'));
            return;
          }
          if (packet.id === RCON_AUTH_ID) {
            authenticated = true;
            socket.write(
              encodeRconPacket(RCON_EXEC_ID, RCON_EXEC_TYPE, command),
            );
          }
          continue;
        }

        if (packet.id === RCON_EXEC_ID && packet.type === RCON_RESPONSE_TYPE) {
          output += packet.body;
          if (quietTimer !== undefined) {
            clearTimeout(quietTimer);
          }
          quietTimer = setTimeout(() => succeed(output), 250);
        }
      }
    });

    socket.connect(port, host);
  });
}

function parseBackupLine(line: string): ServerBackup | undefined {
  const [name, size, mtime] = line.trim().split(/\s+/);
  if (name === undefined || !name.endsWith('.zip')) {
    return undefined;
  }

  const sizeValue = Number(size);
  const mtimeValue = Number(mtime);
  if (!Number.isFinite(sizeValue) || !Number.isFinite(mtimeValue)) {
    return undefined;
  }

  return {
    name,
    size: sizeValue,
    createdAt: new Date(mtimeValue * 1000).toISOString(),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCpuMillicores(value: string): number {
  const match = /^([0-9.]+)([num])?$/.exec(value.trim());
  if (match === null) {
    return 0;
  }

  const amount = Number(match[1]);
  switch (match[2]) {
    case 'n':
      return amount / 1_000_000;
    case 'u':
      return amount / 1_000;
    case 'm':
      return amount;
    default:
      return amount * 1000;
  }
}

function parseMemoryBytes(value: string): number {
  const match = /^([0-9.]+)([KMGTPE]i?)?$/.exec(value.trim());
  if (match === null) {
    return 0;
  }

  const amount = Number(match[1]);
  const units: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    Pi: 1024 ** 5,
    Ei: 1024 ** 6,
    K: 1e3,
    M: 1e6,
    G: 1e9,
    T: 1e12,
    P: 1e15,
    E: 1e18,
  };

  return match[2] === undefined ? amount : amount * (units[match[2]] ?? 1);
}

function buildRestoreJob(
  server: FactorioServer,
  file: string,
  save: string,
  jobName: string,
  ownerReference: V1OwnerReference,
): V1Job {
  const namespace = server.metadata.namespace ?? 'default';
  const labels = {
    app: 'factorio-restore',
    'factorio.dev/server': server.metadata.name,
  };

  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: jobName,
      namespace,
      labels,
      ownerReferences: [ownerReference],
    },
    spec: {
      backoffLimit: 1,
      ttlSecondsAfterFinished: 300,
      template: {
        metadata: { labels },
        spec: {
          restartPolicy: 'Never',
          securityContext: {
            runAsNonRoot: true,
            runAsUser: 845,
            runAsGroup: 845,
            seccompProfile: { type: 'RuntimeDefault' },
          },
          containers: [
            {
              name: 'restore',
              image: 'busybox:1.36',
              command: ['sh', '-c', RESTORE_SCRIPT],
              env: [
                { name: 'SAVE_FILE', value: file },
                { name: 'TARGET_SAVE', value: save },
              ],
              volumeMounts: [
                { name: 'data', mountPath: '/factorio' },
              ],
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: true,
                capabilities: { drop: ['ALL'] },
              },
            },
          ],
          volumes: [
            {
              name: 'data',
              persistentVolumeClaim: {
                claimName: `${server.metadata.name}-data`,
              },
            },
          ],
        },
      },
    },
  } as V1Job;
}

function buildImportJob(
  server: FactorioServer,
  importURL: string,
  jobName: string,
  ownerReference: V1OwnerReference,
): V1Job {
  const namespace = server.metadata.namespace ?? 'default';
  const labels = {
    app: 'factorio-import',
    'factorio.dev/server': server.metadata.name,
  };

  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: jobName,
      namespace,
      labels,
      ownerReferences: [ownerReference],
    },
    spec: {
      backoffLimit: 1,
      ttlSecondsAfterFinished: 300,
      template: {
        metadata: { labels },
        spec: {
          restartPolicy: 'Never',
          securityContext: {
            runAsNonRoot: true,
            runAsUser: 845,
            runAsGroup: 845,
            seccompProfile: { type: 'RuntimeDefault' },
          },
          containers: [
            {
              name: 'import',
              image: 'busybox:1.36',
              command: ['sh', '-c', IMPORT_SCRIPT],
              env: [
                { name: 'IMPORT_URL', value: importURL },
                { name: 'TARGET_SAVE', value: PRIMARY_SAVE_NAME },
              ],
              volumeMounts: [
                { name: 'data', mountPath: '/factorio' },
              ],
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: true,
                capabilities: { drop: ['ALL'] },
              },
            },
          ],
          volumes: [
            {
              name: 'data',
              persistentVolumeClaim: {
                claimName: `${server.metadata.name}-data`,
              },
            },
          ],
        },
      },
    },
  } as V1Job;
}

function clampTailLines(value?: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 200;
  }

  return Math.min(Math.max(Math.trunc(value), 1), 2000);
}

function selectPod(pods: V1Pod[]): V1Pod | undefined {
  return [...pods].sort((left, right) => {
    const leftReady = isPodReady(left);
    const rightReady = isPodReady(right);

    if (leftReady !== rightReady) {
      return leftReady ? -1 : 1;
    }

    return podTimestamp(right) - podTimestamp(left);
  })[0];
}

function isPodReady(pod: V1Pod): boolean {
  return (
    pod.status?.containerStatuses?.some((status) => status.ready) ?? false
  );
}

function podTimestamp(pod: V1Pod): number {
  const created = pod.metadata?.creationTimestamp;
  return created === undefined ? 0 : new Date(created).getTime();
}

function toServerEvent(event: CoreV1Event): ServerEvent {
  const timestamp =
    event.lastTimestamp ??
    event.eventTime ??
    event.metadata?.creationTimestamp;

  return {
    type: event.type ?? 'Normal',
    reason: event.reason ?? '',
    message: event.message ?? '',
    objectKind: event.involvedObject?.kind ?? '',
    objectName: event.involvedObject?.name ?? '',
    count: event.count ?? 1,
    lastTimestamp: toISOString(timestamp),
  };
}

function toISOString(value: Date | string | undefined): string {
  if (value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
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
