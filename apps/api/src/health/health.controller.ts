import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { Public } from '../auth/public.decorator.js';
import { KubernetesService } from '../kubernetes/kubernetes.service.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly kubernetes: KubernetesService) {}

  @Get()
  check() {
    return {
      status: 'ok',
      service: 'factorio-api',
      version: this.version(),
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
      version: this.version(),
      timestamp: new Date().toISOString(),
    };
  }

  private version(): string {
    return process.env.APP_VERSION || 'dev';
  }
}
