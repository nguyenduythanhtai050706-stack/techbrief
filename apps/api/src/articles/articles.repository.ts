import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type {
  ArticlePersistenceInput,
  ArticlePersistenceOutcome,
  ArticleRecord,
} from './article.types';

@Injectable()
export class ArticlesRepository {
  constructor(private readonly database: DatabaseService) {}

  async persist(
    input: ArticlePersistenceInput,
  ): Promise<ArticlePersistenceOutcome> {
    const existing = await this.findExisting(input);
    if (existing) {
      await this.markDuplicate(existing, input);
      return 'duplicate';
    }

    try {
      const inserted = await this.insert(input);
      await this.associate(inserted.id, input);
      return 'inserted';
    } catch (error: unknown) {
      if ((error as { code?: string }).code !== '23505') throw error;
      const racedArticle = await this.findExisting(input);
      if (!racedArticle) throw error;
      await this.markDuplicate(racedArticle, input);
      return 'duplicate';
    }
  }

  private async findExisting(
    input: ArticlePersistenceInput,
  ): Promise<ArticleRecord | null> {
    const canonical = await this.database.query<ArticleRecord>(
      'SELECT id, canonical_url, content_fingerprint FROM articles WHERE canonical_url = $1 LIMIT 1',
      [input.canonicalUrl],
    );
    if (canonical.rows[0]) return canonical.rows[0];
    if (input.contentFingerprint === null) return null;
    const fingerprint = await this.database.query<ArticleRecord>(
      'SELECT id, canonical_url, content_fingerprint FROM articles WHERE content_fingerprint = $1 LIMIT 1',
      [input.contentFingerprint],
    );
    return fingerprint.rows[0] ?? null;
  }

  private async insert(input: ArticlePersistenceInput): Promise<ArticleRecord> {
    const inserted = await this.database.query<ArticleRecord>(
      `INSERT INTO articles (
        canonical_url, content_fingerprint, title, summary, published_at, categories, author
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      RETURNING id, canonical_url, content_fingerprint`,
      [
        input.canonicalUrl,
        input.contentFingerprint,
        input.title,
        input.summary,
        input.publishedAt,
        JSON.stringify(input.categories),
        input.author,
      ],
    );
    return inserted.rows[0];
  }

  private async markDuplicate(
    article: ArticleRecord,
    input: ArticlePersistenceInput,
  ): Promise<void> {
    await this.database.query(
      'UPDATE articles SET last_seen_at = NOW() WHERE id = $1',
      [article.id],
    );
    await this.associate(article.id, input);
  }

  private async associate(
    articleId: number,
    input: ArticlePersistenceInput,
  ): Promise<void> {
    await this.database.query(
      `INSERT INTO article_sources (article_id, source_id, external_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (article_id, source_id, external_id)
       DO UPDATE SET last_seen_at = NOW()`,
      [articleId, input.sourceId, input.externalId],
    );
  }
}
