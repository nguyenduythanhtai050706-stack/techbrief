import type {
  ArticleListPage,
  ArticleListQuery,
  ArticleView,
} from './article.types';
import { ArticlesCacheService } from './articles-cache.service';

const query: ArticleListQuery = {
  page: 1,
  limit: 20,
  sourceId: null,
  from: null,
  to: null,
};

const article: ArticleView = {
  id: 42,
  canonicalUrl: 'https://news.example/article-42',
  title: 'Cached article',
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

const createRedis = () => ({
  get: jest.fn(),
  set: jest.fn(),
  increment: jest.fn(),
});

describe('ArticlesCacheService', () => {
  it('reads a valid list from the current cache namespace', async () => {
    const redis = createRedis();
    redis.get
      .mockResolvedValueOnce('2')
      .mockResolvedValueOnce(JSON.stringify(page));
    const cache = new ArticlesCacheService(redis as never);

    await expect(cache.getList(query)).resolves.toEqual(page);
    expect(redis.get).toHaveBeenNthCalledWith(1, 'articles:v1:version');
    expect(redis.get).toHaveBeenNthCalledWith(
      2,
      'articles:v1:2:list:{"page":1,"limit":20,"sourceId":null,"from":null,"to":null}',
    );
  });

  it('writes a list for 60 seconds in the default namespace', async () => {
    const redis = createRedis();
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue(undefined);
    const cache = new ArticlesCacheService(redis as never);

    await expect(cache.setList(query, page)).resolves.toBeUndefined();
    expect(redis.set).toHaveBeenCalledWith(
      'articles:v1:0:list:{"page":1,"limit":20,"sourceId":null,"from":null,"to":null}',
      JSON.stringify(page),
      60,
    );
  });

  it('reads a valid detail from the current cache namespace', async () => {
    const redis = createRedis();
    redis.get
      .mockResolvedValueOnce('3')
      .mockResolvedValueOnce(JSON.stringify(article));
    const cache = new ArticlesCacheService(redis as never);

    await expect(cache.getDetail(42)).resolves.toEqual(article);
    expect(redis.get).toHaveBeenNthCalledWith(2, 'articles:v1:3:detail:42');
  });

  it('treats malformed cached data as a cache miss', async () => {
    const redis = createRedis();
    redis.get.mockResolvedValueOnce('1').mockResolvedValueOnce('{bad json');
    const cache = new ArticlesCacheService(redis as never);

    await expect(cache.getList(query)).resolves.toBeNull();
  });

  it('treats Redis failures as non-fatal cache misses', async () => {
    const redis = createRedis();
    redis.get.mockRejectedValue(new Error('Redis unavailable'));
    const cache = new ArticlesCacheService(redis as never);

    await expect(cache.getDetail(42)).resolves.toBeNull();
  });

  it('does not throw when a cache write or invalidation fails', async () => {
    const redis = createRedis();
    redis.get.mockResolvedValue('4');
    redis.set.mockRejectedValue(new Error('Redis unavailable'));
    redis.increment.mockRejectedValue(new Error('Redis unavailable'));
    const cache = new ArticlesCacheService(redis as never);

    await expect(cache.setDetail(42, article)).resolves.toBeUndefined();
    await expect(cache.invalidateArticles()).resolves.toBeUndefined();
    expect(redis.increment).toHaveBeenCalledWith('articles:v1:version');
  });
});
