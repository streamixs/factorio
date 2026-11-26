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
  V1PersistentVolumeClaim,
  V1Pod,
  V1Secret,
  V1Service,
} from '@kubernetes/client-node';
import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  statfs,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Socket } from 'node:net';
import { Readable, Transform } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
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
  ServerOperation,
  ServerOperationPhase,
  ServerOperationType,
  ServerSettingsJson,
  ServerStorage,
  ServerUsage,
  ServicePortInfo,
  UpdateFactorioServerInput,
} from '@factorio/shared';

import { KubernetesService } from '../kubernetes/kubernetes.service.js';
import { importSpaceIssue } from './import-space.js';

const GROUP = 'games.dev.streamixs.com';
const VERSION = 'v1alpha1';
const PLURAL = 'factorioservers';
const OPERATIONS_PLURAL = 'factoriooperations';
const CRD_NAME = 'factorioservers.games.dev.streamixs.com';
const SCHEMA_TTL_MS = 5 * 60 * 1000;
const VERSIONS_TTL_MS = 10 * 60 * 1000;
const FACTORIO_IMAGE_REPOSITORY = 'factoriotools/factorio';
const SERVER_SETTINGS_SECRET_SUFFIX = '-server-settings';
const MAP_GEN_SETTINGS_CONFIGMAP_SUFFIX = '-map-gen-settings';
const MAP_SETTINGS_CONFIGMAP_SUFFIX = '-map-settings';
const SERVER_SETTINGS_FILE = 'server-settings.json';
const MAP_GEN_SETTINGS_FILE = 'map-gen-settings.json';
const MAP_SETTINGS_FILE = 'map-settings.json';
const DEFAULT_VERSION = '2.1.24';

const NAME_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

const CREDENTIALS_SUFFIX = '-credentials';
const CREDENTIAL_KEYS = {
  gamePassword: 'game-password',
  password: 'password',
  token: 'token',
} as const;

const DATA_PVC_SUFFIX = '-data';
const KEEP_PVC_ANNOTATION = 'games.dev.streamixs.com/keep-pvc';
const KEEP_PVC_PENDING_ANNOTATION = 'games.dev.streamixs.com/keep-pvc-pending';

const SAVES_HTTP_PORT = 8080;
const BACKUP_FILE_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]*\.zip$/;
const RCON_PORT = 27015;
const RCON_SECRET_SUFFIX = '-rcon';
const RCON_PASSWORD_KEY = 'rconpw';
const RCON_TIMEOUT_MS = 30_000;
const RCON_AUTH_ID = 1;
const RCON_EXEC_ID = 2;
const RCON_AUTH_TYPE = 3;
const RCON_EXEC_TYPE = 2;
const RCON_RESPONSE_TYPE = 0;
const IMPORT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const MAX_IMPORT_BYTES = 1024 * 1024 * 1024;
const IMPORT_TTL_MS = 30 * 60 * 1000;
const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL ??
  'http://factorio-api.factorio-system.svc.cluster.local:3001';

interface StoredImport {
  name: string;
  expiresAt: number;
}

interface FactorioOperationResource {
  metadata?: {
    name?: string;
    creationTimestamp?: string;
  };
  spec?: {
    serverName?: string;
    type?: ServerOperationType;
    saveFile?: string;
  };
  status?: {
    phase?: string;
    message?: string;
    completedAt?: string;
  };
}

@Injectable()
export class ServersService {
  private readonly logger = new Logger(ServersService.name);
  private readonly importDir =
    process.env.FACTORIO_IMPORT_DIR ?? join(tmpdir(), 'factorio-imports');
  private readonly creatingOperations = new Set<string>();
  private schemaCache: {
    value: Record<string, unknown>;
    expiresAt: number;
  } | null = null;
  private versionsCache: {
    value: string[];
    expiresAt: number;
  } | null = null;

  constructor(private readonly kubernetes: KubernetesService) {
    // Uploaded saves are kept only until the operation Job fetches them.
    void this.pruneImports();
    setInterval(() => void this.pruneImports(), 60_000).unref();
  }

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
      resources: data.resources,
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
    await this.assertNoActiveOperation(name);

