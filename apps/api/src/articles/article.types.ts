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

export interface ArticleListQuery {
  page: number;
  limit: number;
  sourceId: number | null;
  from: string | null;
  to: string | null;
}

export interface ArticleSourceView {
  id: number;
  name: string;
  url: string;
}

export interface ArticleView {
  id: number;
  canonicalUrl: string;
  title: string;
  summary: string | null;
  publishedAt: string | null;
  author: string | null;
  categories: string[];
  createdAt: string;
  lastSeenAt: string;
  sources: ArticleSourceView[];
}

export interface ArticleListPage {
  items: ArticleView[];
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  nextCursor: null;
}
