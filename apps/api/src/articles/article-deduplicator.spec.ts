import { ArticleDeduplicator } from './article-deduplicator';

describe('ArticleDeduplicator', () => {
  it('removes tracking parameters and fragments while retaining meaningful parameters', () => {
    const result = new ArticleDeduplicator().prepare({
      externalId: 'guid-1',
      title: 'AI Guide',
      url: 'https://news.example/article?b=2&utm_source=rss&a=1#comments',
      summary: null,
      publishedAt: null,
      author: null,
      categories: [],
    });

    expect(result.canonicalUrl).toBe('https://news.example/article?a=1&b=2');
  });

  it('creates the same fingerprint for detailed identical content at different URLs', () => {
    const service = new ArticleDeduplicator();
    const summary = `<p>${'Useful article content. '.repeat(5)}</p>`;
    const original = service.prepare({
      externalId: 'guid-1',
      title: 'AI Guide',
      url: 'https://news.example/article',
      summary,
      publishedAt: null,
      author: null,
      categories: [],
    });
    const syndicated = service.prepare({
      externalId: 'guid-2',
      title: 'AI Guide',
      url: 'https://syndicate.example/story',
      summary,
      publishedAt: null,
      author: null,
      categories: [],
    });

    expect(original.contentFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(syndicated.contentFingerprint).toBe(original.contentFingerprint);
  });

  it('does not fingerprint a summary shorter than 80 normalized characters', () => {
    const result = new ArticleDeduplicator().prepare({
      externalId: 'guid-1',
      title: 'AI Guide',
      url: 'https://news.example/article',
      summary: '<p>Short summary</p>',
      publishedAt: null,
      author: null,
      categories: [],
    });

    expect(result.contentFingerprint).toBeNull();
  });

  it('does not fingerprint a missing summary', () => {
    const result = new ArticleDeduplicator().prepare({
      externalId: 'guid-1',
      title: 'AI Guide',
      url: 'https://news.example/article',
      summary: null,
      publishedAt: null,
      author: null,
      categories: [],
    });

    expect(result.contentFingerprint).toBeNull();
  });
});
