import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateSourceDto } from './dto/create-source.dto';
import { SourcesService } from './sources.service';
import type { Source } from './source.types';

@Controller('sources')
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Get()
  getSources(): Promise<Source[]> {
    return this.sourcesService.list();
  }

  @Post()
  createSource(@Body() dto: CreateSourceDto): Promise<Source> {
    return this.sourcesService.create(dto);
  }
}
