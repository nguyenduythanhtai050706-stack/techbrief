import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DatabaseService } from './database.service';

async function runMigration(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const migrationPath = resolve(
      process.cwd(),
      'src/database/migrations/001_create_sources.sql',
    );
    const migration = await readFile(migrationPath, 'utf8');

    await app.get(DatabaseService).query(migration);
    console.log('Migration 001_create_sources completed.');
  } finally {
    await app.close();
  }
}

runMigration().catch((error: unknown) => {
  console.error('Database migration failed.', error);
  process.exitCode = 1;
});
