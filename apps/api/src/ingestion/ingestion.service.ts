import { Injectable, Logger } from '@nestjs/common';
import { SourcesService } from '../sources/sources.service';
import { FeedReaderError, FeedReaderService } from './feed-reader.service';
import type {
  IngestionResponse,
  IngestionSourceResult,
} from './ingestion.types';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly sourcesService: SourcesService,
    private readonly feedReader: FeedReaderService,
  ) {}

  async run(): Promise<IngestionResponse> {
    const sources = await this.sourcesService.list();
    const settledReads = await Promise.allSettled(
      sources.map((source) => this.feedReader.read(source.url)),
    );

    const sourceResults: IngestionSourceResult[] = settledReads.map(
      (result, index) => {
        const source = sources[index];

        if (result.status === 'fulfilled') {
          return {
            sourceId: source.id,
            sourceName: source.name,
            sourceUrl: source.url,
            status: 'ok',
            items: result.value.items,
            skippedItems: result.value.skippedItems,
          };
        }

        if (result.reason instanceof FeedReaderError) {
          this.logger.warn(
            'Failed to ingest source ' + source.id + ': ' + result.reason.code,
          );

          return {
            sourceId: source.id,
            sourceName: source.name,
            sourceUrl: source.url,
            status: 'error',
            items: [],
            skippedItems: 0,
            error: { code: result.reason.code },
          };
        }

        throw result.reason;
      },
    );

    const successfulSources = sourceResults.filter(
      (source) => source.status === 'ok',
    ).length;
    const failedSources = sourceResults.length - successfulSources;
    const totalItems = sourceResults.reduce(
      (total, source) => total + source.items.length,
      0,
    );

    const status =
      failedSources === 0
        ? 'completed'
        : successfulSources === 0
          ? 'failed'
          : 'partial';

    return {
      status,
      summary: {
        totalSources: sourceResults.length,
        successfulSources,
        failedSources,
        totalItems,
      },
      sources: sourceResults,
    };
  }
}
