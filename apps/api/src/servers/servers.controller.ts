import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import type {
  CreateFactorioServerInput,
  FactorioServer,
} from '@factorio/shared';

import { ServersService } from './servers.service.js';

@Controller('api/servers')
export class ServersController {
  constructor(private readonly servers: ServersService) {}

  @Get()
  list(): Promise<FactorioServer[]> {
    return this.servers.list();
  }

  @Get(':name')
  get(@Param('name') name: string): Promise<FactorioServer> {
    return this.servers.get(name);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() input: CreateFactorioServerInput): Promise<FactorioServer> {
    return this.servers.create(input);
  }

  @Delete(':name')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('name') name: string): Promise<void> {
    await this.servers.remove(name);
  }
}
