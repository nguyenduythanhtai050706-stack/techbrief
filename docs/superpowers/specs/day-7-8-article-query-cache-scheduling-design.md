# Day 7-8 Design: Article Query, Cache, and Scheduled Ingestion

## Goal

Expose persisted TechBrief articles through a stable read API, keep repeated reads fast with Redis while remaining available when Redis is unavailable, and run ingestion on a configurable schedule without overlapping executions in one API process.

## Scope

### Included

- `GET /articles` with page-based pagination and optional `sourceId`, `from`, and `to` filters.
- `GET /articles/:id` with all source provenance for one article.
- Newest-first ordering based on `published_at`, with `created_at` as the deterministic fallback for articles without a publication date.
- A Redis read-through cache for list and detail responses, with a 60-second TTL.
- Cache invalidation after an ingestion run with at least one successfully processed source.
- An `@nestjs/schedule` ingestion scheduler configured through environment variables.
- An in-memory overlap guard for scheduled ingestion in a single API process.
- Unit tests for query validation, repository contracts, caching, cache invalidation, and scheduling behavior.

### Explicit non-goals

- No web UI, authentication, roles, article editing, deletion, or source-management changes.
- No full-text search, category filter, cursor pagination, HTTP ETag support, retries, distributed job locks, queues, or metrics dashboard.
- No external Redis requirement for a successful article read: cache failures must fall back to PostgreSQL.
- No changes to the Day 5-6 ingestion, deduplication, or first-seen editorial metadata rules.

## Public API

### `GET /articles`

Accepted query parameters:

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | positive integer | `1` | Zero, negative, decimal, and non-numeric values return HTTP 400. |
| `limit` | positive integer | `20` | Maximum `100`; invalid values return HTTP 400. |
| `sourceId` | positive integer | omitted | Limits results to articles reported by that source. |
| `from` | ISO-8601 timestamp | omitted | Includes articles whose effective sort timestamp is at or after this value. |
| `to` | ISO-8601 timestamp | omitted | Includes articles whose effective sort timestamp is at or before this value. |

`from` must not be later than `to`. The effective sort timestamp is `COALESCE(published_at, created_at)`. Results are ordered by that timestamp descending and then article ID descending, so pagination remains deterministic.

The success response has this shape:

```json
{
  "items": [
    {
      "id": 42,
      "canonicalUrl": "https://example.com/article",
      "title": "Example article",
      "summary": "A short summary.",
      "publishedAt": "2026-08-17T03:00:00.000Z",
      "author": "Example Author",
      "categories": ["AI"],
      "createdAt": "2026-08-17T03:10:00.000Z",
      "lastSeenAt": "2026-08-17T04:00:00.000Z",
      "sources": [
        { "id": 7, "name": "Example Feed", "url": "https://example.com/feed.xml" }
      ]
    }
  ],
  "page": 1,
  "limit": 20,
  "totalItems": 1,
  "totalPages": 1,
  "nextCursor": null
}
```

`nextCursor` is always `null` in Day 7-8. It is reserved so a later cursor-pagination implementation can be introduced without removing or renaming fields. `totalPages` is `0` when `totalItems` is `0`.

### `GET /articles/:id`

`id` must be a positive integer. A found article uses the same article object shape as a list item, including its complete deduplicated source provenance. A missing ID returns HTTP 404 with NestJS's standard `NotFoundException` response. An invalid ID returns HTTP 400.

## Components and data flow

```text
GET /articles or GET /articles/:id
  -> ArticlesController validates request DTOs
  -> ArticlesQueryService normalizes query and builds a stable cache key
  -> ArticlesCacheService reads Redis
       -> cache hit: return parsed response
       -> cache miss or Redis error: ArticlesRepository queries PostgreSQL
            -> ArticlesCacheService stores response for 60 seconds when Redis is available

POST /ingestion/run or scheduled tick
  -> IngestionService runs the existing source-read and persistence flow
  -> if one or more sources are successful: ArticlesCacheService invalidates article cache

Nest schedule tick
  -> IngestionSchedulerService checks INGESTION_SCHEDULER_ENABLED
  -> skips when a previous scheduled run is active in this API process
  -> calls IngestionService.run()
```

`ArticlesRepository` owns parameterized PostgreSQL queries only. `ArticlesQueryService` owns request-to-domain mapping and cache orchestration. `ArticlesCacheService` owns JSON serialization, Redis operations, and cache-key namespace management. This separation keeps persistence write logic unchanged and avoids a module cycle: `IngestionModule` may depend on the articles cache service, but `ArticlesModule` does not depend on ingestion.

