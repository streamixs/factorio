import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ApiException } from '@kubernetes/client-node';
import type { FactorioServer } from '@factorio/shared';
import { Readable } from 'node:stream';

import { KubernetesService } from '../kubernetes/kubernetes.service.js';
import { ServersService } from './servers.service.js';

describe('ServersService', () => {
  const listNamespacedCustomObject = vi.fn();
  const getNamespacedCustomObject = vi.fn();
  const createNamespacedCustomObject = vi.fn();
  const deleteNamespacedCustomObject = vi.fn();
  const replaceNamespacedCustomObject = vi.fn();
  const readNamespacedSecret = vi.fn();
  const createNamespacedSecret = vi.fn();
  const replaceNamespacedSecret = vi.fn();
  const deleteNamespacedSecret = vi.fn();
  const listNamespacedPod = vi.fn();
  const readNamespacedPodLog = vi.fn();
  const listNamespacedEvent = vi.fn();
  const readNamespacedConfigMap = vi.fn();
  const readNamespacedService = vi.fn();
  const listNode = vi.fn();
  const createNamespacedJob = vi.fn();
  const readNamespacedJob = vi.fn();
  const deleteNamespacedJob = vi.fn();
  const readCustomResourceDefinition = vi.fn();

  let service: ServersService;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServersService,
        {
          provide: KubernetesService,
          useValue: {
            namespace: 'games',
            customObjects: {
              listNamespacedCustomObject,
              getNamespacedCustomObject,
              createNamespacedCustomObject,
              deleteNamespacedCustomObject,
              replaceNamespacedCustomObject,
            },
            core: {
              readNamespacedSecret,
              createNamespacedSecret,
              replaceNamespacedSecret,
              deleteNamespacedSecret,
              listNamespacedPod,
              readNamespacedPodLog,
              listNamespacedEvent,
              readNamespacedConfigMap,
              readNamespacedService,
              listNode,
            },
            batch: {
              createNamespacedJob,
              readNamespacedJob,
              deleteNamespacedJob,
            },
            apiextensions: {
              readCustomResourceDefinition,
            },
          },
        },
      ],
    }).compile();

    service = module.get<ServersService>(ServersService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists servers in the configured namespace', async () => {
    listNamespacedCustomObject.mockResolvedValue({
      items: [{ metadata: { name: 'server-a' }, spec: {} }],
    });

    const servers = await service.list();

    expect(servers).toHaveLength(1);
    expect(listNamespacedCustomObject).toHaveBeenCalledWith({
      group: 'games.dev.streamixs.com',
      version: 'v1alpha1',
      namespace: 'games',
      plural: 'factorioservers',
    });
  });

  it('creates a FactorioServer with defaults', async () => {
    createNamespacedCustomObject.mockImplementation(
      (request: { body: FactorioServer }) => Promise.resolve(request.body),
    );

    const server = await service.create({ name: 'my-server' });

    expect(server.apiVersion).toBe('games.dev.streamixs.com/v1alpha1');
    expect(server.kind).toBe('FactorioServer');
    expect(server.metadata).toMatchObject({
      name: 'my-server',
      namespace: 'games',
    });
    expect(server.spec.version).toBe('2.1.24');
    expect(createNamespacedCustomObject).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'games',
        plural: 'factorioservers',
      }),
    );
  });

  it('keeps resource settings when creating a FactorioServer', async () => {
    createNamespacedCustomObject.mockImplementation(
      (request: { body: FactorioServer }) => Promise.resolve(request.body),
    );

    const server = await service.create({
      name: 'my-server',
      resources: {
        cpuRequest: '750m',
        cpuLimit: '3',
        memoryRequest: '2Gi',
        memoryLimit: '6Gi',
      },
    });

    expect(server.spec.resources).toEqual({
      cpuRequest: '750m',
      cpuLimit: '3',
      memoryRequest: '2Gi',
      memoryLimit: '6Gi',
    });
  });

  it('creates the managed credentials Secret', async () => {
    createNamespacedCustomObject.mockImplementation(
      (request: { body: FactorioServer }) =>
        Promise.resolve({
          ...request.body,
          metadata: { ...request.body.metadata, uid: 'uid-1' },
        }),
    );
    readNamespacedSecret.mockRejectedValue(
      new ApiException(404, 'Not Found', undefined, {}),
    );
    createNamespacedSecret.mockResolvedValue({});
    replaceNamespacedCustomObject.mockImplementation(
      (request: { body: FactorioServer }) => Promise.resolve(request.body),
    );

    const server = await service.create({
      name: 'my-server',
      credentials: { gamePassword: 'hunter2' },
    });

    expect(createNamespacedSecret).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'games',
        body: expect.objectContaining({
          metadata: expect.objectContaining({
            name: 'my-server-credentials',
            ownerReferences: [
              expect.objectContaining({ uid: 'uid-1', controller: true }),
            ],
          }),
          data: {
            'game-password': Buffer.from('hunter2').toString('base64'),
          },
        }),
      }),
    );
    expect(server.spec.server?.access?.gamePasswordRef).toEqual({
      name: 'my-server-credentials',
      key: 'game-password',
    });
  });

  it('rejects an invalid name without calling the API', async () => {
    await expect(service.create({ name: 'Not Valid' })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(createNamespacedCustomObject).not.toHaveBeenCalled();
  });

  it('rejects an invalid seed', async () => {
    await expect(
      service.create({
        name: 'my-server',
        mapGenSettings: { seed: 5_000_000_000 },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates the spec', async () => {
    getNamespacedCustomObject.mockResolvedValue({
      apiVersion: 'games.dev.streamixs.com/v1alpha1',
      kind: 'FactorioServer',
      metadata: { name: 'my-server', namespace: 'games', uid: 'uid-1' },
      spec: { version: '2.1.24' },
    });
    replaceNamespacedCustomObject.mockImplementation(
      (request: { body: FactorioServer }) => Promise.resolve(request.body),
    );

    const server = await service.update('my-server', {
      spec: {
        version: '2.1.24',
        server: { identity: { name: 'Updated' } },
      },
    });

    expect(server.spec.server?.identity?.name).toBe('Updated');
    expect(createNamespacedSecret).not.toHaveBeenCalled();
  });

  it('writes credentials and refs on update', async () => {
    getNamespacedCustomObject.mockResolvedValue({
      apiVersion: 'games.dev.streamixs.com/v1alpha1',
      kind: 'FactorioServer',
      metadata: { name: 'my-server', namespace: 'games', uid: 'uid-1' },
      spec: { version: '2.1.24' },
    });
    readNamespacedSecret.mockRejectedValue(
      new ApiException(404, 'Not Found', undefined, {}),
    );
    createNamespacedSecret.mockResolvedValue({});
    replaceNamespacedCustomObject.mockImplementation(
      (request: { body: FactorioServer }) => Promise.resolve(request.body),
    );

    const server = await service.update('my-server', {
      spec: { version: '2.1.24' },
      credentials: { gamePassword: 'pw', token: 'tok' },
    });

    expect(createNamespacedSecret).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          data: {
            'game-password': Buffer.from('pw').toString('base64'),
            token: Buffer.from('tok').toString('base64'),
          },
        }),
      }),
    );
    expect(server.spec.server?.access?.gamePasswordRef).toEqual({
      name: 'my-server-credentials',
      key: 'game-password',
    });
    expect(server.spec.server?.authentication?.tokenRef).toEqual({
      name: 'my-server-credentials',
      key: 'token',
    });
  });

  it('clears a credential and removes its reference', async () => {
    getNamespacedCustomObject.mockResolvedValue({
      apiVersion: 'games.dev.streamixs.com/v1alpha1',
      kind: 'FactorioServer',
      metadata: { name: 'my-server', namespace: 'games', uid: 'uid-1' },
      spec: {
        version: '2.1.24',
        server: {
          access: {
            gamePasswordRef: {
              name: 'my-server-credentials',
              key: 'game-password',
            },
          },
        },
      },
    });
    readNamespacedSecret.mockResolvedValue({
      metadata: {
        name: 'my-server-credentials',
        namespace: 'games',
        ownerReferences: [{ kind: 'FactorioServer', uid: 'uid-1' }],
      },
      data: {
        'game-password': Buffer.from('old').toString('base64'),
        token: Buffer.from('tok').toString('base64'),
      },
    });
    replaceNamespacedSecret.mockResolvedValue({});
    replaceNamespacedCustomObject.mockImplementation(
      (request: { body: FactorioServer }) => Promise.resolve(request.body),
    );

    const server = await service.update('my-server', {
      spec: {
        version: '2.1.24',
        server: {
          access: {
            gamePasswordRef: {
              name: 'my-server-credentials',
              key: 'game-password',
            },
          },
        },
      },
      credentials: { gamePassword: null },
    });

    expect(replaceNamespacedSecret).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          data: { token: Buffer.from('tok').toString('base64') },
        }),
      }),
    );
    expect(server.spec.server?.access?.gamePasswordRef).toBeUndefined();
  });

  it('returns logs from the ready pod', async () => {
    listNamespacedPod.mockResolvedValue({
      items: [
        {
          metadata: {
            name: 'pod-old',
            creationTimestamp: new Date('2026-01-01T00:00:00Z'),
          },
          status: {},
        },
        {
          metadata: {
            name: 'pod-new',
            creationTimestamp: new Date('2026-01-02T00:00:00Z'),
          },
          status: { containerStatuses: [{ ready: true }] },
        },
      ],
    });
    readNamespacedPodLog.mockResolvedValue('factorio log');

    const logs = await service.logs('my-server', { tailLines: 50 });

    expect(logs).toEqual({
      pod: 'pod-new',
      container: 'factorio',
      logs: 'factorio log',
    });
    expect(readNamespacedPodLog).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'pod-new',
        container: 'factorio',
        tailLines: 50,
        previous: false,
      }),
    );
  });

  it('returns an empty log document when no pod exists', async () => {
    listNamespacedPod.mockResolvedValue({ items: [] });

    const logs = await service.logs('my-server');

    expect(logs).toEqual({ pod: null, container: 'factorio', logs: '' });
    expect(readNamespacedPodLog).not.toHaveBeenCalled();
  });

  it('returns related events newest first', async () => {
    getNamespacedCustomObject.mockResolvedValue({
      metadata: { name: 'my-server', uid: 'uid-my-server' },
      spec: {},
    });
    listNamespacedCustomObject.mockResolvedValue({
      items: [
        { metadata: { name: 'my-server' }, spec: {} },
        { metadata: { name: 'other-server' }, spec: {} },
      ],
    });
    listNamespacedEvent.mockResolvedValue({
      items: [
        {
          type: 'Normal',
          reason: 'Created',
          message: 'pod created',
          involvedObject: { kind: 'Pod', name: 'my-server-abc' },
          lastTimestamp: new Date('2026-01-01T00:00:00Z'),
          count: 1,
        },
        {
          type: 'Warning',
          reason: 'Ignored',
          message: 'other server',
          involvedObject: { kind: 'Pod', name: 'other-server' },
          lastTimestamp: new Date('2026-01-04T00:00:00Z'),
          count: 2,
        },
        {
          type: 'Normal',
          reason: 'Updated',
          message: 'deployment updated',
          involvedObject: { kind: 'Deployment', name: 'my-server' },
          eventTime: '2026-01-03T00:00:00Z',
          count: 1,
        },
      ],
    });

    const events = await service.events('my-server');

    expect(events).toHaveLength(2);
    expect(events[0].reason).toBe('Updated');
    expect(events[0].lastTimestamp).toBe('2026-01-03T00:00:00.000Z');
    expect(events[1].reason).toBe('Created');
    expect(events[1].objectName).toBe('my-server-abc');
  });

  it('does not leak events from a server whose name extends the requested name', async () => {
    getNamespacedCustomObject.mockResolvedValue({
      metadata: { name: 'my-server', uid: 'uid-my-server' },
      spec: {},
    });
    listNamespacedCustomObject.mockResolvedValue({
      items: [
        { metadata: { name: 'my-server' }, spec: {} },
        { metadata: { name: 'my-server-other' }, spec: {} },
      ],
    });
    listNamespacedEvent.mockResolvedValue({
      items: [
        {
          type: 'Normal',
          reason: 'OwnPod',
          message: 'pod created',
          involvedObject: { kind: 'Pod', name: 'my-server-abc' },
          lastTimestamp: new Date('2026-01-01T00:00:00Z'),
          count: 1,
        },
        {
          type: 'Normal',
          reason: 'OwnDeployment',
          message: 'deployment updated',
          involvedObject: { kind: 'Deployment', name: 'my-server' },
          lastTimestamp: new Date('2026-01-02T00:00:00Z'),
          count: 1,
        },
        {
          type: 'Warning',
          reason: 'OtherService',
          message: 'other server service',
          involvedObject: { kind: 'Service', name: 'my-server-other' },
          lastTimestamp: new Date('2026-01-03T00:00:00Z'),
          count: 1,
        },
        {
          type: 'Warning',
          reason: 'OtherPod',
          message: 'other server pod',
          involvedObject: { kind: 'Pod', name: 'my-server-other-abc' },
          lastTimestamp: new Date('2026-01-04T00:00:00Z'),
          count: 1,
        },
      ],
    });

    const events = await service.events('my-server');

    expect(events.map((event) => event.reason)).toEqual([
      'OwnDeployment',
      'OwnPod',
    ]);
  });

  it('returns default and effective specifications', async () => {
    readNamespacedConfigMap.mockResolvedValue({
      data: {
        'defaults.json': JSON.stringify({ storage: { size: '10Gi' } }),
        'effective.json': JSON.stringify({ storage: { size: '5Gi' } }),
      },
    });

    const settings = await service.effective('my-server');

    expect(settings.defaults.storage?.size).toBe('10Gi');
    expect(settings.effective.storage?.size).toBe('5Gi');
    expect(readNamespacedConfigMap).toHaveBeenCalledWith({
      name: 'my-server-effective-settings',
      namespace: 'games',
    });
  });

  it('maps a missing effective ConfigMap to NotFoundException', async () => {
    readNamespacedConfigMap.mockRejectedValue(
      new ApiException(404, 'Not Found', undefined, {}),
    );

    await expect(service.effective('my-server')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lists the Factorio saves from the saves sidecar', async () => {
    listNamespacedPod.mockResolvedValue({
      items: [
        {
          metadata: { name: 'pod' },
          status: { podIP: '10.0.0.1', containerStatuses: [{ ready: true }] },
        },
      ],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '_autosave2.zip 123 1767225600\n_broken.txt 1 1\n',
      }),
    );

    const backups = await service.backups('my-server');

    expect(backups.available).toBe(true);
    expect(backups.backups).toEqual([
      {
        name: '_autosave2.zip',
        size: 123,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('returns unavailable when no pod is running', async () => {
    listNamespacedPod.mockResolvedValue({ items: [] });

    await expect(service.backups('my-server')).resolves.toEqual({
      available: false,
      backups: [],
    });
  });

  it('downloads a save from the sidecar', async () => {
    listNamespacedPod.mockResolvedValue({
      items: [
        {
          metadata: { name: 'pod' },
          status: { podIP: '10.0.0.1', containerStatuses: [{ ready: true }] },
        },
      ],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      }),
    );

    const backup = await service.downloadBackup('my-server', '_autosave2.zip');

    expect(backup.filename).toBe('_autosave2.zip');
    expect(backup.data).toEqual(Buffer.from([1, 2, 3]));
  });

  it('creates a restore operation', async () => {
    const server = {
      apiVersion: 'games.dev.streamixs.com/v1alpha1',
      kind: 'FactorioServer',
      metadata: {
        name: 'my-server',
        namespace: 'games',
        uid: 'uid-1',
      },
      spec: {
        version: '2.1.24',
        suspended: false,
      },
    };
    getNamespacedCustomObject.mockResolvedValue(server);
    listNamespacedCustomObject.mockResolvedValue({ items: [] });
    createNamespacedCustomObject.mockResolvedValue({
      metadata: { name: 'my-server-restore-abc' },
    });

    const result = await service.restoreBackup('my-server', '_autosave2.zip');

    expect(result.operation).toBe('my-server-restore-abc');
    expect(createNamespacedCustomObject).toHaveBeenCalledWith(
      expect.objectContaining({
        group: 'games.dev.streamixs.com',
        version: 'v1alpha1',
        namespace: 'games',
        plural: 'factoriooperations',
        body: expect.objectContaining({
          kind: 'FactorioOperation',
          metadata: expect.objectContaining({
            generateName: 'my-server-restore-',
            ownerReferences: [
              expect.objectContaining({
                kind: 'FactorioServer',
                name: 'my-server',
                uid: 'uid-1',
                controller: true,
              }),
            ],
          }),
          spec: {
            serverName: 'my-server',
            type: 'Restore',
            saveFile: '_autosave2.zip',
          },
        }),
      }),
    );
  });

  it('creates an import operation with a one-time URL', async () => {
    const server = {
      apiVersion: 'games.dev.streamixs.com/v1alpha1',
      kind: 'FactorioServer',
      metadata: {
        name: 'my-server',
        namespace: 'games',
        uid: 'uid-1',
      },
      spec: {
        version: '2.1.24',
        suspended: false,
      },
    };
    getNamespacedCustomObject.mockResolvedValue(server);
    listNamespacedCustomObject.mockResolvedValue({ items: [] });
    createNamespacedCustomObject.mockResolvedValue({
      metadata: { name: 'my-server-import-abc' },
    });

    const result = await service.importSave(
      'my-server',
      Readable.from([Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])]),
      '8',
    );

    expect(result.operation).toBe('my-server-import-abc');
    expect(createNamespacedCustomObject).toHaveBeenCalledWith(
      expect.objectContaining({
        plural: 'factoriooperations',
        body: expect.objectContaining({
          metadata: expect.objectContaining({
            generateName: 'my-server-import-',
          }),
          spec: expect.objectContaining({
            serverName: 'my-server',
            type: 'Import',
            importUrl: expect.stringContaining(
              '/api/servers/my-server/imports/',
            ),
          }),
        }),
      }),
    );
  });

  it('returns the FactorioServer spec schema', async () => {
    readCustomResourceDefinition.mockResolvedValue({
      spec: {
        versions: [
          {
            name: 'v1alpha1',
            schema: {
              openAPIV3Schema: {
                properties: {
                  spec: {
                    type: 'object',
                    properties: {
                      version: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    });

    const schema = await service.schema();

    expect(schema).toEqual({
      type: 'object',
      properties: {
        version: { type: 'string' },
      },
    });
    expect(readCustomResourceDefinition).toHaveBeenCalledWith({
      name: 'factorioservers.games.dev.streamixs.com',
    });
  });

  it('returns rendered settings JSON with credentials masked', async () => {
    getNamespacedCustomObject.mockResolvedValue({
      metadata: { name: 'my-server', namespace: 'games' },
      spec: { version: '2.1.24' },
    });
    readNamespacedSecret.mockResolvedValue({
      data: {
        'server-settings.json': Buffer.from(
          JSON.stringify({
            name: 'Server',
            game_password: 'hunter2',
            password: 'account-password',
            token: 'api-token',
            username: 'player',
          }),
        ).toString('base64'),
      },
    });
    readNamespacedConfigMap.mockImplementation((request: { name: string }) => {
      if (request.name === 'my-server-map-gen-settings') {
        return Promise.resolve({
          data: { 'map-gen-settings.json': '{"seed":42}' },
        });
      }
      return Promise.reject(new ApiException(404, 'Not Found', undefined, {}));
    });

    const json = await service.settingsJson('my-server');

    expect(JSON.parse(json.server ?? '{}')).toMatchObject({
      name: 'Server',
      game_password: '********',
      password: '********',
      token: '********',
      username: 'player',
    });
    expect(json.mapGen).toBe('{"seed":42}');
    expect(json.mapSettings).toBeNull();
  });

  it('lists operations for one server, newest first', async () => {
    listNamespacedCustomObject.mockResolvedValue({
      items: [
        {
          metadata: {
            name: 'op-old',
            creationTimestamp: '2026-01-01T00:00:00.000Z',
          },
          spec: {
            serverName: 'my-server',
            type: 'Restore',
            saveFile: 'old.zip',
          },
          status: {
            phase: 'Completed',
            message: 'Save installed',
            completedAt: '2026-01-01T00:01:00.000Z',
          },
        },
        {
          metadata: {
            name: 'op-other',
            creationTimestamp: '2026-01-03T00:00:00.000Z',
          },
          spec: { serverName: 'other-server', type: 'Import' },
        },
        {
          metadata: {
            name: 'op-new',
            creationTimestamp: '2026-01-02T00:00:00.000Z',
          },
          spec: { serverName: 'my-server', type: 'Import' },
          status: { phase: 'Running' },
        },
      ],
    });

    const operations = await service.operations('my-server');

    expect(operations.map((operation) => operation.name)).toEqual([
      'op-new',
      'op-old',
    ]);
    expect(operations[0].phase).toBe('Running');
    expect(operations[1].saveFile).toBe('old.zip');
  });

  it('rejects an import that is not a zip', async () => {
    getNamespacedCustomObject.mockResolvedValue({
      metadata: { name: 'my-server', namespace: 'games' },
      spec: { version: '2.1.24' },
    });
    listNamespacedCustomObject.mockResolvedValue({ items: [] });

    await expect(
      service.importSave(
        'my-server',
        Readable.from([Buffer.from('not a zip')]),
        '9',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(createNamespacedCustomObject).not.toHaveBeenCalled();
  });

  it('rejects a save larger than the import limit', async () => {
    await expect(
      service.importSave(
        'my-server',
        Readable.from([]),
        String(2 * 1024 * 1024 * 1024),
      ),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);

    expect(getNamespacedCustomObject).not.toHaveBeenCalled();
  });

  it('rejects an empty RCON command', async () => {
    await expect(
      service.rcon('my-server', { command: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an RCON command that is too long', async () => {
    await expect(
      service.rcon('my-server', { command: 'x'.repeat(1001) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports RCON unavailable when the server is not running', async () => {
    getNamespacedCustomObject.mockResolvedValue({
      metadata: { name: 'my-server', namespace: 'games' },
      spec: { version: '2.1.24' },
    });
    listNamespacedPod.mockResolvedValue({ items: [] });

    await expect(
      service.rcon('my-server', { command: '/players' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the service connection details', async () => {
    readNamespacedService.mockResolvedValue({
      spec: {
        type: 'NodePort',
        clusterIP: '10.0.0.5',
        ports: [
          {
            name: 'game',
            port: 34197,
            protocol: 'UDP',
            nodePort: 31183,
          },
        ],
      },
      status: { loadBalancer: {} },
    });
    listNode.mockResolvedValue({
      items: [
        {
          status: {
            addresses: [{ type: 'InternalIP', address: '192.168.139.2' }],
          },
        },
      ],
    });

    const connection = await service.connection('my-server');

    expect(connection).toEqual({
      available: true,
      serviceType: 'NodePort',
      clusterIP: '10.0.0.5',
      ports: [
        {
          name: 'game',
          port: 34197,
          protocol: 'UDP',
          nodePort: 31183,
        },
      ],
      loadBalancer: [],
      nodeAddresses: ['192.168.139.2'],
    });
  });

  it('returns parsed pod usage', async () => {
    listNamespacedPod.mockResolvedValue({
      items: [
        {
          metadata: { name: 'pod' },
          status: { podIP: '10.0.0.1', containerStatuses: [{ ready: true }] },
        },
      ],
    });
    getNamespacedCustomObject.mockResolvedValue({
      containers: [
        { name: 'factorio', usage: { cpu: '12m', memory: '383Mi' } },
        { name: 'saves', usage: { cpu: '2m', memory: '8Mi' } },
      ],
    });

    const usage = await service.usage('my-server');

    expect(usage.available).toBe(true);
    expect(usage.cpuMillicores).toBe(14);
    expect(usage.memoryBytes).toBe(391 * 1024 * 1024);
    expect(usage.containers).toHaveLength(2);
  });

  it('returns unavailable usage when no pod is running', async () => {
    listNamespacedPod.mockResolvedValue({ items: [] });

    await expect(service.usage('my-server')).resolves.toEqual({
      available: false,
      cpuMillicores: 0,
      memoryBytes: 0,
      containers: [],
    });
  });

  it('maps a 404 to NotFoundException', async () => {
    getNamespacedCustomObject.mockRejectedValue(
      new ApiException(404, 'Not Found', undefined, {}),
    );

    await expect(service.get('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('stops a server by replacing it with suspended=true', async () => {
    getNamespacedCustomObject.mockResolvedValue({
      apiVersion: 'games.dev.streamixs.com/v1alpha1',
      kind: 'FactorioServer',
      metadata: { name: 'my-server', namespace: 'games' },
      spec: { version: '2.1.24' },
    });
    replaceNamespacedCustomObject.mockImplementation(
      (request: { body: FactorioServer }) => Promise.resolve(request.body),
    );
    listNamespacedCustomObject.mockResolvedValue({ items: [] });

    const server = await service.setSuspended('my-server', true);

    expect(server.spec.suspended).toBe(true);
    expect(replaceNamespacedCustomObject).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: 'games', name: 'my-server' }),
    );
  });

  it('starts a server by replacing it with suspended=false', async () => {
    getNamespacedCustomObject.mockResolvedValue({
      apiVersion: 'games.dev.streamixs.com/v1alpha1',
      kind: 'FactorioServer',
      metadata: { name: 'my-server', namespace: 'games' },
      spec: { version: '2.1.24', suspended: true },
    });
    replaceNamespacedCustomObject.mockImplementation(
      (request: { body: FactorioServer }) => Promise.resolve(request.body),
    );
    listNamespacedCustomObject.mockResolvedValue({ items: [] });

    const server = await service.setSuspended('my-server', false);

    expect(server.spec.suspended).toBe(false);
  });

  it('refuses to start a server while an operation is running', async () => {
    getNamespacedCustomObject.mockResolvedValue({
      apiVersion: 'games.dev.streamixs.com/v1alpha1',
      kind: 'FactorioServer',
      metadata: { name: 'my-server', namespace: 'games' },
      spec: { version: '2.1.24', suspended: true },
    });
    listNamespacedCustomObject.mockResolvedValue({
      items: [
        {
          metadata: { name: 'my-server-restore-abc' },
          spec: { serverName: 'my-server', type: 'Restore' },
          status: { phase: 'Running' },
        },
      ],
    });

    await expect(
      service.setSuspended('my-server', false),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(replaceNamespacedCustomObject).not.toHaveBeenCalled();
  });

  it('refuses to stop a server while an operation is running', async () => {
    getNamespacedCustomObject.mockResolvedValue({
      apiVersion: 'games.dev.streamixs.com/v1alpha1',
      kind: 'FactorioServer',
      metadata: { name: 'my-server', namespace: 'games' },
      spec: { version: '2.1.24', suspended: false },
    });
    listNamespacedCustomObject.mockResolvedValue({
      items: [
        {
          metadata: { name: 'my-server-restore-abc' },
          spec: { serverName: 'my-server', type: 'Restore' },
          status: { phase: 'Running' },
        },
      ],
    });

    await expect(
      service.setSuspended('my-server', true),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(replaceNamespacedCustomObject).not.toHaveBeenCalled();
  });

  it('refuses to restore while an operation is running', async () => {
    listNamespacedCustomObject.mockResolvedValue({
      items: [
        {
          metadata: { name: 'my-server-import-abc' },
          spec: { serverName: 'my-server', type: 'Import' },
          status: { phase: 'Running' },
        },
      ],
    });

    await expect(
      service.restoreBackup('my-server', '_autosave2.zip'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(createNamespacedCustomObject).not.toHaveBeenCalled();
  });

  it('refuses to import while an operation is running', async () => {
    listNamespacedCustomObject.mockResolvedValue({
      items: [
        {
          metadata: { name: 'my-server-restore-abc' },
          spec: { serverName: 'my-server', type: 'Restore' },
          status: { phase: 'Running' },
        },
      ],
    });

    await expect(
      service.importSave(
        'my-server',
        Readable.from([Buffer.from([0x50, 0x4b, 0x03, 0x04])]),
        '4',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(getNamespacedCustomObject).not.toHaveBeenCalled();
    expect(createNamespacedCustomObject).not.toHaveBeenCalled();
  });

  it('allows only one concurrent operation creation', async () => {
    const server = {
      apiVersion: 'games.dev.streamixs.com/v1alpha1',
      kind: 'FactorioServer',
      metadata: {
        name: 'my-server',
        namespace: 'games',
        uid: 'uid-1',
      },
      spec: { version: '2.1.24', suspended: false },
    };
    getNamespacedCustomObject.mockResolvedValue(server);
    listNamespacedCustomObject.mockResolvedValue({ items: [] });
    createNamespacedCustomObject.mockResolvedValue({
      metadata: { name: 'my-server-restore-abc' },
    });

    const results = await Promise.allSettled([
      service.restoreBackup('my-server', '_autosave1.zip'),
      service.restoreBackup('my-server', '_autosave2.zip'),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(createNamespacedCustomObject).toHaveBeenCalledTimes(1);
  });

  it('deletes with background propagation', async () => {
    deleteNamespacedCustomObject.mockResolvedValue(undefined);

    await service.remove('my-server');

    expect(deleteNamespacedCustomObject).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'games',
        name: 'my-server',
        propagationPolicy: 'Background',
      }),
    );
  });
});
