import { ArticlePersistenceService } from './article-persistence.service';

const preview = {
  externalId: 'guid-1',
  title: 'AI Guide',
  url: 'https://news.example/article',
  summary: null,
  publishedAt: null,
  author: null,
  categories: [],
};

describe('ArticlePersistenceService', () => {
  it('persists a prepared preview for its source', async () => {
    const prepared = {
      ...preview,
      canonicalUrl: 'https://news.example/article',
      contentFingerprint: null,
    };
    const deduplicator = { prepare: jest.fn().mockReturnValue(prepared) };
    const repository = { persist: jest.fn().mockResolvedValue('inserted') };
    const service = new ArticlePersistenceService(
      deduplicator as never,
      repository as never,
    );

    await expect(service.persist(7, preview)).resolves.toBe('inserted');
    expect(repository.persist).toHaveBeenCalledWith({ ...prepared, sourceId: 7 });
  });

  it('maps database failures to PERSIST_FAILED', async () => {
    const deduplicator = { prepare: jest.fn().mockReturnValue(preview) };
    const repository = {
      persist: jest.fn().mockRejectedValue(Object.assign(new Error('offline'), { code: '08006' })),
    };
    const service = new ArticlePersistenceService(deduplicator as never, repository as never);

    await expect(service.persist(7, preview)).rejects.toMatchObject({ code: 'PERSIST_FAILED' });
  });

  it('rethrows programming errors unchanged', async () => {
    const programmingError = new Error('programming bug');
    const deduplicator = { prepare: jest.fn().mockReturnValue(preview) };
    const repository = {
      persist: jest.fn().mockRejectedValue(programmingError),
    };
    const service = new ArticlePersistenceService(
      deduplicator as never,
      repository as never,
    );

    await expect(service.persist(7, preview)).rejects.toBe(programmingError);
  });
});
