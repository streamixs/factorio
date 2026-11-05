import { Module } from '@nestjs/common';

import { KubernetesModule } from '../kubernetes/kubernetes.module.js';
import { ServersController } from './servers.controller.js';
import { ServersService } from './servers.service.js';

@Module({
  imports: [KubernetesModule],
  controllers: [ServersController],
  providers: [ServersService],
})
export class ServersModule {}
