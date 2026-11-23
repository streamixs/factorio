import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import type { Request, Response } from 'express';
import type {
  CreateFactorioServerInput,
  EffectiveSettings,
  FactorioServer,
  ServerBackups,
  ServerConnection,
  ServerEvent,
  ServerLogs,
  ServerOperation,
  ServerSettingsJson,
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

  @Get('schema')
  schema(): Promise<Record<string, unknown>> {
    return this.servers.schema();
  }

  @Get(':name/settings-json')
  settingsJson(@Param('name') name: string): Promise<ServerSettingsJson> {
    return this.servers.settingsJson(name);
  }

  @Get('versions')
  versions(): Promise<string[]> {
    return this.servers.versions();
  }

  @Get('storage-classes')
  storageClasses(): Promise<string[]> {
    return this.servers.storageClasses();
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

    if (backup.contentLength !== undefined) {
      response.set('Content-Length', String(backup.contentLength));
    }

    response.on('close', () => backup.stream.destroy());
    return new StreamableFile(backup.stream);
  }

  @Post(':name/backups/:file/restore')
  @HttpCode(HttpStatus.OK)
  restoreBackup(
    @Param('name') name: string,
    @Param('file') file: string,
  ): Promise<{ operation: string }> {
    return this.servers.restoreBackup(name, file);
  }

  @Get(':name/operations')
  operations(@Param('name') name: string): Promise<ServerOperation[]> {
    return this.servers.operations(name);
  }

  @Post(':name/import')
  @HttpCode(HttpStatus.OK)
  importSave(
    @Param('name') name: string,
    @Req() request: Request,
    @Headers('content-length') contentLength?: string,
  ): Promise<{ operation: string }> {
    return this.servers.importSave(name, request, contentLength);
  }

  @Get(':name/imports/:token')
  async downloadImport(
    @Param('name') name: string,
    @Param('token') token: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const imported = this.servers.claimImport(name, token);
    response.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${imported.filename}"`,
    });

    return new StreamableFile(createReadStream(imported.path));
  }

  @Post(':name/rcon')
  @HttpCode(HttpStatus.OK)
  rcon(
    @Param('name') name: string,
    @Body() input: unknown,
  ): Promise<{ output: string }> {
    return this.servers.rcon(name, input);
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
