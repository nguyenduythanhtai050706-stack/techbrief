# Day 7-8 Article Query, Cache, and Scheduled Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not use subagents; the project-based learning protocol requires inline execution with a user checkpoint after each task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Provide a paginated persisted-article API, Redis-backed resilient cache, and configurable non-overlapping scheduled ingestion.

**Architecture:** Extend the existing articles module with read contracts, repository queries, a cache service, and a query service. IngestionService invalidates the article-cache namespace after a successful source run. A scheduler service dynamically registers one cron job after configuration loads, so the manual endpoint and scheduled task share the same ingestion behavior.

**Tech Stack:** NestJS 11, TypeScript 5, Jest 30, PostgreSQL 17, Redis 6 client, @nestjs/schedule, cron, class-validator, class-transformer, pnpm.

## Global Constraints

- Do not build UI, authentication, editing, deleting, full-text search, category filters, cursor pagination, ETags, retries, queues, metrics, or a distributed lock.
- Preserve all Day 4-6 feed, persistence, deduplication, and editorial-metadata behavior.
- GET /articles defaults to page=1 and limit=20, accepts limit at most 100, and orders by COALESCE(published_at, created_at) DESC, id DESC.
- Redis errors are non-fatal. Cache TTL is exactly 60 seconds. Cache keys start with articles:v1: and use a Redis-incremented namespace version.
- INGESTION_SCHEDULER_ENABLED defaults to true and INGESTION_CRON defaults to 0 * * * *. Scheduled executions do not overlap in one API process.
- Do not modify the user's .env. Tests use mocks only; final verification runs tests, build, migrations, persistence smoke, and git diff --check.

---

## File Structure

- apps/api/package.json and apps/api/pnpm-lock.yaml — schedule runtime dependencies.
- apps/api/src/redis/redis.service.ts and redis.service.spec.ts — lazy Redis get, set, and increment primitives.
- apps/api/src/articles/article.types.ts — read contracts.
- apps/api/src/articles/dto/list-articles.dto.ts and article-id.dto.ts — validated HTTP input.
- apps/api/src/articles/articles.repository.ts and articles.repository.spec.ts — count, list, and detail SQL.
- apps/api/src/articles/articles-cache.service.ts and spec — versioned resilient cache.
- apps/api/src/articles/articles-query.service.ts and spec — cache-or-repository orchestration.
- apps/api/src/articles/articles.controller.ts and spec; articles.module.ts — HTTP surface and wiring.
- apps/api/src/ingestion/ingestion.service.ts and spec — cache invalidation.
- apps/api/src/ingestion/ingestion-scheduler.service.ts and spec — dynamic cron and overlap guard.
- apps/api/src/ingestion/ingestion.module.ts, apps/api/src/app.module.ts, .env.example, README.MD — bootstrap and operations.

## Task 1: Install scheduler dependencies and expose Redis primitives

**Files:**

- Modify: apps/api/package.json
- Modify: apps/api/pnpm-lock.yaml
- Modify: apps/api/src/redis/redis.service.ts
- Modify: apps/api/src/redis/redis.service.spec.ts

**Interfaces:**

- RedisService.get(key: string): Promise<string | null>
- RedisService.set(key: string, value: string, ttlSeconds: number): Promise<void>
- RedisService.increment(key: string): Promise<number>

- [ ] **Step 1: Install dependencies**

~~~powershell
pnpm --dir apps/api add @nestjs/schedule@^6.1.1 cron@^4.4.0
~~~

Expected: both packages are direct API dependencies and only the API lockfile changes.

- [ ] **Step 2: Write failing Redis tests**

Add mocked client methods get, set, and incr:

~~~ts
await expect(service.get('articles:v1:version')).resolves.toBe('2');
await expect(service.set('articles:v1:2:list', '{"items":[]}', 60)).resolves.toBeUndefined();
await expect(service.increment('articles:v1:version')).resolves.toBe(3);
expect(client.set).toHaveBeenCalledWith(
  'articles:v1:2:list',
  '{"items":[]}',
  { EX: 60 },
);
~~~

- [ ] **Step 3: Confirm failure**

Run: pnpm --dir apps/api test -- redis.service.spec.ts --runInBand

Expected: FAIL because the three Redis methods do not exist.

- [ ] **Step 4: Implement the thin wrapper**

Each method first awaits the existing private ensureConnected():

~~~ts
async get(key: string): Promise<string | null> {
  await this.ensureConnected();
  return this.client.get(key);
}

