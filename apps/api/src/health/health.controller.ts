import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { KubernetesService } from '../kubernetes/kubernetes.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly kubernetes: KubernetesService) {}

  @Get()
  check() {
    return {
      status: 'ok',
      service: 'factorio-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready() {
    if (!(await this.kubernetes.checkReadiness())) {
      throw new ServiceUnavailableException('Kubernetes API is not reachable');
    }

    return {
      status: 'ok',
      service: 'factorio-api',
      timestamp: new Date().toISOString(),
    };
  }
}
