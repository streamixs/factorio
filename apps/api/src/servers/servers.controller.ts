import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type {
  CreateFactorioServerInput,
  FactorioServer,
  UpdateFactorioServerInput,
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

  @Patch(':name')
  update(
    @Param('name') name: string,
    @Body() input: UpdateFactorioServerInput,
  ): Promise<FactorioServer> {
    return this.servers.update(name, input);
  }

  @Post(':name/start')
  @HttpCode(HttpStatus.OK)
  start(@Param('name') name: string): Promise<FactorioServer> {
    return this.servers.setSuspended(name, false);
  }

  @Post(':name/stop')
  @HttpCode(HttpStatus.OK)
  stop(@Param('name') name: string): Promise<FactorioServer> {
    return this.servers.setSuspended(name, true);
  }

  @Delete(':name')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('name') name: string): Promise<void> {
    await this.servers.remove(name);
  }
}