async set(key: string, value: string, ttlSeconds: number): Promise<void> {
  await this.ensureConnected();
  await this.client.set(key, value, { EX: ttlSeconds });
}

async increment(key: string): Promise<number> {
  await this.ensureConnected();
  return this.client.incr(key);
}
~~~

Do not catch Redis errors here; cache callers own the fallback policy.

- [ ] **Step 5: Verify and commit**

Run: pnpm --dir apps/api test -- redis.service.spec.ts --runInBand

Expected: PASS.

~~~bash
git add apps/api/package.json apps/api/pnpm-lock.yaml apps/api/src/redis/redis.service.ts apps/api/src/redis/redis.service.spec.ts
git commit -m "feat(api): add Redis cache primitives"
~~~

## Task 2: Define validated article-read contracts

**Files:**

- Modify: apps/api/src/articles/article.types.ts
- Create: apps/api/src/articles/dto/list-articles.dto.ts
- Create: apps/api/src/articles/dto/article-id.dto.ts
- Test: apps/api/src/articles/dto/list-articles.dto.spec.ts
- Test: apps/api/src/articles/dto/article-id.dto.spec.ts

**Interfaces:**

- ArticleListQuery is { page, limit, sourceId, from, to }; optional filters normalize to null.
- ArticleView includes article metadata and ArticleSourceView[].
- ArticleListPage is { items, page, limit, totalItems, totalPages, nextCursor: null }.

- [ ] **Step 1: Write failing DTO tests**

~~~ts
const dto = plainToInstance(ListArticlesDto, {});
expect(dto.page).toBe(1);
expect(dto.limit).toBe(20);
expect(await validate(dto)).toHaveLength(0);

expect(await validationErrors({ page: '0' })).not.toHaveLength(0);
expect(await validationErrors({ limit: '101' })).not.toHaveLength(0);
expect(await validationErrors({ sourceId: '1.5' })).not.toHaveLength(0);
expect(await validationErrors({ from: 'not-a-date' })).not.toHaveLength(0);
expect(await validationErrors({ id: '0' }, ArticleIdDto)).not.toHaveLength(0);
~~~

- [ ] **Step 2: Confirm failure**

Run: pnpm --dir apps/api test -- list-articles.dto.spec.ts article-id.dto.spec.ts --runInBand

Expected: FAIL because the DTOs are absent.

- [ ] **Step 3: Implement DTOs and contracts**

ListArticlesDto uses @Type(() => Number), @IsOptional(), @IsInt(), and @Min(1) for page and sourceId; limit also uses @Max(100). Set page = 1 and limit = 20. Use @IsDateString() on optional from and to. ArticleIdDto uses @Type(() => Number), @IsInt(), and @Min(1).

Add these contracts:

~~~ts
export interface ArticleSourceView { id: number; name: string; url: string; }
export interface ArticleView {
  id: number; canonicalUrl: string; title: string; summary: string | null;
  publishedAt: string | null; author: string | null; categories: string[];
  createdAt: string; lastSeenAt: string; sources: ArticleSourceView[];
}
export interface ArticleListPage {
  items: ArticleView[]; page: number; limit: number;
  totalItems: number; totalPages: number; nextCursor: null;
}
~~~

- [ ] **Step 4: Verify and commit**

Run: pnpm --dir apps/api test -- list-articles.dto.spec.ts article-id.dto.spec.ts --runInBand

Expected: PASS.

~~~bash
git add apps/api/src/articles/article.types.ts apps/api/src/articles/dto
git commit -m "feat(api): define article read contracts"
~~~

## Task 3: Add parameterized list and detail repository queries

**Files:**

- Modify: apps/api/src/articles/articles.repository.ts
- Modify: apps/api/src/articles/articles.repository.spec.ts

**Interfaces:**

- ArticlesRepository.list(query: ArticleListQuery): Promise<{ items: ArticleView[]; totalItems: number }>
- ArticlesRepository.findById(id: number): Promise<ArticleView | null>

- [ ] **Step 1: Write failing repository tests**

~~~ts
await expect(repository.list({
  page: 2, limit: 20, sourceId: 7,
  from: '2026-08-01T00:00:00.000Z', to: null,
})).resolves.toMatchObject({
  totalItems: 41,
  items: [{ id: 42, sources: [{ id: 7 }] }],
});
expect(database.query).toHaveBeenCalledWith(
  expect.stringContaining('EXISTS (SELECT 1 FROM article_sources'),
  expect.arrayContaining([7, '2026-08-01T00:00:00.000Z', 20, 20]),
);
await expect(repository.findById(999)).resolves.toBeNull();
~~~

