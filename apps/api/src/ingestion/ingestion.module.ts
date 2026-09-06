import { Module } from '@nestjs/common';
import { createFeedParser } from './feed-parser';
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
      useFactory: createFeedParser,
    },
    FeedReaderService,
    IngestionService,
    IngestionSchedulerService,
  ],
  exports: [FeedReaderService, IngestionService],
})
export class IngestionModule {}
