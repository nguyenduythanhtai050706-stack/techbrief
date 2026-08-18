import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { ArticleDeduplicator } from './article-deduplicator';
import { ArticlePersistenceService } from './article-persistence.service';
import { ArticlesCacheService } from './articles-cache.service';
import { ArticlesController } from './articles.controller';
import { ArticlesQueryService } from './articles-query.service';
import { ArticlesRepository } from './articles.repository';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [ArticlesController],
  providers: [
    ArticleDeduplicator,
    ArticlesRepository,
    ArticlePersistenceService,
    ArticlesCacheService,
    ArticlesQueryService,
  ],
  exports: [ArticlePersistenceService, ArticlesCacheService],
})
export class ArticlesModule {}