Also cover no filters, the to filter, null published_at, multiple sources, and the exact COALESCE ordering.

- [ ] **Step 2: Confirm failure**

Run: pnpm --dir apps/api test -- articles.repository.spec.ts --runInBand

Expected: FAIL because read methods are absent.

- [ ] **Step 3: Implement SQL and mapping**

Build one helper that returns parameterized WHERE clauses and values. Use EXISTS for sourceId, then join and aggregate all sources:

~~~sql
COALESCE(
  jsonb_agg(
    jsonb_build_object('id', source.id, 'name', source.name, 'url', source.url)
    ORDER BY source.id ASC
  ) FILTER (WHERE source.id IS NOT NULL),
  '[]'::jsonb
) AS sources
~~~

Use the same filters for COUNT(*) and list. Add LIMIT and OFFSET as parameters; offset is (page - 1) * limit. Map snake_case rows to ArticleView only in the repository. The detail query has the same aggregate and WHERE article.id = $1.

- [ ] **Step 4: Verify and commit**

Run: pnpm --dir apps/api test -- articles.repository.spec.ts --runInBand

Expected: PASS.

~~~bash
git add apps/api/src/articles/articles.repository.ts apps/api/src/articles/articles.repository.spec.ts
git commit -m "feat(api): query persisted articles"
~~~

## Task 4: Build a resilient versioned article cache

**Files:**

- Create: apps/api/src/articles/articles-cache.service.ts
- Create: apps/api/src/articles/articles-cache.service.spec.ts

**Interfaces:**

- getList(query): Promise<ArticleListPage | null>; setList(query, page): Promise<void>
- getDetail(id): Promise<ArticleView | null>; setDetail(id, article): Promise<void>
- invalidateArticles(): Promise<void>

- [ ] **Step 1: Write failing cache tests**

~~~ts
await expect(cache.getList({
  page: 1, limit: 20, sourceId: null, from: null, to: null,
})).resolves.toEqual(page);
expect(redis.get).toHaveBeenCalledWith('articles:v1:version');
expect(redis.set).toHaveBeenCalledWith(
  expect.stringContaining('articles:v1:0:list:'),
  JSON.stringify(page),
  60,
);
await expect(cache.invalidateArticles()).resolves.toBeUndefined();
expect(redis.increment).toHaveBeenCalledWith('articles:v1:version');
~~~

Assert invalid JSON and rejected Redis calls return null and never throw.

- [ ] **Step 2: Confirm failure**

Run: pnpm --dir apps/api test -- articles-cache.service.spec.ts --runInBand

Expected: FAIL because ArticlesCacheService is absent.

- [ ] **Step 3: Implement cache namespace behavior**

Use constants CACHE_VERSION_KEY = 'articles:v1:version', CACHE_PREFIX = 'articles:v1', and CACHE_TTL_SECONDS = 60. Missing version is '0'. The list suffix is JSON.stringify({ page, limit, sourceId, from, to }); the detail suffix is the ID.

Validate cache shape before returning it: a page has an items array; a detail has a numeric id. Catch, log, and return cache misses for Redis and JSON errors. invalidateArticles catches and logs rejected increment calls, so it never changes an ingestion response.

- [ ] **Step 4: Verify and commit**

Run: pnpm --dir apps/api test -- articles-cache.service.spec.ts --runInBand

Expected: PASS.

~~~bash
git add apps/api/src/articles/articles-cache.service.ts apps/api/src/articles/articles-cache.service.spec.ts
git commit -m "feat(api): cache article read responses"
~~~

## Task 5: Add query orchestration, controller, and module wiring

**Files:**

- Create: apps/api/src/articles/articles-query.service.ts
- Create: apps/api/src/articles/articles-query.service.spec.ts
- Create: apps/api/src/articles/articles.controller.ts
- Create: apps/api/src/articles/articles.controller.spec.ts
- Modify: apps/api/src/articles/articles.module.ts

**Interfaces:**

- ArticlesQueryService.list(dto: ListArticlesDto): Promise<ArticleListPage>
- ArticlesQueryService.findOne(id: number): Promise<ArticleView>, throws NotFoundException
- GET /articles and GET /articles/:id delegate to that service.

- [ ] **Step 1: Write failing service and controller tests**

