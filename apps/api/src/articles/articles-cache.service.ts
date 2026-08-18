import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import type {
  ArticleListPage,
  ArticleListQuery,
  ArticleView,
} from './article.types';

const CACHE_PREFIX = 'articles:v1';
const CACHE_VERSION_KEY = `${CACHE_PREFIX}:version`;
const CACHE_TTL_SECONDS = 60;

@Injectable()
export class ArticlesCacheService {
  private readonly logger = new Logger(ArticlesCacheService.name);

  constructor(private readonly redis: RedisService) {}

  async getList(query: ArticleListQuery): Promise<ArticleListPage | null> {
    try {
      const value = await this.redis.get(await this.listKey(query));
      if (value === null) return null;

      const page: unknown = JSON.parse(value);
      return this.isListPage(page) ? page : null;
    } catch (error: unknown) {
      this.logCacheFailure('read article list cache', error);
      return null;
    }
  }

  async setList(query: ArticleListQuery, page: ArticleListPage): Promise<void> {
    try {
      await this.redis.set(
        await this.listKey(query),
        JSON.stringify(page),
        CACHE_TTL_SECONDS,
      );
    } catch (error: unknown) {
      this.logCacheFailure('write article list cache', error);
    }
  }

  async getDetail(id: number): Promise<ArticleView | null> {
    try {
      const value = await this.redis.get(await this.detailKey(id));
      if (value === null) return null;

      const article: unknown = JSON.parse(value);
      return this.isArticleView(article) ? article : null;
    } catch (error: unknown) {
      this.logCacheFailure('read article detail cache', error);
      return null;
    }
  }

  async setDetail(id: number, article: ArticleView): Promise<void> {
    try {
      await this.redis.set(
        await this.detailKey(id),
        JSON.stringify(article),
        CACHE_TTL_SECONDS,
      );
    } catch (error: unknown) {
      this.logCacheFailure('write article detail cache', error);
    }
  }

  async invalidateArticles(): Promise<void> {
    try {
      await this.redis.increment(CACHE_VERSION_KEY);
    } catch (error: unknown) {
      this.logCacheFailure('invalidate article cache', error);
    }
  }

  private async listKey(query: ArticleListQuery): Promise<string> {
    return `${CACHE_PREFIX}:${await this.version()}:list:${JSON.stringify(query)}`;
  }

  private async detailKey(id: number): Promise<string> {
    return `${CACHE_PREFIX}:${await this.version()}:detail:${id}`;
  }

  private async version(): Promise<string> {
    return (await this.redis.get(CACHE_VERSION_KEY)) ?? '0';
  }

  private isListPage(value: unknown): value is ArticleListPage {
    return (
      typeof value === 'object' &&
      value !== null &&
      Array.isArray((value as { items?: unknown }).items)
    );
  }

  private isArticleView(value: unknown): value is ArticleView {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { id?: unknown }).id === 'number'
    );
  }

  private logCacheFailure(action: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Failed to ${action}: ${message}`);
  }
}
