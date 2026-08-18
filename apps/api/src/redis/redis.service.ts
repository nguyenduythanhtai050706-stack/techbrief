import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { RedisClientType } from 'redis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private connecting: Promise<void> | undefined;

  constructor(
    @Inject(REDIS_CLIENT) private readonly client: RedisClientType,
  ) {
    this.client.on('error', (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Redis client error: ${message}`);
    });
  }

  async ping(): Promise<string> {
    await this.ensureConnected();
    return this.client.ping();
  }

  async get(key: string): Promise<string | null> {
    await this.ensureConnected();
    return this.client.get(key);
  }

  async set(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.ensureConnected();
    await this.client.set(key, value, { EX: ttlSeconds });
  }

  async increment(key: string): Promise<number> {
    await this.ensureConnected();
    return this.client.incr(key);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.client.isOpen) {
      return;
    }

    this.connecting ??= this.client
      .connect()
      .then(() => undefined)
      .finally(() => {
        this.connecting = undefined;
      });

    await this.connecting;
  }
}