~~~ts
await expect(service.list({
  page: 1, limit: 20,
  from: '2026-08-02T00:00:00.000Z',
  to: '2026-08-01T00:00:00.000Z',
})).rejects.toBeInstanceOf(BadRequestException);

await expect(service.findOne(404)).rejects.toBeInstanceOf(NotFoundException);
await expect(controller.list(dto)).resolves.toBe(page);
await expect(controller.findOne({ id: 42 })).resolves.toBe(article);
~~~

Also prove a cache hit never calls the repository, while a miss stores a returned page.

- [ ] **Step 2: Confirm failure**

Run: pnpm --dir apps/api test -- articles-query.service.spec.ts articles.controller.spec.ts --runInBand

Expected: FAIL because service and controller are absent.

- [ ] **Step 3: Implement the HTTP surface**

Normalize missing filters to null and reject from later than to with BadRequestException. On cache miss, call the repository once, calculate totalPages with totalItems === 0 ? 0 : Math.ceil(totalItems / limit), set nextCursor: null, cache, and return. Do not cache a missing detail.

~~~ts
@Controller('articles')
export class ArticlesController {
  @Get()
  list(@Query() dto: ListArticlesDto): Promise<ArticleListPage> {
    return this.query.list(dto);
  }

  @Get(':id')
  findOne(@Param() dto: ArticleIdDto): Promise<ArticleView> {
    return this.query.findOne(dto.id);
  }
}
~~~

Update ArticlesModule to import DatabaseModule and RedisModule, provide query/cache services, register ArticlesController, and export ArticlePersistenceService plus ArticlesCacheService.

- [ ] **Step 4: Verify and commit**

~~~powershell
pnpm --dir apps/api test -- articles-query.service.spec.ts articles.controller.spec.ts articles.repository.spec.ts articles-cache.service.spec.ts --runInBand
pnpm --dir apps/api build
~~~

Expected: both PASS.

~~~bash
git add apps/api/src/articles
git commit -m "feat(api): expose cached article endpoints"
~~~

## Task 6: Invalidate cache after successful ingestion

**Files:**

- Modify: apps/api/src/ingestion/ingestion.service.ts
- Modify: apps/api/src/ingestion/ingestion.service.spec.ts

**Interfaces:**

- IngestionService consumes ArticlesCacheService.invalidateArticles(): Promise<void>.
- It invalidates once when successfulSources > 0 and not when every source fails.

- [ ] **Step 1: Write failing ingestion tests**

Add the cache mock as constructor dependency. In completed and partial fixtures assert one invalidation; in the all-failed fixture assert none:

~~~ts
expect(cache.invalidateArticles).toHaveBeenCalledTimes(1);
expect(cache.invalidateArticles).not.toHaveBeenCalled();
~~~

- [ ] **Step 2: Confirm failure**

Run: pnpm --dir apps/api test -- ingestion.service.spec.ts ingestion.controller.spec.ts --runInBand

Expected: FAIL because IngestionService neither accepts nor calls cache service.

- [ ] **Step 3: Implement post-run invalidation**

After calculating successfulSources and before returning the existing response:

~~~ts
if (successfulSources > 0) {
  await this.articlesCache.invalidateArticles();
}
~~~

Keep existing source result, error code, and HTTP response behavior exactly unchanged.

- [ ] **Step 4: Verify and commit**

Run: pnpm --dir apps/api test -- ingestion.service.spec.ts ingestion.controller.spec.ts --runInBand

Expected: PASS.

~~~bash
git add apps/api/src/ingestion/ingestion.service.ts apps/api/src/ingestion/ingestion.service.spec.ts
git commit -m "feat(api): invalidate article cache after ingestion"
~~~

## Task 7: Register configured, non-overlapping scheduled ingestion

**Files:**

- Create: apps/api/src/ingestion/ingestion-scheduler.service.ts
- Create: apps/api/src/ingestion/ingestion-scheduler.service.spec.ts
- Modify: apps/api/src/ingestion/ingestion.module.ts
- Modify: apps/api/src/app.module.ts
- Modify: .env.example

**Interfaces:**

- IngestionSchedulerService implements OnApplicationBootstrap and OnApplicationShutdown.
- runScheduledIngestion(): Promise<void> delegates to IngestionService.run once at a time.
- The registered job is named techbrief-ingestion.

- [ ] **Step 1: Write failing scheduler tests**

