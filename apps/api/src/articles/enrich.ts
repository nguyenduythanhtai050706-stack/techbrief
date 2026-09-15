import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ArticlesModule } from './articles.module';
import { ArticleBriefService } from './article-brief.service';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), ArticlesModule] })
class EnrichModule {}

async function run() {
  const app = await NestFactory.createApplicationContext(EnrichModule, { logger: ['error', 'warn'] });
  try {
    const result = await app.get(ArticleBriefService).run();
    console.log(JSON.stringify(result));
    if (result.status === 'partial' || result.status === 'disabled') process.exitCode = 1;
  } finally { await app.close(); }
}
run().catch(() => { console.error('ENRICHMENT_FAILED: check database connectivity and migrations.'); process.exitCode = 1; });
