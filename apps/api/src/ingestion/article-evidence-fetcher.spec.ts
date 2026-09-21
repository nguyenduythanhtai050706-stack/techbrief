import { ArticleContentExtractor } from './article-content-extractor';
import {
  ArticleEvidenceFetcher,
  type ArticleEvidenceNetwork,
} from './article-evidence-fetcher';
import type { NormalizedArticlePreview } from './ingestion.types';

const preview = (
  overrides: Partial<NormalizedArticlePreview> = {},
): NormalizedArticlePreview => ({
  externalId: 'story-1',
  title: 'Story',
  url: 'https://news.example/story',
  summary: 'Short excerpt',
  sourceText: 'Short excerpt',
  sourceTextKind: 'rss_excerpt',
  publishedAt: null,
  author: null,
  categories: [],
  ...overrides,
});

function setup(
  response: Response,
  addresses = [{ address: '203.0.113.10', family: 4 }],
) {
  const network: ArticleEvidenceNetwork = {
    fetch: jest.fn().mockResolvedValue(response),
    lookup: jest.fn().mockResolvedValue(addresses),
  };
  return {
    network,
    fetcher: new ArticleEvidenceFetcher(new ArticleContentExtractor(), network),
  };
}

describe('ArticleEvidenceFetcher', () => {
  it('extracts the main page when the RSS evidence is thin', async () => {
    const body = `<html><body><nav>Menu</nav><article><h1>Story</h1><p>${'Grounded detail. '.repeat(80)}</p></article><aside>Related</aside></body></html>`;
    const { fetcher } = setup(
      new Response(body, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );

    const result = await fetcher.enrich(
      preview(),
      'https://feeds.news.example/rss',
    );

    expect(result.sourceTextKind).toBe('page');
    expect(result.sourceText).toContain('Grounded detail.');
  });

  it('does not fetch when RSS already contains enough evidence', async () => {
    const { fetcher, network } = setup(new Response('unused'));
    const rich = preview({
      sourceText: 'x'.repeat(800),
      sourceTextKind: 'rss_full',
    });

    await expect(
      fetcher.enrich(rich, 'https://news.example/rss'),
    ).resolves.toBe(rich);
    expect(network.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [
      'localhost target',
      'http://localhost/story',
      [{ address: '127.0.0.1', family: 4 }],
    ],
    [
      'private IPv4 target',
      'https://news.example/story',
      [{ address: '10.0.0.4', family: 4 }],
    ],
    [
      'link-local target',
      'https://news.example/story',
      [{ address: '169.254.1.4', family: 4 }],
    ],
    [
      'private IPv6 target',
      'https://news.example/story',
      [{ address: 'fd00::1', family: 6 }],
    ],
    [
      'foreign hostname',
      'https://evil.example/story',
      [{ address: '203.0.113.10', family: 4 }],
    ],
  ])('falls back safely for a %s', async (_case, url, addresses) => {
    const { fetcher, network } = setup(
      new Response('<article>unsafe</article>'),
      addresses,
    );
    const original = preview({ url });

    await expect(
      fetcher.enrich(original, 'https://news.example/rss'),
    ).resolves.toBe(original);
    expect(network.fetch).not.toHaveBeenCalled();
  });

  it('revalidates a redirect and rejects a redirect to another host', async () => {
    const { fetcher, network } = setup(
      new Response(null, {
        status: 302,
        headers: { location: 'https://evil.example/story' },
      }),
    );
    const original = preview();

    await expect(
      fetcher.enrich(original, 'https://news.example/rss'),
    ).resolves.toBe(original);
    expect(network.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back for non-HTML and oversized responses', async () => {
    const nonHtml = setup(
      new Response('{}', { headers: { 'content-type': 'application/json' } }),
    );
    await expect(
      nonHtml.fetcher.enrich(preview(), 'https://news.example/rss'),
    ).resolves.toMatchObject({ sourceTextKind: 'rss_excerpt' });

    const oversized = setup(
      new Response('small', {
        headers: { 'content-type': 'text/html', 'content-length': '1000001' },
      }),
    );
    await expect(
      oversized.fetcher.enrich(preview(), 'https://news.example/rss'),
    ).resolves.toMatchObject({ sourceTextKind: 'rss_excerpt' });

    const streamedOversized = setup(
      new Response('x'.repeat(1_000_001), {
        headers: { 'content-type': 'text/html' },
      }),
    );
    await expect(
      streamedOversized.fetcher.enrich(preview(), 'https://news.example/rss'),
    ).resolves.toMatchObject({ sourceTextKind: 'rss_excerpt' });
  });
});
