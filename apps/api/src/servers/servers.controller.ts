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
  Query,
} from '@nestjs/common';
import type {
  CreateFactorioServerInput,
  EffectiveSettings,
  FactorioServer,
  ServerEvent,
  ServerLogs,
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

  @Get(':name/logs')
  logs(
    @Param('name') name: string,
    @Query('tailLines') tailLines?: string,
    @Query('previous') previous?: string,
  ): Promise<ServerLogs> {
    return this.servers.logs(name, {
      tailLines:
        tailLines === undefined ? undefined : Number.parseInt(tailLines, 10),
      previous: previous === 'true',
    });
  }

  @Get(':name/events')
  events(@Param('name') name: string): Promise<ServerEvent[]> {
    return this.servers.events(name);
  }

  @Get(':name/effective')
  effective(@Param('name') name: string): Promise<EffectiveSettings> {
    return this.servers.effective(name);
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
