import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ApiException } from '@kubernetes/client-node';
import type { FactorioServer } from '@factorio/shared';

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
            },
          },
        },
      ],
    }).compile();

    service = module.get<ServersService>(ServersService);
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

    const server = await service.setSuspended('my-server', false);

    expect(server.spec.suspended).toBe(false);
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
