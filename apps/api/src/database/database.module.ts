import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { POSTGRES_POOL } from './database.constants';
import { DatabaseService } from './database.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: POSTGRES_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Pool =>
        new Pool({
          host: config.get<string>('POSTGRES_HOST', 'localhost'),
          port: Number(config.get<string>('POSTGRES_PORT', '5432')),
          database: config.get<string>('POSTGRES_DB', 'techbrief'),
          user: config.get<string>('POSTGRES_USER', 'techbrief'),
          password: config.get<string>(
            'POSTGRES_PASSWORD',
            'techbrief_dev_password',
          ),
        }),
    },
    DatabaseService,
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
