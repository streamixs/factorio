import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApiException } from '@kubernetes/client-node';
import type {
  CreateFactorioServerInput,
  FactorioServer,
  FactorioServerList,
} from '@factorio/shared';

import { KubernetesService } from '../kubernetes/kubernetes.service.js';

const GROUP = 'games.dev.streamixs.com';
const VERSION = 'v1alpha1';
const PLURAL = 'factorioservers';
const DEFAULT_VERSION = '2.1.0';

const NAME_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const SIZE_PATTERN =
  /^(\+|-)?(([0-9]+(\.[0-9]*)?)|(\.[0-9]+))(([KMGTPE]i)|[numkMGTPE]|([eE](\+|-)?(([0-9]+(\.[0-9]*)?)|(\.[0-9]+))))?$/;
const SERVICE_TYPES = new Set(['ClusterIP', 'NodePort', 'LoadBalancer']);
const MAX_SEED = 4_294_967_295;

@Injectable()
export class ServersService {
  constructor(private readonly kubernetes: KubernetesService) {}

  async list(): Promise<FactorioServer[]> {
    const result = await this.call(() =>
      this.kubernetes.customObjects.listNamespacedCustomObject({
        group: GROUP,
        version: VERSION,
        namespace: this.kubernetes.namespace,
        plural: PLURAL,
      }),
    );

    return (result as FactorioServerList).items ?? [];
  }

  async get(name: string): Promise<FactorioServer> {
    this.assertName(name);

    const result = await this.call(() =>
      this.kubernetes.customObjects.getNamespacedCustomObject({
        group: GROUP,
        version: VERSION,
        namespace: this.kubernetes.namespace,
        plural: PLURAL,
        name,
      }),
    );

    return result as FactorioServer;
  }

  async create(input: CreateFactorioServerInput): Promise<FactorioServer> {
    this.assertCreateInput(input);

    const server: FactorioServer = {
      apiVersion: `${GROUP}/${VERSION}`,
      kind: 'FactorioServer',
      metadata: {
        name: input.name,
        namespace: this.kubernetes.namespace,
      },
      spec: {
        version: input.version ?? DEFAULT_VERSION,
        server: input.server,
        mapGenSettings: input.mapGenSettings,
        mapSettings: input.mapSettings,
        storage: input.storage,
        service: input.service,
      },
    };

    const result = await this.call(() =>
      this.kubernetes.customObjects.createNamespacedCustomObject({
        group: GROUP,
        version: VERSION,
        namespace: this.kubernetes.namespace,
        plural: PLURAL,
        body: server,
      }),
    );

    return result as FactorioServer;
  }

  async remove(name: string): Promise<void> {
    this.assertName(name);

    await this.call(() =>
      this.kubernetes.customObjects.deleteNamespacedCustomObject({
        group: GROUP,
        version: VERSION,
        namespace: this.kubernetes.namespace,
        plural: PLURAL,
        name,
        propagationPolicy: 'Background',
      }),
    );
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ApiException) {
        switch (error.code) {
          case 404:
            throw new NotFoundException('FactorioServer not found');
          case 409:
            throw new ConflictException('FactorioServer already exists');
          case 422:
            throw new BadRequestException('FactorioServer is invalid');
          default:
            break;
        }
      }

      throw error;
    }
  }

  private assertName(name: string): void {
    if (
      typeof name !== 'string' ||
      name.length === 0 ||
      name.length > 63 ||
      !NAME_PATTERN.test(name)
    ) {
      throw new BadRequestException(
        'name must be a valid DNS-1123 label (lowercase alphanumeric and dashes, at most 63 characters)',
      );
    }
  }

  private assertCreateInput(input: CreateFactorioServerInput): void {
    if (input === null || typeof input !== 'object') {
      throw new BadRequestException('request body is required');
    }

    this.assertName(input.name);

    if (input.version !== undefined && !VERSION_PATTERN.test(input.version)) {
      throw new BadRequestException('version must look like 2.1.0');
    }

    if (
      input.storage?.size !== undefined &&
      !SIZE_PATTERN.test(input.storage.size)
    ) {
      throw new BadRequestException(
        'storage.size must be a Kubernetes quantity such as 10Gi',
      );
    }

    if (
      input.service?.type !== undefined &&
      !SERVICE_TYPES.has(input.service.type)
    ) {
      throw new BadRequestException(
        'service.type must be ClusterIP, NodePort or LoadBalancer',
      );
    }

    const maxPlayers = input.server?.access?.maxPlayers;
    if (
      maxPlayers !== undefined &&
      (!Number.isInteger(maxPlayers) || maxPlayers < 0)
    ) {
      throw new BadRequestException(
        'server.access.maxPlayers must be a positive integer',
      );
    }

    const seed = input.mapGenSettings?.seed;
    if (
      seed !== undefined &&
      (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED)
    ) {
      throw new BadRequestException(
        `mapGenSettings.seed must be an integer between 0 and ${MAX_SEED}`,
      );
    }
  }
}
