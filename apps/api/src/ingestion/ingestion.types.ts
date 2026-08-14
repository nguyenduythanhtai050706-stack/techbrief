export type FeedErrorCode = 'FETCH_FAILED' | 'PARSE_FAILED' | 'INVALID_FEED';
export type IngestionErrorCode = FeedErrorCode | 'PERSIST_FAILED';

export interface ParsedFeedItem {
  guid?: string;
  link?: string;
  title?: string;
  content?: string;
  contentSnippet?: string;
  isoDate?: string;
  creator?: string;
  author?: string;
  categories?: string[];
}

export interface ParsedFeed {
  items?: ParsedFeedItem[];
}

export interface FeedParser {
  parseURL(url: string): Promise<ParsedFeed>;
}

export interface NormalizedArticlePreview {
  externalId: string;
  title: string;
  url: string;
  summary: string | null;
  publishedAt: string | null;
  author: string | null;
  categories: string[];
}

export interface FeedReadResult {
  items: NormalizedArticlePreview[];
  skippedItems: number;
}

export interface IngestionSuccessSourceResult {
  sourceId: number;
  sourceName: string;
  sourceUrl: string;
  status: 'ok';
  items: NormalizedArticlePreview[];
  skippedItems: number;
  insertedItems: number;
  duplicateItems: number;
}

export interface IngestionErrorSourceResult {
  sourceId: number;
  sourceName: string;
  sourceUrl: string;
  status: 'error';
  items: [];
  skippedItems: 0;
  error: { code: IngestionErrorCode };
}

export type IngestionSourceResult =
  | IngestionSuccessSourceResult
  | IngestionErrorSourceResult;

export interface IngestionResponse {
  status: 'completed' | 'partial' | 'failed';
  summary: {
    totalSources: number;
    successfulSources: number;
    failedSources: number;
    totalItems: number;
  };
  sources: IngestionSourceResult[];
}
