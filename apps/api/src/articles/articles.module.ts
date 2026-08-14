import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ArticleDeduplicator } from './article-deduplicator';
import { ArticlePersistenceService } from './article-persistence.service';
import { ArticlesRepository } from './articles.repository';

@Module({
  imports: [DatabaseModule],
  providers: [
    ArticleDeduplicator,
    ArticlesRepository,
    ArticlePersistenceService,
  ],
  exports: [ArticlePersistenceService],
})
export class ArticlesModule {}
