import Parser from 'rss-parser';
import type { ParsedFeedItem } from './ingestion.types';

export function createFeedParser() {
  return new Parser<Record<string, never>, ParsedFeedItem>({
    timeout: 10_000,
    maxRedirects: 5,
    headers: { 'User-Agent': 'TechBrief/0.1' },
    customFields: {
      item: [
        ['content:encoded', 'contentEncoded'],
        ['media:content', 'mediaContent', { keepArray: true }],
        ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ],
    },
  });
}
