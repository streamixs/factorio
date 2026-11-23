import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { KubernetesService } from '../kubernetes/kubernetes.service.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;
  const checkReadiness = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: KubernetesService,
          useValue: { checkReadiness },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('answers the liveness probe', () => {
    expect(controller.check()).toMatchObject({
      status: 'ok',
      service: 'factorio-api',
    });
  });

  it('reports ready when Kubernetes is reachable', async () => {
    checkReadiness.mockResolvedValue(true);

    await expect(controller.ready()).resolves.toMatchObject({
      status: 'ok',
      service: 'factorio-api',
    });
  });

  it('returns 503 when Kubernetes is unreachable', async () => {
    checkReadiness.mockResolvedValue(false);

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
