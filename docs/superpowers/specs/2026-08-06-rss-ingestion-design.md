# Day 4 Design: RSS and Atom Ingestion Preview

## Goal

Add a manual ingestion endpoint that fetches every registered source, parses RSS 2.0 and Atom feeds, and returns normalized article previews without persisting articles.

## Learning outcomes

By the end of Day 4, the learner should be able to explain:

- how an HTTP endpoint can orchestrate work across multiple external feeds;
- why a feed reader should be isolated from the controller and batch orchestration;
- how RSS and Atom fields are normalized into one application-facing shape;
- how `Promise.allSettled` keeps one failed feed from hiding successful feeds;
- why network timeouts, redirect limits, and stable error codes matter for external integrations.

## Scope

### Included

- `POST /ingestion/run` with no request body;
- reading all registered sources through the existing `SourcesService`;
- fetching and parsing RSS 2.0 and Atom feeds with `rss-parser`;
- normalizing feed entries into a stable preview shape;
- per-source success or failure reporting;
- unit tests with RSS, Atom, malformed-feed, and batch-result cases;
- README documentation for the manual ingestion flow.

### Deliberate non-goals

- no article PostgreSQL table or migration;
- no article persistence or deduplication in the database;
- no cron, queue, background worker, or retry scheduler;
- no Redis caching;
- no article content scraping beyond fields supplied by the feed;
- no authentication or user-specific ingestion jobs.

## Architecture

```text
POST /ingestion/run
        |
        v
IngestionController
        |
        v
IngestionService ----> SourcesService.list()
        |
        +----> FeedReaderService.read(source.url)
                         |
                         +----> rss-parser
                         +----> normalized preview items
```

`IngestionController` exposes the HTTP boundary and contains no feed or batch logic. `IngestionService` obtains the registered sources, invokes the reader for each source, and aggregates independent outcomes with `Promise.allSettled`. `FeedReaderService` owns parser configuration and maps the library output to TechBrief's stable types.

`IngestionModule` imports `SourcesModule`. `SourcesModule` exports `SourcesService` so the ingestion layer can reuse the existing source boundary instead of issuing its own SQL. A `RSS_PARSER` injection token provides one configured parser instance and allows the feed-reader tests to inject a mock parser.

## Feed reader configuration

The parser provider uses these fixed settings for the first implementation:

- timeout: `10000` milliseconds per source;
- maximum redirects: `5`;
- User-Agent: `TechBrief/0.1`;
- input URLs: only the already validated `http` and `https` source URLs.

The implementation uses `rss-parser` for both RSS and Atom input, then applies an application-owned mapper. The mapper prevents downstream code from depending on parser-specific field names.

## Normalized article preview

Each valid feed entry produces:

```ts
interface NormalizedArticlePreview {
  externalId: string;
  title: string;
  url: string;
  summary: string | null;
  publishedAt: string | null;
  author: string | null;
  categories: string[];
}
```

Mapping rules:

- `externalId` uses `guid`, falling back to the entry URL;
- `title` is required;
- `url` is required and must be an absolute `http` or `https` URL;
- `summary` uses `contentSnippet`, falling back to `content`, then `null`;
- `publishedAt` uses a valid ISO date from the parser, otherwise `null`;
- `author` uses `creator`, falling back to `author`, then `null`;
- `categories` is always an array and defaults to `[]`;
- entries missing a title or valid URL are skipped;
- at most 50 entries are returned per source.

The source metadata is kept outside each item:

```ts
interface IngestionSourceResult {
  sourceId: number;
  sourceName: string;
  sourceUrl: string;
  status: 'ok' | 'error';
  items: NormalizedArticlePreview[];
  skippedItems: number;
  error?: {
    code: 'FETCH_FAILED' | 'PARSE_FAILED' | 'INVALID_FEED';
  };
}
```

## HTTP response

The endpoint returns HTTP `200` after the batch has completed, including when individual sources fail. The stable response shape is:

```ts
interface IngestionResponse {
  status: 'completed' | 'partial' | 'failed';
  summary: {
    totalSources: number;
    successfulSources: number;
    failedSources: number;
    totalItems: number;
  };
  sources: IngestionSourceResult[];
}
```

Status rules:

- `completed`: no source failed, including the no-sources case;
- `partial`: at least one source succeeded and at least one failed;
- `failed`: every registered source failed.

Raw network, parser, or response-body errors are logged server-side with the source id and failure code, but are not returned to clients.

## Failure behavior

Each source is processed independently. A timeout, network failure, malformed XML, or unusable feed produces an error result for that source and does not reject the complete batch.

The reader maps failures to stable codes:

- `FETCH_FAILED`: the request could not complete successfully;
- `PARSE_FAILED`: the response could not be parsed as RSS or Atom;
- `INVALID_FEED`: parsing succeeded but the required feed or entry structure is unusable.

Unexpected programming errors are still thrown and handled by NestJS's normal error pipeline; they are not silently converted into a successful source result.

## Module and file boundaries

Create:

- `apps/api/src/ingestion/ingestion.constants.ts` — `RSS_PARSER` injection token;
- `apps/api/src/ingestion/ingestion.types.ts` — normalized item and response types;
- `apps/api/src/ingestion/feed-reader.service.ts` — parser configuration, fetch, and normalization;
- `apps/api/src/ingestion/ingestion.service.ts` — source batch orchestration and aggregation;
- `apps/api/src/ingestion/ingestion.controller.ts` — `POST /ingestion/run`;
- `apps/api/src/ingestion/ingestion.module.ts` — module wiring and parser provider;
- `apps/api/src/ingestion/feed-reader.service.spec.ts` — parser and normalization tests;
- `apps/api/src/ingestion/ingestion.service.spec.ts` — batch outcome tests.

Modify:

- `apps/api/package.json` and `apps/api/pnpm-lock.yaml` — add the `rss-parser` runtime dependency, which includes the TypeScript declarations used by the API;
- `apps/api/src/app.module.ts` — import `IngestionModule`;
- `apps/api/src/sources/sources.module.ts` — export `SourcesService`;
- `README.MD` — document the endpoint and preview-only behavior.

No database migration changes are required.

## Testing strategy

`FeedReaderService` tests inject a mocked parser and verify:

- RSS-shaped parser output becomes the normalized type;
- Atom-shaped parser output becomes the same normalized type;
- `guid` falls back to URL;
- content, dates, authors, and categories use the documented fallbacks;
- entries without a title or valid URL are skipped;
- parser rejection maps to the expected failure code;
- the configured parser receives the expected URL and parser options through the provider contract.

`IngestionService` tests mock `SourcesService.list()` and `FeedReaderService.read()` and verify:

- all successful sources produce `completed` and correct totals;
- mixed outcomes produce `partial` while retaining successful items;
- all failed sources produce `failed`;
- an empty source list produces a completed empty response.

The full API unit suite and TypeScript build must pass without Docker or Internet access. The manual smoke check may use a known public feed only after unit verification, but network access is not part of the automated test requirement.

## Acceptance criteria

Day 4 is complete when:

1. `POST /ingestion/run` reads every registered source and returns a stable batch response.
2. RSS 2.0 and Atom entries map to the same normalized preview shape.
3. Each source is capped at 50 items and network requests time out after 10 seconds.
4. A failed source is reported with a stable code and does not hide successful sources.
5. No article rows are written to PostgreSQL.
6. Unit tests and the API build pass without external services.
7. The README documents how to register a source and run the manual preview ingestion.
