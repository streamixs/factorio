import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiextensionsV1Api,
  BatchV1Api,
  CoreV1Api,
  CustomObjectsApi,
  KubeConfig,
} from '@kubernetes/client-node';

interface KubernetesClients {
  custom: CustomObjectsApi;
  core: CoreV1Api;
  batch: BatchV1Api;
  apiextensions: ApiextensionsV1Api;
}

/**
 * Owns the Kubernetes clients. The API runs either in-cluster
 * (ServiceAccount) or locally against the current kubeconfig context.
 */
@Injectable()
export class KubernetesService {
  readonly namespace: string;

  private readonly logger = new Logger(KubernetesService.name);
  private readonly clients: KubernetesClients | null;

  constructor() {
    this.namespace = process.env.FACTORIO_NAMESPACE ?? 'default';
    this.clients = this.createClients();
  }

  get customObjects(): CustomObjectsApi {
    return this.requireClients().custom;
  }

  get core(): CoreV1Api {
    return this.requireClients().core;
  }

  get batch(): BatchV1Api {
    return this.requireClients().batch;
  }

  get apiextensions(): ApiextensionsV1Api {
    return this.requireClients().apiextensions;
  }

  private requireClients(): KubernetesClients {
    if (this.clients === null) {
      throw new ServiceUnavailableException(
        'Kubernetes client is not configured',
      );
    }

    return this.clients;
  }

  private createClients(): KubernetesClients | null {
    try {
      const kubeConfig = new KubeConfig();

      if (process.env.KUBERNETES_SERVICE_HOST) {
        kubeConfig.loadFromCluster();
      } else {
        kubeConfig.loadFromDefault();
      }

      return {
        custom: kubeConfig.makeApiClient(CustomObjectsApi),
        core: kubeConfig.makeApiClient(CoreV1Api),
        batch: kubeConfig.makeApiClient(BatchV1Api),
        apiextensions: kubeConfig.makeApiClient(ApiextensionsV1Api),
      };
    } catch (error) {
      this.logger.warn(
        `Kubernetes client is unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
