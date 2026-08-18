import { ArticlesRepository } from './articles.repository';
import type { ArticleListQuery, ArticlePersistenceInput } from './article.types';

const input: ArticlePersistenceInput = {
  sourceId: 7,
  externalId: 'guid-1',
  title: 'AI Guide',
  url: 'https://news.example/article',
  canonicalUrl: 'https://news.example/article',
  contentFingerprint: 'a'.repeat(64),
  summary: 'Useful article content that is long enough to support a fingerprint.',
  publishedAt: '2026-08-11T08:00:00.000Z',
  author: 'Ada Lovelace',
  categories: ['AI'],
};

const listRow = {
  id: 42,
  canonical_url: 'https://news.example/article-42',
  title: 'Persisted article',
  summary: 'A stored summary.',
  published_at: null,
  author: null,
  categories: ['AI', 'Engineering'],
  created_at: '2026-08-11T08:00:00.000Z',
  last_seen_at: '2026-08-11T09:00:00.000Z',
  sources: [
    { id: 7, name: 'Primary feed', url: 'https://primary.example/feed.xml' },
    { id: 8, name: 'Mirror feed', url: 'https://mirror.example/feed.xml' },
  ],
};

describe('ArticlesRepository', () => {
  it('inserts a new article and associates its reporting source', async () => {
    const database = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 41,
              canonical_url: input.canonicalUrl,
              content_fingerprint: input.contentFingerprint,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const repository = new ArticlesRepository(database as never);

    await expect(repository.persist(input)).resolves.toBe('inserted');
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO articles'),
      expect.arrayContaining([input.canonicalUrl, input.contentFingerprint]),
    );
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (article_id, source_id, external_id)'),
      [41, input.sourceId, input.externalId],
    );
  });

  it('treats a matching canonical URL as a duplicate without replacing metadata', async () => {
    const database = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 41,
              canonical_url: input.canonicalUrl,
              content_fingerprint: input.contentFingerprint,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const repository = new ArticlesRepository(database as never);

    await expect(repository.persist(input)).resolves.toBe('duplicate');
    expect(database.query).toHaveBeenCalledWith(
      'UPDATE articles SET last_seen_at = NOW() WHERE id = $1',
      [41],
    );
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (article_id, source_id, external_id)'),
      [41, input.sourceId, input.externalId],
    );
    expect(database.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE articles SET title'),
      expect.anything(),
    );
  });

  it('treats a matching content fingerprint as a duplicate', async () => {
    const database = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 42,
              canonical_url: 'https://syndicate.example/story',
              content_fingerprint: input.contentFingerprint,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const repository = new ArticlesRepository(database as never);

    await expect(repository.persist(input)).resolves.toBe('duplicate');
    expect(database.query).toHaveBeenCalledWith(
      'UPDATE articles SET last_seen_at = NOW() WHERE id = $1',
      [42],
    );
  });

  it('recovers a duplicate-key insert race by re-reading the article', async () => {
    const duplicateKeyError = Object.assign(new Error('duplicate key'), {
      code: '23505',
    });
    const database = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(duplicateKeyError)
        .mockResolvedValueOnce({
          rows: [
            {
              id: 43,
              canonical_url: input.canonicalUrl,
              content_fingerprint: input.contentFingerprint,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const repository = new ArticlesRepository(database as never);

    await expect(repository.persist(input)).resolves.toBe('duplicate');
    expect(database.query).toHaveBeenCalledWith(
      'UPDATE articles SET last_seen_at = NOW() WHERE id = $1',
      [43],
    );
  });

  it('lists persisted articles with shared source and date filters', async () => {
    const database = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ total_items: 41 }] })
        .mockResolvedValueOnce({ rows: [listRow] }),
    };
    const repository = new ArticlesRepository(database as never);
    const query: ArticleListQuery = {
      page: 2,
      limit: 20,
      sourceId: 7,
      from: '2026-08-01T00:00:00.000Z',
      to: null,
    };

    await expect(repository.list(query)).resolves.toEqual({
      totalItems: 41,
      items: [
        {
          id: 42,
          canonicalUrl: 'https://news.example/article-42',
          title: 'Persisted article',
          summary: 'A stored summary.',
          publishedAt: null,
          author: null,
          categories: ['AI', 'Engineering'],
          createdAt: '2026-08-11T08:00:00.000Z',
          lastSeenAt: '2026-08-11T09:00:00.000Z',
          sources: listRow.sources,
        },
      ],
    });
    expect(database.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('EXISTS (SELECT 1 FROM article_sources'),
      [7, '2026-08-01T00:00:00.000Z'],
    );
    expect(database.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'ORDER BY COALESCE(article.published_at, article.created_at) DESC, article.id DESC',
      ),
      [7, '2026-08-01T00:00:00.000Z', 20, 20],
    );
  });

  it('uses the to filter and returns an empty result set', async () => {
    const database = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ total_items: 0 }] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const repository = new ArticlesRepository(database as never);

    await expect(
      repository.list({
        page: 1,
        limit: 20,
        sourceId: null,
        from: null,
        to: '2026-08-31T23:59:59.000Z',
      }),
    ).resolves.toEqual({ totalItems: 0, items: [] });
    expect(database.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('<= $1'),
      ['2026-08-31T23:59:59.000Z'],
    );
  });

  it('lists an unfiltered page with deterministic effective-date ordering', async () => {
    const database = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ total_items: 1 }] })
        .mockResolvedValueOnce({ rows: [listRow] }),
    };
    const repository = new ArticlesRepository(database as never);

    await repository.list({
      page: 1,
      limit: 20,
      sourceId: null,
      from: null,
      to: null,
    });

    expect(database.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'ORDER BY COALESCE(article.published_at, article.created_at) DESC, article.id DESC',
      ),
      [20, 0],
    );
  });

  it('deduplicates source provenance when one source has multiple external IDs', async () => {
    const database = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ total_items: 1 }] })
        .mockResolvedValueOnce({ rows: [listRow] }),
    };
    const repository = new ArticlesRepository(database as never);

    await repository.list({
      page: 1,
      limit: 20,
      sourceId: null,
      from: null,
      to: null,
    });

    expect(database.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'SELECT DISTINCT article_id, source_id FROM article_sources',
      ),
      [20, 0],
    );
  });

  it('returns a mapped article for its ID and null when it is missing', async () => {
    const database = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [listRow] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const repository = new ArticlesRepository(database as never);

    await expect(repository.findById(42)).resolves.toMatchObject({
      id: 42,
      sources: [{ id: 7 }, { id: 8 }],
    });
    await expect(repository.findById(999)).resolves.toBeNull();
    expect(database.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('WHERE article.id = $1'),
      [42],
    );
  });
});
