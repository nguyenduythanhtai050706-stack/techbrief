import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { ArticleBriefV2 } from './article-brief.types';

export interface BriefInput {
  id: number;
  title: string;
  summary: string | null;
  input_hash: string;
}
export const BRIEF_SCHEMA_VERSION = 2;
export const BRIEF_PROMPT_VERSION = 'day-17-v2';
const inputHash = `md5(
  article.title || E'\\n' ||
  COALESCE((
    SELECT string_agg(
      COALESCE(provenance.source_text_hash, md5(COALESCE(provenance.source_text, article.summary, '')))::text,
      E'\\n' ORDER BY provenance.source_id, provenance.external_id
    )
    FROM article_sources provenance
    WHERE provenance.article_id = article.id
  ), md5(COALESCE(article.summary, ''))) ||
  E'\\n' || '${BRIEF_PROMPT_VERSION}'
)`;

@Injectable()
export class ArticleBriefRepository {
  constructor(private readonly database: DatabaseService) {}

  async claim(token: string): Promise<BriefInput | null> {
    const result = await this.database.query<BriefInput>(
      `
      WITH candidate AS (
        SELECT article.id FROM articles AS article
        WHERE (
            brief_input_hash IS DISTINCT FROM ${inputHash}
            OR brief_schema_version IS DISTINCT FROM ${BRIEF_SCHEMA_VERSION}
            OR brief_prompt_version IS DISTINCT FROM '${BRIEF_PROMPT_VERSION}'
          )
          AND (brief_lease_until IS NULL OR brief_lease_until < NOW())
          AND (brief_retry_at IS NULL OR brief_retry_at <= NOW())
          AND canonical_url ~ '^https?://'
        ORDER BY COALESCE(published_at, created_at) DESC, id DESC
        FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE articles AS article SET brief_claim = $1, brief_lease_until = NOW() + INTERVAL '2 minutes'
      WHERE article.id = (SELECT id FROM candidate)
      RETURNING id, title, summary, ${inputHash} AS input_hash`,
      [token],
    );
    return result.rows[0] ?? null;
  }

  async save(
    input: BriefInput,
    token: string,
    model: string,
    brief: ArticleBriefV2,
  ): Promise<boolean> {
    const result = await this.database.query(
      `UPDATE articles AS article SET
      translations = $3::jsonb, ai_categories = $4::jsonb, brief_input_hash = $5,
      brief_model = $6, brief_schema_version = $7, brief_prompt_version = $8,
      brief_generated_at = NOW(), brief_error = NULL,
      brief_retry_at = NULL, brief_claim = NULL, brief_lease_until = NULL
      WHERE article.id = $1 AND brief_claim = $2 AND ${inputHash} = $5 RETURNING article.id`,
      [
        input.id,
        token,
        JSON.stringify({
          schemaVersion: brief.schemaVersion,
          en: brief.en,
          vi: brief.vi,
          evidence: brief.evidence,
          evidenceLevel: brief.evidenceLevel,
        }),
        JSON.stringify(brief.categories),
        input.input_hash,
        model,
        BRIEF_SCHEMA_VERSION,
        BRIEF_PROMPT_VERSION,
      ],
    );
    return result.rows.length > 0;
  }

  async fail(id: number, token: string, code: string): Promise<void> {
    await this.database.query(
      `UPDATE articles SET brief_claim = NULL, brief_lease_until = NULL,
      brief_error = $3, brief_retry_at = NOW() + INTERVAL '1 hour'
      WHERE id = $1 AND brief_claim = $2`,
      [id, token, code],
    );
  }
}
