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
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import type {
  CreateFactorioServerInput,
  EffectiveSettings,
  FactorioServer,
  ServerBackups,
  ServerConnection,
  ServerEvent,
  ServerLogs,
  ServerUsage,
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

  @Get(':name/connection')
  connection(@Param('name') name: string): Promise<ServerConnection> {
    return this.servers.connection(name);
  }

  @Get(':name/usage')
  usage(@Param('name') name: string): Promise<ServerUsage> {
    return this.servers.usage(name);
  }

  @Get(':name/backups')
  backups(@Param('name') name: string): Promise<ServerBackups> {
    return this.servers.backups(name);
  }

  @Get(':name/backups/:file')
  async downloadBackup(
    @Param('name') name: string,
    @Param('file') file: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const backup = await this.servers.downloadBackup(name, file);
    response.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${backup.filename}"`,
    });

    return new StreamableFile(backup.data);
  }

  @Post(':name/backups/:file/restore')
  @HttpCode(HttpStatus.OK)
  restoreBackup(
    @Param('name') name: string,
    @Param('file') file: string,
  ): Promise<{ save: string; job: string }> {
    return this.servers.restoreBackup(name, file);
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
