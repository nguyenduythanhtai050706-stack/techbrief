import { Injectable, Logger, Optional } from '@nestjs/common';
import { ArticleBriefService } from '../articles/article-brief.service';
import {
  ArticlePersistenceError,
  ArticlePersistenceService,
} from '../articles/article-persistence.service';
import { ArticlesCacheService } from '../articles/articles-cache.service';
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
    private readonly persistence: ArticlePersistenceService,
    private readonly articlesCache: ArticlesCacheService,
    @Optional() private readonly briefs?: ArticleBriefService,
  ) {}

  async run(): Promise<IngestionResponse> {
    const sources = await this.sourcesService.list();
    const settledReads = await Promise.allSettled(
      sources.map((source) => this.feedReader.read(source.url)),
    );

    const sourceResults: IngestionSourceResult[] = [];

    for (const [index, result] of settledReads.entries()) {
      const source = sources[index];

      if (result.status === 'fulfilled') {
        try {
          let insertedItems = 0;
          let duplicateItems = 0;

          for (const preview of result.value.items) {
            const outcome = await this.persistence.persist(source.id, preview);
            if (outcome === 'inserted') insertedItems += 1;
            else duplicateItems += 1;
          }

          sourceResults.push({
            sourceId: source.id,
            sourceName: source.name,
            sourceUrl: source.url,
            status: 'ok',
            items: result.value.items,
            skippedItems: result.value.skippedItems,
            insertedItems,
            duplicateItems,
          });
        } catch (error: unknown) {
          if (!(error instanceof ArticlePersistenceError)) throw error;

          this.logger.warn(
            'Failed to persist source ' + source.id + ': ' + error.code,
          );
          sourceResults.push({
            sourceId: source.id,
            sourceName: source.name,
            sourceUrl: source.url,
            status: 'error',
            items: [],
            skippedItems: 0,
            error: { code: error.code },
          });
        }
        continue;
      }

      if (result.reason instanceof FeedReaderError) {
        this.logger.warn(
          'Failed to ingest source ' + source.id + ': ' + result.reason.code,
        );

        sourceResults.push({
          sourceId: source.id,
          sourceName: source.name,
          sourceUrl: source.url,
          status: 'error',
          items: [],
          skippedItems: 0,
          error: { code: result.reason.code },
        });
        continue;
      }

      throw result.reason;
    }

    const successfulSources = sourceResults.filter(
      (source) => source.status === 'ok',
    ).length;
    const failedSources = sourceResults.length - successfulSources;
    const totalItems = sourceResults.reduce(
      (total, source) => total + source.items.length,
      0,
    );

    if (successfulSources > 0) {
      await this.articlesCache.invalidateArticles();
    }

    let enrichment: IngestionResponse['enrichment'];
    if (successfulSources > 0 && this.briefs) {
      try { enrichment = await this.briefs.run(); }
      catch { enrichment = { status: 'partial', processed: 0, failed: 1, error: 'BRIEF_FAILED' }; }
    }

    const status =
      failedSources === 0
        ? 'completed'
        : successfulSources === 0
          ? 'failed'
          : 'partial';

    return {
      status,
      ...(enrichment ? { enrichment } : {}),
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
