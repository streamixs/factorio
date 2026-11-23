import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ApiTokenGuard } from './auth/api-token.guard.js';
import { HealthController } from './health/health.controller.js';
import { KubernetesModule } from './kubernetes/kubernetes.module.js';
import { ServersModule } from './servers/servers.module.js';

@Module({
  imports: [KubernetesModule, ServersModule],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ApiTokenGuard,
    },
  ],
})
export class AppModule {}
