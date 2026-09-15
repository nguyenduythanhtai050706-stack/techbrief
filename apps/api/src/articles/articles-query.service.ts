import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ArticlesCacheService } from './articles-cache.service';
import { ArticlesRepository } from './articles.repository';
import { ListArticlesDto } from './dto/list-articles.dto';
import type {
  ArticleListPage,
  ArticleListQuery,
  ArticleView,
} from './article.types';

@Injectable()
export class ArticlesQueryService {
  constructor(
    private readonly repository: ArticlesRepository,
    private readonly cache: ArticlesCacheService,
  ) {}

  async list(dto: ListArticlesDto): Promise<ArticleListPage> {
    const query = this.normalizeListQuery(dto);
    if (
      query.from !== null &&
      query.to !== null &&
      new Date(query.from).getTime() > new Date(query.to).getTime()
    ) {
      throw new BadRequestException('from must not be later than to');
    }

    const cached = await this.cache.getList(query);
    if (cached) return cached;

    const result = await this.repository.list(query);
    const page: ArticleListPage = {
      items: result.items,
      page: query.page,
      limit: query.limit,
      totalItems: result.totalItems,
      totalPages:
        result.totalItems === 0
          ? 0
          : Math.ceil(result.totalItems / query.limit),
      nextCursor: null,
    };
    await this.cache.setList(query, page);
    return page;
  }

  async findOne(id: number): Promise<ArticleView> {
    const cached = await this.cache.getDetail(id);
    if (cached) return cached;

    const article = await this.repository.findById(id);
    if (!article) throw new NotFoundException(`Article ${id} was not found`);

    await this.cache.setDetail(id, article);
    return article;
  }

  private normalizeListQuery(dto: ListArticlesDto): ArticleListQuery {
    return {
      page: dto.page,
      limit: dto.limit,
      sourceId: dto.sourceId ?? null,
      from: dto.from ?? null,
      to: dto.to ?? null,
      ...(dto.category?.trim() ? { category: dto.category.trim() } : {}),
    };
  }
}