    if (
      parsed.data.generation !== undefined &&
      parsed.data.generation !== existing.metadata.generation
    ) {
      throw new ConflictException(
        'Server configuration changed since it was loaded; reload and retry',
      );
    }

    const spec = structuredClone(parsed.data.spec);
    // Suspension is controlled by the start/stop endpoints, never by a
    // settings update. Preserve the current state to avoid restarting a server
    // that was stopped externally or is being operated on.
    spec.suspended = existing.spec.suspended;

    if (hasCredentialChanges(parsed.data.credentials)) {
      await this.writeCredentialsSecret(existing, parsed.data.credentials);
      this.applyCredentialRefs(
        spec,
        existing.metadata.name,
        parsed.data.credentials,
      );
    }

    return this.replaceWithGenerationRetry(
      existing,
      spec,
      parsed.data.generation,
    );
  }

  async remove(
    name: string,
    options: { keepStorage?: boolean } = {},
  ): Promise<void> {
    this.assertName(name);
    await this.assertNoActiveOperation(name);

    const server = await this.get(name);

    if (options.keepStorage === true) {
      const annotated = await this.annotateServerForKeptPVC(server);
      try {
        await this.markPersistentVolumeClaimForRetention(annotated);
      } catch (error) {
        await this.clearKeepPVCPendingAnnotation(annotated);
        throw error;
      }
    }

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

  /**
   * Marks the server before detaching its PVC. The agent must not adopt the
   * kept claim while the server still exists, otherwise the claim is owned by
   * the server again when the API deletes it and is garbage collected.
   */
  private async annotateServerForKeptPVC(
    server: FactorioServer,
  ): Promise<FactorioServer> {
    const annotated = structuredClone(server);
    annotated.metadata = {
      ...annotated.metadata,
      annotations: {
        ...annotated.metadata?.annotations,
        [KEEP_PVC_PENDING_ANNOTATION]: 'true',
      },
    };
    return this.replace(annotated, annotated.spec);
  }

  private async clearKeepPVCPendingAnnotation(
    server: FactorioServer,
  ): Promise<void> {
    const cleared = structuredClone(server);
    const annotations = { ...cleared.metadata?.annotations };
    delete annotations[KEEP_PVC_PENDING_ANNOTATION];
    cleared.metadata = {
      ...cleared.metadata,
      annotations,
    };

    try {
      await this.replace(cleared, cleared.spec);
    } catch {
      // Best effort. The delete already failed; a retry will keep the claim.
    }
  }

  /**
   * Detaches the data PVC from the FactorioServer before deleting the custom
   * resource. The agent adopts it when a server with the same name is created
   * again. If the update fails, the caller aborts the deletion: keeping a
   * server is safer than silently losing its data.
   */
  private async markPersistentVolumeClaimForRetention(
    server: FactorioServer,
  ): Promise<void> {
    const pvcName = `${server.metadata.name}${DATA_PVC_SUFFIX}`;

    let pvc: V1PersistentVolumeClaim;
    try {
      pvc = await this.kubernetes.core.readNamespacedPersistentVolumeClaim({
        name: pvcName,
        namespace: this.kubernetes.namespace,
      });
    } catch (error) {
      if (error instanceof ApiException && error.code === 404) {
        return;
      }
      throw error;
    }

    const ownerReferences = (pvc.metadata?.ownerReferences ?? []).filter(
      (reference) =>
        !(
          reference.kind === 'FactorioServer' &&
          (reference.uid === server.metadata.uid ||
            reference.name === server.metadata.name)
        ),
    );

    // The Kubernetes client sends application/json-patch+json by default. Test
    // the resourceVersion so a concurrent change aborts the deletion, then
    // replace the ownerReferences array and add the keep annotation.
    const patch: Array<{
      op: string;
      path: string;
      value: unknown;
    }> = [];
    if (pvc.metadata?.resourceVersion !== undefined) {
      patch.push({
        op: 'test',
        path: '/metadata/resourceVersion',
        value: pvc.metadata.resourceVersion,
      });
    }
    patch.push(
      {
        op: 'add',
        path: '/metadata/annotations',
        value: {
          ...pvc.metadata?.annotations,
          [KEEP_PVC_ANNOTATION]: 'true',
        },
      },
      {
        op: 'add',
        path: '/metadata/ownerReferences',
        value: ownerReferences,
      },
    );

    await this.call(() =>
      this.kubernetes.core.patchNamespacedPersistentVolumeClaim({
        name: pvcName,
        namespace: this.kubernetes.namespace,
        body: patch,
      }),
    );
  }

  async setSuspended(
    name: string,
    suspended: boolean,
  ): Promise<FactorioServer> {
    const server = await this.get(name);
    await this.assertNoActiveOperation(name);

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

    const server = await this.get(name);
    const servers = await this.list();
    const otherServers = servers.filter((item) => item.metadata.name !== name);

    const result = await this.kubernetes.core.listNamespacedEvent({
      namespace: this.kubernetes.namespace,
    });

    const prefix = `${name}-`;

    return (result.items ?? [])
      .filter((event) => {
        const involved = event.involvedObject;

        if (
          server.metadata.uid !== undefined &&
          involved?.uid === server.metadata.uid
        ) {
          return true;
        }

        const objectName = involved?.name ?? '';
        if (objectName !== name && !objectName.startsWith(prefix)) {
          return false;
        }

        // A longer server name can share this server's prefix, for example
        // "foo" and "foo-bar". Exclude objects owned by those servers.
        return !otherServers.some((other) => {
          const otherName = other.metadata.name;
          return (
            objectName === otherName || objectName.startsWith(`${otherName}-`)
          );
        });
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

    const ports: ServicePortInfo[] = (service.spec?.ports ?? []).map(
      (port) => ({
        name: port.name,
        port: port.port,
        protocol: port.protocol ?? 'TCP',
        nodePort: port.nodePort,
      }),
    );

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

  async effective(name: string): Promise<EffectiveSettings> {
    this.assertName(name);

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
      const [indexResponse, usageResponse] = await Promise.all([
        this.fetchFromPod(podIP, '/index.txt'),
        this.fetchFromPod(podIP, '/usage.txt').catch(() => null),
      ]);

      if (!indexResponse.ok) {
        return { available: false, backups: [] };
      }

      const backups = (await indexResponse.text())
        .split('\n')
        .map(parseBackupLine)
        .filter((backup): backup is ServerBackup => backup !== undefined)
        .sort(
          (left, right) =>
            Date.parse(right.createdAt) - Date.parse(left.createdAt),
        );

      let storage: ServerStorage | undefined;
      if (usageResponse !== null && usageResponse.ok) {
        try {
          storage = parseStorageUsage(await usageResponse.text());
        } catch {
          storage = undefined;
        }
      }

      return { available: true, backups, storage };
    } catch {
      return { available: false, backups: [] };
    }
  }

  async downloadBackup(
    name: string,
    file: string,
  ): Promise<{ stream: Readable; filename: string; contentLength?: number }> {
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
      0,
    );

    if (!response.ok) {
      throw new NotFoundException('Save not found');
    }

    if (response.body === null) {
      throw new InternalServerErrorException('Save stream is empty');
    }

    const contentLengthHeader = response.headers.get('content-length');
    const contentLength =
      contentLengthHeader === null ? undefined : Number(contentLengthHeader);

    return {
      stream: Readable.fromWeb(response.body as unknown as NodeReadableStream),
      filename: file,
      contentLength:
        contentLength !== undefined && Number.isFinite(contentLength)
          ? contentLength
          : undefined,
    };
  }

  async restoreBackup(
    name: string,
    file: string,
  ): Promise<{ operation: string }> {
    this.assertName(name);
    assertBackupFile(file);
    await this.assertNoActiveOperation(name);

    const server = await this.get(name);
    const operation = await this.createOperation(server, 'Restore', {
      saveFile: file,
    });

    return { operation };
  }

  /**
   * Stores an uploaded save and creates a durable operation. The agent owns
   * the suspend/Job/resume state machine and downloads the file from the API,
   * so an API restart no longer leaves the server stopped.
   */
  async importSave(
    name: string,
    body: Readable,
    contentLength?: string,
  ): Promise<{ operation: string }> {
    this.assertName(name);

    const declared = Number(contentLength ?? '0');
    if (Number.isFinite(declared) && declared > MAX_IMPORT_BYTES) {
      throw new PayloadTooLargeException('Save file is larger than 1 GiB');
    }

    await this.assertNoActiveOperation(name);

    const server = await this.get(name);
    const token = randomBytes(24).toString('base64url');
    const filePath = join(this.importDir, `${token}.zip`);
    const tempPath = `${filePath}.tmp`;

    await mkdir(this.importDir, { recursive: true });

    let freeBytes: number | undefined;
    try {
      const stats = await statfs(this.importDir);
      freeBytes = stats.bavail * stats.bsize;
    } catch {
      // The write stream and ENOSPC handling remain the fallback.
    }

    const spaceIssue = importSpaceIssue(declared, freeBytes);
    if (spaceIssue !== undefined) {
      throw new PayloadTooLargeException(spaceIssue);
    }

    try {
      await writeLimited(body, tempPath);

      if (!(await hasZipMagic(tempPath))) {
        throw new BadRequestException(
          'The uploaded file is not a Factorio save (.zip)',
        );
      }

      await rename(tempPath, filePath);
      await this.writeImportMetadata(token, {
        name,
        expiresAt: Date.now() + IMPORT_TTL_MS,
      });
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      await this.deleteImport(token);
      throw error;
    }

    await this.pruneImports();

    try {
      const operation = await this.createOperation(server, 'Import', {
        importUrl: importUrl(name, token),
      });

      return { operation };
    } catch (error) {
      await this.deleteImport(token);
      throw error;
    }
  }

  /**
   * Returns the FactorioServer spec OpenAPI schema. The UI generates bounds,
   * enums and defaults from it, so adding a field to the CRD also adds it to
   * the form.
   */
  async schema(): Promise<Record<string, unknown>> {
    if (this.schemaCache !== null && this.schemaCache.expiresAt > Date.now()) {
      return this.schemaCache.value;
    }

    const crd =
      await this.kubernetes.apiextensions.readCustomResourceDefinition({
        name: CRD_NAME,
      });
    const versions = crd.spec?.versions ?? [];
    const version =
      versions.find((item) => item.name === VERSION) ?? versions[0];
    const schema = version?.schema?.openAPIV3Schema?.properties?.spec;

    if (schema === undefined) {
      throw new InternalServerErrorException(
        'FactorioServer schema is not available',
      );
    }

    const value = schema as unknown as Record<string, unknown>;
    this.schemaCache = {
      value,
      expiresAt: Date.now() + SCHEMA_TTL_MS,
    };
    return value;
  }

  /**
   * Returns Factorio image tags that can be selected in the UI. Docker Hub is
   * best effort: without network access the configured default is returned.
   */
  async versions(): Promise<string[]> {
    if (
      this.versionsCache !== null &&
      this.versionsCache.expiresAt > Date.now()
    ) {
      return this.versionsCache.value;
    }

    let versions = [DEFAULT_VERSION];
    try {
      const response = await fetch(
        `https://hub.docker.com/v2/repositories/${FACTORIO_IMAGE_REPOSITORY}/tags?page_size=100&ordering=last_updated`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (response.ok) {
        const body = (await response.json()) as {
          results?: { name?: string }[];
        };
        const tags = (body.results ?? [])
          .map((item) => item.name)
          .filter(
            (name): name is string =>
              typeof name === 'string' && /^\d+\.\d+\.\d+$/.test(name),
          );
        versions = [...new Set([DEFAULT_VERSION, ...tags])];
      }
    } catch {
      // Offline cluster: the default version remains selectable.
    }

    versions.sort(compareVersionsDesc);
    this.versionsCache = {
      value: versions,
      expiresAt: Date.now() + VERSIONS_TTL_MS,
    };
    return versions;
  }

  /** Lists the StorageClasses available to the cluster. */
  async storageClasses(): Promise<string[]> {
    try {
      const result = await this.kubernetes.storage.listStorageClass({});
      return (result.items ?? [])
        .map((item) => item.metadata?.name)
        .filter(
          (name): name is string => typeof name === 'string' && name !== '',
        )
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * Returns the JSON files the agent actually rendered for Factorio. The
   * server settings are read from the Secret and account credentials are
   * masked before they leave the API.
   */
  async settingsJson(name: string): Promise<ServerSettingsJson> {
    this.assertName(name);
    await this.get(name);

    const namespace = this.kubernetes.namespace;
    const [server, mapGen, mapSettings] = await Promise.all([
      this.readServerSettingsJson(name, namespace),
      this.readConfigMapValue(
        name + MAP_GEN_SETTINGS_CONFIGMAP_SUFFIX,
        namespace,
        MAP_GEN_SETTINGS_FILE,
      ),
      this.readConfigMapValue(
        name + MAP_SETTINGS_CONFIGMAP_SUFFIX,
        namespace,
        MAP_SETTINGS_FILE,
      ),
    ]);

    return { server, mapGen, mapSettings };
  }

  private async readServerSettingsJson(
    name: string,
    namespace: string,
  ): Promise<string | null> {
    try {
      const secret = await this.kubernetes.core.readNamespacedSecret({
        name: name + SERVER_SETTINGS_SECRET_SUFFIX,
        namespace,
      });
      const encoded = secret.data?.[SERVER_SETTINGS_FILE];
      if (encoded === undefined) {
        return null;
      }
      return maskServerSettings(
        Buffer.from(encoded, 'base64').toString('utf8'),
      );
    } catch {
      return null;
    }
  }

  private async readConfigMapValue(
    name: string,
    namespace: string,
    key: string,
  ): Promise<string | null> {
    try {
      const configMap = await this.kubernetes.core.readNamespacedConfigMap({
        name,
        namespace,
      });
      return configMap.data?.[key] ?? null;
    } catch {
      return null;
    }
  }

  async operations(name: string): Promise<ServerOperation[]> {
    this.assertName(name);

    const result = await this.call(() =>
      this.kubernetes.customObjects.listNamespacedCustomObject({
        group: GROUP,
        version: VERSION,
        namespace: this.kubernetes.namespace,
        plural: OPERATIONS_PLURAL,
      }),
    );

    const items =
      (result as { items?: FactorioOperationResource[] } | undefined)?.items ??
      [];

    return items
      .filter((item) => item.spec?.serverName === name)
      .map(toServerOperation)
      .sort(
        (left, right) =>
          Date.parse(right.createdAt) - Date.parse(left.createdAt),
      );
  }

  private async assertNoActiveOperation(name: string): Promise<void> {
    const active = (await this.operations(name)).find(
      (operation) =>
        operation.phase !== 'Completed' && operation.phase !== 'Failed',
    );
    if (active !== undefined) {
      throw new ConflictException(
        `Operation ${active.name} is still in progress`,
      );
    }
  }

  private async createOperation(
    server: FactorioServer,
    type: ServerOperationType,
    extra: { saveFile?: string; importUrl?: string },
  ): Promise<string> {
    const serverName = server.metadata.name;

    if (this.creatingOperations.has(serverName)) {
      throw new ConflictException(
        `An operation is already being created for ${serverName}`,
      );
    }

    this.creatingOperations.add(serverName);
    try {
      await this.assertNoActiveOperation(serverName);
      const namespace = server.metadata.namespace ?? this.kubernetes.namespace;
      const body = {
        apiVersion: `${GROUP}/${VERSION}`,
        kind: 'FactorioOperation',
        metadata: {
          generateName: `${serverName}-${type.toLowerCase()}-`,
          namespace,
          ownerReferences: [this.ownerReference(server)],
        },
        spec: {
          serverName,
          type,
          ...extra,
        },
      };

      const created = await this.call(() =>
        this.kubernetes.customObjects.createNamespacedCustomObject({
          group: GROUP,
          version: VERSION,
          namespace,
          plural: OPERATIONS_PLURAL,
          body,
        }),
      );

      const operationName = (created as { metadata?: { name?: string } })
        .metadata?.name;
      if (operationName === undefined || operationName === '') {
        throw new InternalServerErrorException('Operation name is missing');
      }
      return operationName;
    } finally {
      this.creatingOperations.delete(serverName);
    }
  }

  /**
   * Resolves the one-time URL the import Job uses to fetch the uploaded save.
   * The metadata lives next to the file so it survives an API restart.
   */
  async claimImport(
    name: string,
    token: string,
  ): Promise<{ path: string; filename: string }> {
    this.assertName(name);

    if (!IMPORT_TOKEN_PATTERN.test(token)) {
      throw new NotFoundException('Import not found');
    }

    const metadata = await this.readImportMetadata(token);
    if (metadata === undefined) {
      throw new NotFoundException('Import not found');
    }

    const paths = this.importPaths(token);
    if (metadata.name !== name || metadata.expiresAt <= Date.now()) {
      await this.deleteImport(token);
      throw new NotFoundException('Import not found');
    }

    try {
      await stat(paths.zip);
    } catch {
      await this.deleteImport(token);
      throw new NotFoundException('Import not found');
    }

    return { path: paths.zip, filename: `${name}.zip` };
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
      this.logger.log(
        `RCON command for ${name}: ${parsed.data.command
          .replace(/\s+/g, ' ')
          .slice(0, 200)}`,
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

  private importPaths(token: string): { zip: string; metadata: string } {
    return {
      zip: join(this.importDir, `${token}.zip`),
      metadata: join(this.importDir, `${token}.json`),
    };
  }

  private async writeImportMetadata(
    token: string,
    metadata: StoredImport,
  ): Promise<void> {
    const paths = this.importPaths(token);
    const tempPath = `${paths.metadata}.tmp`;
    await writeFile(tempPath, JSON.stringify(metadata), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(tempPath, paths.metadata);
  }

  private async readImportMetadata(
    token: string,
  ): Promise<StoredImport | undefined> {
    try {
      const raw = await readFile(this.importPaths(token).metadata, 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoredImport>;
      if (
        typeof parsed.name !== 'string' ||
        typeof parsed.expiresAt !== 'number' ||
        !Number.isFinite(parsed.expiresAt)
      ) {
        return undefined;
      }
      return { name: parsed.name, expiresAt: parsed.expiresAt };
    } catch {
      return undefined;
    }
  }

  private async deleteImport(token: string): Promise<void> {
    const paths = this.importPaths(token);
    await Promise.all([
      unlink(paths.zip).catch(() => undefined),
      unlink(paths.metadata).catch(() => undefined),
    ]);
  }

  private async pruneImports(): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(this.importDir);
    } catch {
      return;
    }

    const now = Date.now();
    const tokens = new Set<string>();

    for (const entry of entries) {
      if (entry.endsWith('.json')) {
        tokens.add(entry.slice(0, -5));
      } else if (entry.endsWith('.zip')) {
        tokens.add(entry.slice(0, -4));
      } else if (entry.endsWith('.tmp')) {
        const tempPath = join(this.importDir, entry);
        try {
          const info = await stat(tempPath);
          if (now - info.mtimeMs > IMPORT_TTL_MS) {
            await unlink(tempPath).catch(() => undefined);
          }
        } catch {
          // The temp file disappeared while pruning.
        }
      }
    }

    for (const token of tokens) {
      const metadata = await this.readImportMetadata(token);
      const paths = this.importPaths(token);

      if (metadata === undefined) {
        try {
          const info = await stat(paths.zip);
          if (now - info.mtimeMs > IMPORT_TTL_MS) {
            await this.deleteImport(token);
          }
        } catch {
          await this.deleteImport(token);
        }
        continue;
      }

      let missingSave = false;
      try {
        await stat(paths.zip);
      } catch {
        missingSave = true;
      }

      if (missingSave || metadata.expiresAt <= now) {
        await this.deleteImport(token);
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

  private async fetchFromPod(
    podIP: string,
    path: string,
    timeoutMs = 5000,
  ): Promise<Response> {
    const host = podIP.includes(':') ? `[${podIP}]` : podIP;
    const init: RequestInit = {};

    if (timeoutMs > 0) {
      init.signal = AbortSignal.timeout(timeoutMs);
    }

    return fetch(`http://${host}:${SAVES_HTTP_PORT}${path}`, init);
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
   * Replaces the server, retrying once when Kubernetes rejects the write
   * because only the status (and therefore resourceVersion) changed. A real
   * spec change bumps metadata.generation and is reported as a conflict.
   */
  private async replaceWithGenerationRetry(
    server: FactorioServer,
    spec: FactorioServerSpec,
    expectedGeneration: number | undefined,
  ): Promise<FactorioServer> {
    try {
      return await this.replace(server, spec);
    } catch (error) {
      if (
        !(error instanceof ConflictException) ||
        expectedGeneration === undefined
      ) {
        throw error;
      }

      const latest = await this.get(server.metadata.name);
      if (latest.metadata.generation !== expectedGeneration) {
        throw new ConflictException(
          'Server configuration changed since it was loaded; reload and retry',
        );
      }

      return this.replace(latest, spec);
    }
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
      setSecretValue(
        data,
        CREDENTIAL_KEYS.gamePassword,
        credentials.gamePassword,
      );
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

    if (credentials.password !== undefined || credentials.token !== undefined) {
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

async function writeLimited(body: Readable, path: string): Promise<void> {
  let total = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length;
      if (total > MAX_IMPORT_BYTES) {
        callback(
          new PayloadTooLargeException('Save file is larger than 1 GiB'),
        );
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
    if (isNoSpaceError(error)) {
      throw new PayloadTooLargeException(
        'Not enough space on the import volume',
      );
    }
    throw new BadRequestException('Could not read the uploaded save');
  }
}

function isNoSpaceError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOSPC'
  );
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

function toServerOperation(item: FactorioOperationResource): ServerOperation {
  return {
    name: item.metadata?.name ?? '',
    type: item.spec?.type ?? 'Restore',
    phase: operationPhase(item.status?.phase),
    message: item.status?.message,
    saveFile: item.spec?.saveFile,
    createdAt: item.metadata?.creationTimestamp ?? new Date(0).toISOString(),
    completedAt: item.status?.completedAt,
  };
}

function operationPhase(value: string | undefined): ServerOperationPhase {
  switch (value) {
    case 'Suspending':
    case 'Running':
    case 'Completed':
    case 'Failed':
      return value;
    default:
      return 'Pending';
  }
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

function parseStorageUsage(text: string): ServerStorage | undefined {
  const lines = text.trim().split('\n');
  if (lines.length < 2) {
    return undefined;
  }

  const [totalKb, usedKb, freeKb] = lines[0].trim().split(/\s+/).map(Number);
  const savesKb = Number(lines[1].trim().split(/\s+/)[0]);
  const values = [totalKb, usedKb, freeKb, savesKb];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    return undefined;
  }

  return {
    savesBytes: savesKb * 1024,
    totalBytes: totalKb * 1024,
    freeBytes: freeKb * 1024,
  };
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

function maskServerSettings(content: string): string {
  try {
    const data = JSON.parse(content) as Record<string, unknown>;
    for (const key of ['game_password', 'password', 'token']) {
      if (typeof data[key] === 'string' && data[key] !== '') {
        data[key] = '********';
      }
    }
    return `${JSON.stringify(data, null, 2)}\n`;
  } catch {
    return content;
  }
}

function compareVersionsDesc(left: string, right: string): number {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);

  for (let index = 0; index < 3; index += 1) {
    const difference = (rightParts[index] ?? 0) - (leftParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return right.localeCompare(left);
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
  return pod.status?.containerStatuses?.some((status) => status.ready) ?? false;
}

function podTimestamp(pod: V1Pod): number {
  const created = pod.metadata?.creationTimestamp;
  return created === undefined ? 0 : new Date(created).getTime();
}

function toServerEvent(event: CoreV1Event): ServerEvent {
  const timestamp =
    event.lastTimestamp ?? event.eventTime ?? event.metadata?.creationTimestamp;

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
