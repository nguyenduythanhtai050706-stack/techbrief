import { Module } from '@nestjs/common';
import Parser from 'rss-parser';
import { ArticlesModule } from '../articles/articles.module';
import { SourcesModule } from '../sources/sources.module';
import { RSS_PARSER } from './ingestion.constants';
import { IngestionController } from './ingestion.controller';
import { IngestionSchedulerService } from './ingestion-scheduler.service';
import { FeedReaderService } from './feed-reader.service';
import { IngestionService } from './ingestion.service';

@Module({
  imports: [SourcesModule, ArticlesModule],
  controllers: [IngestionController],
  providers: [
    {
      provide: RSS_PARSER,
      useFactory: () =>
        new Parser({
          timeout: 10_000,
          maxRedirects: 5,
          headers: { 'User-Agent': 'TechBrief/0.1' },
        }),
    },
    FeedReaderService,
    IngestionService,
    IngestionSchedulerService,
  ],
  exports: [FeedReaderService, IngestionService],
})
export class IngestionModule {}
