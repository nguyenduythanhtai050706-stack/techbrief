import type { NormalizedArticlePreview } from '../ingestion/ingestion.types';

export interface PreparedArticle extends NormalizedArticlePreview {
  canonicalUrl: string;
  contentFingerprint: string | null;
}

export interface ArticleRecord {
  id: number;
  canonical_url: string;
  content_fingerprint: string | null;
}

export interface ArticlePersistenceInput extends PreparedArticle {
  sourceId: number;
}

export type ArticlePersistenceOutcome = 'inserted' | 'duplicate';
