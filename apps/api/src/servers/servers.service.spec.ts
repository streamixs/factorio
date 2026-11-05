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
    expect(server.spec.version).toBe('2.1.0');
    expect(createNamespacedCustomObject).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'games',
        plural: 'factorioservers',
      }),
    );
  });

  it('rejects an invalid name without calling the API', async () => {
    await expect(service.create({ name: 'Not Valid' })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(createNamespacedCustomObject).not.toHaveBeenCalled();
  });

  it('rejects an invalid seed', async () => {
    await expect(
      service.create({ name: 'my-server', mapGenSettings: { seed: 5_000_000_000 } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps a 404 to NotFoundException', async () => {
    getNamespacedCustomObject.mockRejectedValue(
      new ApiException(404, 'Not Found', undefined, {}),
    );

    await expect(service.get('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
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
