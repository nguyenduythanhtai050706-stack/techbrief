import { Injectable } from '@nestjs/common';
import type { NormalizedArticlePreview } from '../ingestion/ingestion.types';
import { ArticleDeduplicator } from './article-deduplicator';
import type { ArticlePersistenceOutcome } from './article.types';
import { ArticlesRepository } from './articles.repository';

export class ArticlePersistenceError extends Error {
  readonly code = 'PERSIST_FAILED' as const;

  constructor() {
    super('PERSIST_FAILED');
    this.name = 'ArticlePersistenceError';
  }
}

@Injectable()
export class ArticlePersistenceService {
  constructor(
    private readonly deduplicator: ArticleDeduplicator,
    private readonly repository: ArticlesRepository,
  ) {}

  async persist(
    sourceId: number,
    preview: NormalizedArticlePreview,
  ): Promise<ArticlePersistenceOutcome> {
    try {
      return await this.repository.persist({
        ...this.deduplicator.prepare(preview),
        sourceId,
      });
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        typeof (error as { code?: unknown }).code === 'string'
      ) {
        throw new ArticlePersistenceError();
      }
      throw error;
    }
  }
}
