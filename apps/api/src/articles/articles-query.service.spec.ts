import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ListArticlesDto } from './dto/list-articles.dto';
import { ArticlesQueryService } from './articles-query.service';
import type { ArticleListPage, ArticleView } from './article.types';

const article: ArticleView = {
  id: 42,
  canonicalUrl: 'https://news.example/article-42',
  title: 'Persisted article',
  summary: null,
  publishedAt: null,
  author: null,
  categories: ['AI'],
  createdAt: '2026-08-11T08:00:00.000Z',
  lastSeenAt: '2026-08-11T09:00:00.000Z',
  sources: [],
};

const page: ArticleListPage = {
  items: [article],
  page: 1,
  limit: 20,
  totalItems: 1,
  totalPages: 1,
  nextCursor: null,
};

const createRepository = () => ({
  list: jest.fn(),
  findById: jest.fn(),
});

const createCache = () => ({
  getList: jest.fn(),
  setList: jest.fn(),
  getDetail: jest.fn(),
  setDetail: jest.fn(),
});

describe('ArticlesQueryService', () => {
  it('serves a cache hit using normalized optional filters', async () => {
    const repository = createRepository();
    const cache = createCache();
    cache.getList.mockResolvedValue(page);
    const service = new ArticlesQueryService(repository as never, cache as never);

    await expect(
      service.list({ page: 1, limit: 20 } as ListArticlesDto),
    ).resolves.toBe(page);
    expect(cache.getList).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      sourceId: null,
      from: null,
      to: null,
    });
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('queries and caches a page after a cache miss', async () => {
    const repository = createRepository();
    repository.list.mockResolvedValue({ items: [article], totalItems: 41 });
    const cache = createCache();
    cache.getList.mockResolvedValue(null);
    cache.setList.mockResolvedValue(undefined);
    const service = new ArticlesQueryService(repository as never, cache as never);
    const dto = {
      page: 2,
      limit: 20,
      sourceId: 7,
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T23:59:59.000Z',
    } as ListArticlesDto;

    await expect(service.list(dto)).resolves.toEqual({
      items: [article],
      page: 2,
      limit: 20,
      totalItems: 41,
      totalPages: 3,
      nextCursor: null,
    });
    expect(repository.list).toHaveBeenCalledWith({
      page: 2,
      limit: 20,
      sourceId: 7,
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T23:59:59.000Z',
    });
    expect(cache.setList).toHaveBeenCalledWith(
      {
        page: 2,
        limit: 20,
        sourceId: 7,
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-31T23:59:59.000Z',
      },
      expect.objectContaining({ totalPages: 3, nextCursor: null }),
    );
  });

  it('rejects an inverted date range before calling cache or repository', async () => {
    const repository = createRepository();
    const cache = createCache();
    const service = new ArticlesQueryService(repository as never, cache as never);

    await expect(
      service.list({
        page: 1,
        limit: 20,
        from: '2026-08-02T00:00:00.000Z',
        to: '2026-08-01T00:00:00.000Z',
      } as ListArticlesDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(cache.getList).not.toHaveBeenCalled();
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('serves an article detail from cache without querying the repository', async () => {
    const repository = createRepository();
    const cache = createCache();
    cache.getDetail.mockResolvedValue(article);
    const service = new ArticlesQueryService(repository as never, cache as never);

    await expect(service.findOne(42)).resolves.toBe(article);
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it('throws a not found exception for a missing article', async () => {
    const repository = createRepository();
    repository.findById.mockResolvedValue(null);
    const cache = createCache();
    cache.getDetail.mockResolvedValue(null);
    const service = new ArticlesQueryService(repository as never, cache as never);

    await expect(service.findOne(404)).rejects.toBeInstanceOf(NotFoundException);
    expect(cache.setDetail).not.toHaveBeenCalled();
  });
});
