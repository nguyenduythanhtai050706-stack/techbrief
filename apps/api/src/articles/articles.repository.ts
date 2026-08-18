import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type {
  ArticleListQuery,
  ArticlePersistenceInput,
  ArticlePersistenceOutcome,
  ArticleRecord,
  ArticleSourceView,
  ArticleView,
} from './article.types';

interface ArticleViewRow {
  id: number;
  canonical_url: string;
  title: string;
  summary: string | null;
  published_at: Date | string | null;
  author: string | null;
  categories: string[];
  created_at: Date | string;
  last_seen_at: Date | string;
  sources: ArticleSourceView[];
}

@Injectable()
export class ArticlesRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(
    query: ArticleListQuery,
  ): Promise<{ items: ArticleView[]; totalItems: number }> {
    const { where, values } = this.buildFilterClause(query);
    const total = await this.database.query<{ total_items: number }>(
      `SELECT COUNT(*)::int AS total_items
       FROM articles article
       ${where}`,
      values,
    );
    const paginationValues = [
      ...values,
      query.limit,
      (query.page - 1) * query.limit,
    ];
    const rows = await this.database.query<ArticleViewRow>(
      `${this.articleSelect(where)}
       ORDER BY COALESCE(article.published_at, article.created_at) DESC, article.id DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      paginationValues,
    );

    return {
      totalItems: total.rows[0]?.total_items ?? 0,
      items: rows.rows.map((row) => this.mapArticle(row)),
    };
  }

  async findById(id: number): Promise<ArticleView | null> {
    const result = await this.database.query<ArticleViewRow>(
      `${this.articleSelect('WHERE article.id = $1')}`,
      [id],
    );

    return result.rows[0] ? this.mapArticle(result.rows[0]) : null;
  }

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

  private buildFilterClause(query: ArticleListQuery): {
    where: string;
    values: unknown[];
  } {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (query.sourceId !== null) {
      values.push(query.sourceId);
      conditions.push(
        `EXISTS (SELECT 1 FROM article_sources article_source_filter
         WHERE article_source_filter.article_id = article.id
           AND article_source_filter.source_id = $${values.length})`,
      );
    }
    if (query.from !== null) {
      values.push(query.from);
      conditions.push(
        `COALESCE(article.published_at, article.created_at) >= $${values.length}`,
      );
    }
    if (query.to !== null) {
      values.push(query.to);
      conditions.push(
        `COALESCE(article.published_at, article.created_at) <= $${values.length}`,
      );
    }

    return {
      where: conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`,
      values,
    };
  }

  private articleSelect(where: string): string {
    return `SELECT
      article.id,
      article.canonical_url,
      article.title,
      article.summary,
      article.published_at,
      article.author,
      article.categories,
      article.created_at,
      article.last_seen_at,
      COALESCE(
        jsonb_agg(
          jsonb_build_object('id', source.id, 'name', source.name, 'url', source.url)
          ORDER BY source.id ASC
        ) FILTER (WHERE source.id IS NOT NULL),
        '[]'::jsonb
      ) AS sources
    FROM articles article
    LEFT JOIN article_sources article_source ON article_source.article_id = article.id
    LEFT JOIN sources source ON source.id = article_source.source_id
    ${where}
    GROUP BY article.id`;
  }

  private mapArticle(row: ArticleViewRow): ArticleView {
    return {
      id: row.id,
      canonicalUrl: row.canonical_url,
      title: row.title,
      summary: row.summary,
      publishedAt: this.toIsoString(row.published_at),
      author: row.author,
      categories: row.categories,
      createdAt: this.toIsoString(row.created_at),
      lastSeenAt: this.toIsoString(row.last_seen_at),
      sources: row.sources,
    };
  }

  private toIsoString(value: Date | string): string;
  private toIsoString(value: Date | string | null): string | null;
  private toIsoString(value: Date | string | null): string | null {
    if (value === null) return null;
    return value instanceof Date ? value.toISOString() : value;
  }
}
