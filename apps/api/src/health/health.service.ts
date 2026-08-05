import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import type { HealthCheckResult, HealthReport } from './health.types';

@Injectable()
export class HealthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthCheckResult> {
    const [postgresResult, redisResult] = await Promise.allSettled([
      this.database.query('SELECT 1'),
      this.redis.ping(),
    ]);
    const postgres = postgresResult.status === 'fulfilled' ? 'up' : 'down';
    const redis = redisResult.status === 'fulfilled' ? 'up' : 'down';
    const healthy = postgres === 'up' && redis === 'up';
    const body: HealthReport = {
      status: healthy ? 'ok' : 'degraded',
      postgres,
      redis,
    };

    return {
      statusCode: healthy ? 200 : 503,
      body,
    };
  }
}