Mock ConfigService, SchedulerRegistry, and IngestionService. Cover disabled config, default/custom cron registration, delegation, thrown ingestion logging, overlap skip, and guard release:

~~~ts
await scheduler.runScheduledIngestion();
expect(ingestion.run).toHaveBeenCalledTimes(1);

const pending = new Promise<never>(() => undefined);
ingestion.run.mockReturnValueOnce(pending);
void scheduler.runScheduledIngestion();
await scheduler.runScheduledIngestion();
expect(ingestion.run).toHaveBeenCalledTimes(1);
~~~

Lifecycle tests call onApplicationBootstrap and verify registry.addCronJob('techbrief-ingestion', expect.anything()), then call onApplicationShutdown.

- [ ] **Step 2: Confirm failure**

Run: pnpm --dir apps/api test -- ingestion-scheduler.service.spec.ts --runInBand

Expected: FAIL because the scheduler is absent.

- [ ] **Step 3: Implement lifecycle and guard**

Read configuration strictly:

~~~ts
const enabled =
  this.config.get<string>('INGESTION_SCHEDULER_ENABLED', 'true') !== 'false';
const expression = this.config.get<string>('INGESTION_CRON', '0 * * * *');
~~~

When enabled, construct CronJob(expression, () => this.runScheduledIngestion()), add it to SchedulerRegistry under techbrief-ingestion, then start it. The runner warns and returns if isRunning; otherwise it sets isRunning, awaits ingestion.run(), logs the result summary, catches/logs errors, and clears isRunning in finally. Shutdown stops and deletes only a registered job.

Register the service in IngestionModule and ScheduleModule.forRoot() once in AppModule. Append only these lines to .env.example:

~~~dotenv
INGESTION_SCHEDULER_ENABLED=true
INGESTION_CRON=0 * * * *
~~~

- [ ] **Step 4: Verify and commit**

~~~powershell
pnpm --dir apps/api test -- ingestion-scheduler.service.spec.ts ingestion.service.spec.ts --runInBand
pnpm --dir apps/api build
~~~

Expected: both PASS.

~~~bash
git add apps/api/src/ingestion apps/api/src/app.module.ts .env.example
git commit -m "feat(api): schedule ingestion runs"
~~~

## Task 8: Document operations and verify the full task

**Files:**

- Modify: README.MD

- [ ] **Step 1: Update README**

Change status to Day 8. Document GET /articles, GET /articles/:id, page/filter defaults, 60-second cache fallback, cache invalidation after successful ingestion, both scheduler variables, and that the overlap guard is process-local.

Add these PowerShell examples:

~~~powershell
Invoke-RestMethod 'http://localhost:3000/articles?page=1&limit=20'
Invoke-RestMethod 'http://localhost:3000/articles?sourceId=1&from=2026-08-01T00:00:00.000Z'
Invoke-RestMethod 'http://localhost:3000/articles/1'
~~~

- [ ] **Step 2: Run full verification**

~~~powershell
pnpm --dir apps/api test -- --runInBand
pnpm --dir apps/api build
docker compose up -d
pnpm --dir apps/api db:migrate
pnpm --dir apps/api smoke:persistence
git diff --check
git status --short
~~~

Expected: all tests, build, migration, smoke test, and whitespace check PASS. Before the documentation commit, status shows only README.MD from this task.

- [ ] **Step 3: Commit and push**

~~~bash
git add README.MD
git commit -m "docs: document article query and scheduling"
git push origin main
~~~

Expected: main is synchronized with origin/main.

## Self-Review

- **Spec coverage:** Tasks 2, 3, and 5 deliver both read endpoints, validation, filters, deterministic pages, sources, and the reserved nextCursor field. Tasks 1 and 4 provide the resilient versioned 60-second cache. Task 6 invalidates it through the shared ingestion service; Task 7 uses that same service for dynamic cron execution and prevents local overlaps.
- **Extension seams:** DTO/query contracts, nextCursor: null, versioned key construction, ArticlesCacheService, and IngestionSchedulerService allow later cursor pagination, filters, HTTP caching, retries/history/metrics, and a distributed Redis lock without changing endpoint responsibilities.
- **Placeholder scan:** Every task has exact files, behavior, a focused failure command, a verification command, and a commit. No subagent is used.
- **Type consistency:** Controllers use DTOs; query/cache/repository share ArticleListQuery, ArticleListPage, and ArticleView; ingestion consumes invalidateArticles; scheduler consumes IngestionService.run.

