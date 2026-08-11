import { createHash } from 'node:crypto';
import type { NormalizedArticlePreview } from '../ingestion/ingestion.types';
import type { PreparedArticle } from './article.types';

const MINIMUM_FINGERPRINT_SUMMARY_LENGTH = 80;

function normalizeText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export class ArticleDeduplicator {
  prepare(preview: NormalizedArticlePreview): PreparedArticle {
    const url = new URL(preview.url);

    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      const normalizedKey = key.toLowerCase();

      if (
        normalizedKey.startsWith('utm_') ||
        normalizedKey === 'gclid' ||
        normalizedKey === 'fbclid'
      ) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();

    const summary = normalizeText(preview.summary ?? '');
    const contentFingerprint =
      summary.length < MINIMUM_FINGERPRINT_SUMMARY_LENGTH
        ? null
        : createHash('sha256')
            .update(`${normalizeText(preview.title)}\n${summary}`)
            .digest('hex');

    return {
      ...preview,
      canonicalUrl: url.toString(),
      contentFingerprint,
    };
  }
}
