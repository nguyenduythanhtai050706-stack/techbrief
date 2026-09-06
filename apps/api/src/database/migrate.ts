import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database.module';
import { DatabaseService } from './database.service';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule] })
class MigrationModule {}

async function runMigration(): Promise<void> {
  const app = await NestFactory.createApplicationContext(MigrationModule, {
    logger: ['error', 'warn'],
  });

  try {
    const migrationFiles = [
      '001_create_sources.sql',
      '002_create_articles.sql',
      '003_add_article_images.sql',
    ] as const;

    for (const fileName of migrationFiles) {
      const migrationPath = resolve(
        process.cwd(),
        'src/database/migrations',
        fileName,
      );
      const migration = await readFile(migrationPath, 'utf8');

      await app.get(DatabaseService).query(migration);
      console.log(`Migration ${fileName} completed.`);
    }
  } finally {
    await app.close();
  }
}

runMigration().catch((error: unknown) => {
  console.error('Database migration failed.', error);
  process.exitCode = 1;
});
