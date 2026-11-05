import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthController } from './health/health.controller.js';
import { KubernetesModule } from './kubernetes/kubernetes.module.js';
import { ServersModule } from './servers/servers.module.js';

@Module({
  imports: [KubernetesModule, ServersModule],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
