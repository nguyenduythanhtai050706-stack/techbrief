import { Controller, Get, Param, Query } from '@nestjs/common';
import { ArticlesQueryService } from './articles-query.service';
import { ArticleIdDto } from './dto/article-id.dto';
import { ListArticlesDto } from './dto/list-articles.dto';
import type { ArticleListPage, ArticleView } from './article.types';

@Controller('articles')
export class ArticlesController {
  constructor(private readonly query: ArticlesQueryService) {}

  @Get()
  list(@Query() dto: ListArticlesDto): Promise<ArticleListPage> {
    return this.query.list(dto);
  }

  @Get(':id')
  findOne(@Param() dto: ArticleIdDto): Promise<ArticleView> {
    return this.query.findOne(dto.id);
  }
}
