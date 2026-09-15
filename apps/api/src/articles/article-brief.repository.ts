import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { ArticleBrief } from './article-brief.types';

export interface BriefInput { id: number; title: string; summary: string | null; input_hash: string }
const inputHash = "md5(title || E'\\n' || COALESCE(summary, ''))";

@Injectable()
export class ArticleBriefRepository {
  constructor(private readonly database: DatabaseService) {}

  async claim(token: string): Promise<BriefInput | null> {
    const result = await this.database.query<BriefInput>(`
      WITH candidate AS (
        SELECT id FROM articles
        WHERE brief_input_hash IS DISTINCT FROM ${inputHash}
          AND (brief_lease_until IS NULL OR brief_lease_until < NOW())
          AND (brief_retry_at IS NULL OR brief_retry_at <= NOW())
          AND canonical_url ~ '^https?://'
        ORDER BY COALESCE(published_at, created_at) DESC, id DESC
        FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE articles SET brief_claim = $1, brief_lease_until = NOW() + INTERVAL '2 minutes'
      WHERE id = (SELECT id FROM candidate)
      RETURNING id, title, summary, ${inputHash} AS input_hash`, [token]);
    return result.rows[0] ?? null;
  }

  async save(input: BriefInput, token: string, model: string, brief: ArticleBrief): Promise<boolean> {
    const result = await this.database.query(`UPDATE articles SET
      translations = $3::jsonb, ai_categories = $4::jsonb, brief_input_hash = $5,
      brief_model = $6, brief_generated_at = NOW(), brief_error = NULL,
      brief_retry_at = NULL, brief_claim = NULL, brief_lease_until = NULL
      WHERE id = $1 AND brief_claim = $2 AND ${inputHash} = $5 RETURNING id`,
    [input.id, token, JSON.stringify({ en: brief.en, vi: brief.vi }), JSON.stringify(brief.categories), input.input_hash, model]);
    return result.rows.length > 0;
  }

  async fail(id: number, token: string, code: string): Promise<void> {
    await this.database.query(`UPDATE articles SET brief_claim = NULL, brief_lease_until = NULL,
      brief_error = $3, brief_retry_at = NOW() + INTERVAL '1 hour'
      WHERE id = $1 AND brief_claim = $2`, [id, token, code]);
  }
}
