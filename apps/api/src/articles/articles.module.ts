import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { ArticleDeduplicator } from './article-deduplicator';
import { ArticlePersistenceService } from './article-persistence.service';
import { ArticlesCacheService } from './articles-cache.service';
import { ArticlesController } from './articles.controller';
import { ArticlesQueryService } from './articles-query.service';
import { ArticlesRepository } from './articles.repository';
import { ConfigModule } from '@nestjs/config';
import { ArticleBriefRepository } from './article-brief.repository';
import { ArticleBriefService } from './article-brief.service';
import { GeminiBriefService } from './gemini-brief.service';

@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule],
  controllers: [ArticlesController],
  providers: [
    ArticleBriefRepository, ArticleBriefService, GeminiBriefService,
    ArticleDeduplicator,
    ArticlesRepository,
    ArticlePersistenceService,
    ArticlesCacheService,
    ArticlesQueryService,
  ],
  exports: [ArticlePersistenceService, ArticlesCacheService, ArticleBriefService],
})
export class ArticlesModule {}
