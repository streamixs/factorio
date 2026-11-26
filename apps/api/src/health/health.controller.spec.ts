import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { KubernetesService } from '../kubernetes/kubernetes.service.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;
  const checkReadiness = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv('APP_VERSION', 'dev');

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

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('answers the liveness probe', () => {
    expect(controller.check()).toMatchObject({
      status: 'ok',
      service: 'factorio-api',
      version: 'dev',
    });
  });

  it('reports the configured application version', () => {
    vi.stubEnv('APP_VERSION', 'v1.2.3');

    expect(controller.check()).toMatchObject({
      status: 'ok',
      version: 'v1.2.3',
    });
  });

  it('falls back to dev when APP_VERSION is empty', () => {
    vi.stubEnv('APP_VERSION', '');

    expect(controller.check()).toMatchObject({ version: 'dev' });
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
