import { ArticlesRepository } from './articles.repository';
import type { ArticlePersistenceInput } from './article.types';

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
});
