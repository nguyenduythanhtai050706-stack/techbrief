import { ArticlesController } from './articles.controller';
import type { ListArticlesDto } from './dto/list-articles.dto';
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
const page = {
  items: [article],
  page: 1,
  limit: 20,
  totalItems: 1,
  totalPages: 1,
  nextCursor: null,
} as ArticleListPage;

describe('ArticlesController', () => {
  it('delegates list and detail HTTP inputs to the query service', async () => {
    const query = {
      list: jest.fn().mockResolvedValue(page),
      findOne: jest.fn().mockResolvedValue(article),
    };
    const controller = new ArticlesController(query as never);
    const dto = { page: 1, limit: 20 } as ListArticlesDto;

    await expect(controller.list(dto)).resolves.toBe(page);
    await expect(controller.findOne({ id: 42 })).resolves.toBe(article);
    expect(query.list).toHaveBeenCalledWith(dto);
    expect(query.findOne).toHaveBeenCalledWith(42);
  });
});
