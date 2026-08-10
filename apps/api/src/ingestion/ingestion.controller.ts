import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import type { IngestionResponse } from './ingestion.types';

@Controller('ingestion')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  run(): Promise<IngestionResponse> {
    return this.ingestionService.run();
  }
}