## Database query behavior

Article reads join `articles`, `article_sources`, and `sources`, then aggregate every reporting source per article. A `sourceId` filter uses existence semantics: it selects articles associated with that source while the returned `sources` array still includes every source associated with the article.

List reads use a total-count query with the same filters plus a paginated article query. Source provenance is sorted by source ID ascending. SQL must use parameters for all request-derived values, including filters, limit, and offset.

The repository maps database snake_case fields to the public camelCase contract in one place. PostgreSQL JSON category values are returned as string arrays; malformed or unexpected database values are not silently transformed by the HTTP controller.

## Redis cache behavior

Cache keys start with `articles:v1:` and include either the normalized list query or one article ID. Normalization means semantically identical requests, such as omitted `page` and `page=1`, use the same key. The 60-second TTL applies only after a successful PostgreSQL read.

Redis failures, invalid cached JSON, or cache values with an unexpected response shape are treated as cache misses. They are logged without exposing Redis details to API clients. PostgreSQL errors continue through NestJS's normal error handling and must not be converted into cache errors.

Invalidation uses a versioned article-cache namespace rather than Redis key scans. `ArticlesCacheService.invalidateArticles()` increments the namespace version after an ingestion run that has at least one successful source. New requests read and write keys under the new version; old TTL-bound keys expire naturally. If the version increment fails, the ingestion response remains valid and the cache may serve data for at most its 60-second TTL.

## Scheduled ingestion

`@nestjs/schedule` and `cron` are added as direct runtime dependencies. `@nestjs/schedule` provides Nest integration; the direct `cron` dependency is required by pnpm's strict dependency layout so `IngestionSchedulerService` can create a runtime-configured `CronJob` after `ConfigService` has loaded `.env`. `ScheduleModule.forRoot()` is registered once in `AppModule`.

Environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `INGESTION_SCHEDULER_ENABLED` | `true` | Set to `false` to disable scheduled ingestion without disabling the manual endpoint. |
| `INGESTION_CRON` | `0 * * * *` | Five-field cron expression for the scheduled ingestion run. |

`IngestionSchedulerService` uses the configured cron expression. Before starting a scheduled run, it checks an in-memory `isRunning` guard. If another scheduled run is active, it logs a warning and returns without invoking ingestion. The guard is released in `finally`, including when ingestion throws. A scheduled ingestion failure is logged and does not terminate the API process.

This guard intentionally protects one API process only. A later level-3 design can replace it with a Redis distributed lock, add retries/backoff and job history, and move from page to cursor pagination while preserving the current controller and service boundaries.

## Error handling

- Invalid list filters and invalid article IDs return HTTP 400 before any cache or database call.
- A missing article returns HTTP 404.
- Redis errors are non-fatal for reads, invalidation, and scheduled ingestion; they are logged server-side.
- Existing feed failures and `PERSIST_FAILED` response behavior remain unchanged.
- Unexpected database, programming, and ingestion errors keep their existing NestJS error behavior.

## Testing strategy

All unit tests run without Docker, PostgreSQL, Redis, Internet access, or live timers.

1. Request DTO/controller tests cover defaults, all valid filters, numeric and date validation, `from > to`, invalid IDs, and 404 propagation.
2. Repository tests assert parameterized count/list/detail queries, filter semantics, deterministic ordering, source aggregation, empty pages, and missing details.
3. Query-service tests cover normalized cache keys, cache hit, cache miss, malformed cache value, Redis read/write failure fallback, and 60-second cache writes.
4. Ingestion-service tests prove cache invalidation occurs after at least one successful source and does not occur when every source fails; existing Day 4-6 response contracts remain valid.
5. Scheduler tests prove disabled scheduling, successful delegation, thrown-ingestion logging, guard release, and overlap skipping.
6. The full API unit suite and `pnpm --dir apps/api build` pass. The existing database migration and persistence smoke check still pass.

## Acceptance criteria

1. `GET /articles` returns persisted articles with deterministic pagination, requested filters, and complete source provenance.
2. `GET /articles/:id` returns the matching article or a stable 404.
3. Article reads cache successful responses for 60 seconds and still succeed when Redis is down.
4. A successful manual or scheduled ingestion invalidates future article-cache reads.
5. Scheduler behavior can be enabled, disabled, and scheduled through environment configuration, and never overlaps within one API process.
6. The design keeps explicit seams for future cursor pagination, category/full-text filters, HTTP caching, retries, metrics, and a Redis distributed lock.
7. API tests, API build, migration check, persistence smoke test, and `git diff --check` pass.
