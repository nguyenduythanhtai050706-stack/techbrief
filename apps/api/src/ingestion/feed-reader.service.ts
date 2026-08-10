import { Inject, Injectable } from '@nestjs/common';
import { RSS_PARSER } from './ingestion.constants';
import type {
  FeedErrorCode,
  FeedParser,
  FeedReadResult,
} from './ingestion.types';

@Injectable()
export class FeedReaderError extends Error {
  constructor(public readonly code: FeedErrorCode) {
    super(code);
    this.name = 'FeedReaderError';
  }
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export class FeedReaderService {
  constructor(@Inject(RSS_PARSER) private readonly parser: FeedParser) {}

  async read(url: string): Promise<FeedReadResult> {
    let feed: Awaited<ReturnType<FeedParser['parseURL']>>;

    try {
      feed = await this.parser.parseURL(url);
    } catch (error: unknown) {
      const errorCode = (error as { code?: string }).code;

      if (
        errorCode === 'ENOTFOUND' ||
        errorCode === 'ETIMEDOUT' ||
        errorCode === 'ECONNREFUSED' ||
        errorCode === 'ECONNRESET' ||
        errorCode === 'UND_ERR_CONNECT_TIMEOUT'
      ) {
        throw new FeedReaderError('FETCH_FAILED');
      }

      throw new FeedReaderError('PARSE_FAILED');
    }

    if (!Array.isArray(feed.items)) {
      throw new FeedReaderError('INVALID_FEED');
    }

    const items = [];
    let skippedItems = 0;

    for (const item of feed.items.slice(0, 50)) {
      if (!item.title || !item.link || !isAbsoluteHttpUrl(item.link)) {
        skippedItems += 1;
        continue;
      }

      const parsedDate = item.isoDate ? new Date(item.isoDate) : null;
      const publishedAt =
        parsedDate && !Number.isNaN(parsedDate.getTime())
          ? parsedDate.toISOString()
          : null;

      items.push({
        externalId: item.guid || item.link,
        title: item.title,
        url: item.link,
        summary: item.contentSnippet ?? item.content ?? null,
        publishedAt,
        author: item.creator ?? item.author ?? null,
        categories: item.categories ?? [],
      });
    }

    return { items, skippedItems };
  }
}
