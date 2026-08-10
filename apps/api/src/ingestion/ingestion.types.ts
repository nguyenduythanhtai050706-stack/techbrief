export type FeedErrorCode = 'FETCH_FAILED' | 'PARSE_FAILED' | 'INVALID_FEED';

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

export interface IngestionSourceResult {
  sourceId: number;
  sourceName: string;
  sourceUrl: string;
  status: 'ok' | 'error';
  items: NormalizedArticlePreview[];
  skippedItems: number;
  error?: { code: FeedErrorCode };
}

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
