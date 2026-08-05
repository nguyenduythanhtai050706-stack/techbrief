import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';
import type { HealthReport } from './health.types';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async getHealth(
    @Res({ passthrough: true }) response: Response,
  ): Promise<HealthReport> {
    const result = await this.healthService.check();
    response.status(result.statusCode);
    return result.body;
  }
}
