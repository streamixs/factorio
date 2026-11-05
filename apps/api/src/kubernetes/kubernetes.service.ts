import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { CustomObjectsApi, KubeConfig } from '@kubernetes/client-node';

/**
 * Owns the Kubernetes client. The API runs either in-cluster (ServiceAccount)
 * or locally against the current kubeconfig context.
 */
@Injectable()
export class KubernetesService {
  readonly namespace: string;

  private readonly logger = new Logger(KubernetesService.name);
  private readonly client: CustomObjectsApi | null;

  constructor() {
    this.namespace = process.env.FACTORIO_NAMESPACE ?? 'default';
    this.client = this.createClient();
  }

  get customObjects(): CustomObjectsApi {
    if (this.client === null) {
      throw new ServiceUnavailableException(
        'Kubernetes client is not configured',
      );
    }

    return this.client;
  }

  private createClient(): CustomObjectsApi | null {
    try {
      const kubeConfig = new KubeConfig();

      if (process.env.KUBERNETES_SERVICE_HOST) {
        kubeConfig.loadFromCluster();
      } else {
        kubeConfig.loadFromDefault();
      }

      return kubeConfig.makeApiClient(CustomObjectsApi);
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
