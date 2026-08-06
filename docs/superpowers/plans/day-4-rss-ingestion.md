# Day 4 RSS and Atom Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual `POST /ingestion/run` endpoint that fetches registered sources, parses RSS 2.0 and Atom feeds, and returns normalized article previews without persisting articles.

**Architecture:** `IngestionController` delegates to `IngestionService`, which lists sources through the existing `SourcesService` and processes them with `Promise.allSettled`. `FeedReaderService` owns the configured `rss-parser`, maps parser output to application types, and raises stable feed errors. No article table, migration, Redis cache, or background worker is added.

**Tech Stack:** NestJS 11, TypeScript, `rss-parser`, Jest, pnpm, existing PostgreSQL-backed `SourcesService`.

## Global Constraints

- Expose only `POST /ingestion/run`; the endpoint accepts no request body.
- Support RSS 2.0 and Atom through `rss-parser`.
- Return normalized previews only; never insert articles into PostgreSQL.
- Process sources independently with `Promise.allSettled`.
- Use a 10,000 ms parser timeout, at most 5 redirects, and User-Agent `TechBrief/0.1`.
- Return at most 50 valid items per source.
- Use stable error codes `FETCH_FAILED`, `PARSE_FAILED`, and `INVALID_FEED`; do not return raw external errors.
- Return HTTP `200` after the batch completes, including partial and all-failed batches.
- Do not add cron, queues, background jobs, retries, authentication, scraping, or Redis caching.
- Keep existing uncommitted user changes untouched and stage only files belonging to the current task in each commit.
- Follow the repository naming convention `day-N-*` for planning and specification documents.

---

## File map

### Create

- `apps/api/src/ingestion/ingestion.constants.ts` — `RSS_PARSER` injection token.
- `apps/api/src/ingestion/ingestion.types.ts` — feed parser fields, normalized items, source results, batch response, and error codes.
- `apps/api/src/ingestion/feed-reader.service.ts` — parser call, field normalization, item filtering, cap, and stable error mapping.
- `apps/api/src/ingestion/ingestion.service.ts` — source batch orchestration and summary calculation.
- `apps/api/src/ingestion/ingestion.controller.ts` — `POST /ingestion/run` HTTP boundary.
- `apps/api/src/ingestion/ingestion.module.ts` — module wiring and configured parser provider.
- `apps/api/src/ingestion/feed-reader.service.spec.ts` — parser and normalization tests.
- `apps/api/src/ingestion/ingestion.service.spec.ts` — all-success, partial, all-failed, and empty-batch tests.
- `apps/api/src/ingestion/ingestion.controller.spec.ts` — controller delegation and HTTP method contract test.

### Modify

- `apps/api/package.json` — add the `rss-parser` dependency.
- `apps/api/pnpm-lock.yaml` — lock the dependency through pnpm.
- `apps/api/src/app.module.ts` — import `IngestionModule`.
- `apps/api/src/sources/sources.module.ts` — export `SourcesService` for ingestion.
- `README.MD` — document manual ingestion and preview-only behavior.

### Do not modify

- `apps/api/src/database/migrations/001_create_sources.sql` — no article schema in Day 4.
- `apps/api/src/main.ts` — existing validation setup is sufficient.
- `apps/api/src/health/*` and `apps/api/src/redis/*` — no health or cache changes.

---

### Task 1: Add the parser dependency and ingestion contracts

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/pnpm-lock.yaml`
- Create: `apps/api/src/ingestion/ingestion.constants.ts`
- Create: `apps/api/src/ingestion/ingestion.types.ts`
- Test: `apps/api/src/ingestion/feed-reader.service.spec.ts`

**Interfaces:**
- Produces `RSS_PARSER` for the parser provider in Task 2.
- Produces `FeedErrorCode`, `NormalizedArticlePreview`, `FeedReadResult`, `IngestionSourceResult`, and `IngestionResponse` for Tasks 2–4.

- [ ] **Step 1: Add `rss-parser` from the API workspace.**

Run from `apps/api`:

```powershell
pnpm add rss-parser
```

Expected: `apps/api/package.json` contains `rss-parser` under `dependencies`, and the API lockfile records the package.

- [ ] **Step 2: Define the injection token.**

Create `apps/api/src/ingestion/ingestion.constants.ts`:

```ts
export const RSS_PARSER = Symbol('RSS_PARSER');
```

- [ ] **Step 3: Define the parser-facing and application-facing types.**

Create `apps/api/src/ingestion/ingestion.types.ts`:

```ts
export type FeedErrorCode =
  | 'FETCH_FAILED'
  | 'PARSE_FAILED'
  | 'INVALID_FEED';

export interface ParsedFeedItem {
  guid?: string;
  link?: string;
  title?: string;
  content?: string;
  contentSnippet?: string;
  isoDate?: string;
  creator?: string;
  author?: string;
  categories?: string[];
}

export interface ParsedFeed {
  items?: ParsedFeedItem[];
}

export interface FeedParser {
  parseURL(url: string): Promise<ParsedFeed>;
}

export interface NormalizedArticlePreview {
  externalId: string;
  title: string;
  url: string;
  summary: string | null;
  publishedAt: string | null;
  author: string | null;
  categories: string[];
}

export interface FeedReadResult {
  items: NormalizedArticlePreview[];
  skippedItems: number;
}

export interface IngestionSourceResult {
  sourceId: number;
  sourceName: string;
  sourceUrl: string;
  status: 'ok' | 'error';
  items: NormalizedArticlePreview[];
  skippedItems: number;
  error?: { code: FeedErrorCode };
}

export interface IngestionResponse {
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

- [ ] **Step 4: Write the first failing reader contract test.**

Add this test to `feed-reader.service.spec.ts`:

```ts
import type { FeedParser } from './ingestion.types';
import { FeedReaderService } from './feed-reader.service';

describe('FeedReaderService', () => {
  it('reads a feed through the injected parser', async () => {
    const parser: FeedParser = {
      parseURL: jest.fn().mockResolvedValue({
        items: [{
          guid: 'guid-1',
          link: 'https://example.com/article-1',
          title: 'Article 1',
        }],
      }),
    };
    const service = new FeedReaderService(parser);

    await expect(service.read('https://example.com/feed.xml')).resolves.toEqual({
      items: [{
        externalId: 'guid-1',
        title: 'Article 1',
        url: 'https://example.com/article-1',
        summary: null,
        publishedAt: null,
        author: null,
        categories: [],
      }],
      skippedItems: 0,
    });
    expect(parser.parseURL).toHaveBeenCalledWith('https://example.com/feed.xml');
  });
});
```

- [ ] **Step 5: Run the focused test and verify it fails.**

Run from `apps/api`:

```powershell
pnpm test -- feed-reader.service.spec.ts --runInBand
```

Expected: FAIL because `FeedReaderService` does not exist yet.

- [ ] **Step 6: Commit the dependency and contracts.**

```powershell
git add apps/api/package.json apps/api/pnpm-lock.yaml apps/api/src/ingestion/ingestion.constants.ts apps/api/src/ingestion/ingestion.types.ts apps/api/src/ingestion/feed-reader.service.spec.ts
git commit -m "feat(api): add day 4 ingestion contracts"
```

### Task 2: Implement feed reading and normalization

**Files:**
- Modify: `apps/api/src/ingestion/feed-reader.service.spec.ts`
- Create: `apps/api/src/ingestion/feed-reader.service.ts`
- Create: `apps/api/src/ingestion/ingestion.module.ts`

**Interfaces:**
- Consumes `FeedParser` and `ParsedFeed` from Task 1.
- Produces `FeedReaderService.read(url: string): Promise<FeedReadResult>`.
- Throws `FeedReaderError` with one of the three `FeedErrorCode` values when a source cannot be read.

- [ ] **Step 1: Add RSS and Atom normalization tests.**

Extend `feed-reader.service.spec.ts` with these cases:

```ts
it('normalizes Atom-compatible fields and fallbacks', async () => {
  const parser: FeedParser = {
    parseURL: jest.fn().mockResolvedValue({
      items: [{
        link: 'https://example.com/atom-1',
        title: 'Atom article',
        content: '<p>Atom body</p>',
        isoDate: '2026-08-06T08:00:00.000Z',
        author: 'Atom author',
        categories: ['AI', 'Cloud'],
      }],
    }),
  };

  await expect(new FeedReaderService(parser).read('https://example.com/atom.xml'))
    .resolves.toMatchObject({
      items: [{
        externalId: 'https://example.com/atom-1',
        summary: '<p>Atom body</p>',
        publishedAt: '2026-08-06T08:00:00.000Z',
        author: 'Atom author',
        categories: ['AI', 'Cloud'],
      }],
      skippedItems: 0,
    });
});

it('skips entries without a title or absolute HTTP(S) link', async () => {
  const parser: FeedParser = {
    parseURL: jest.fn().mockResolvedValue({
      items: [
        { title: 'Missing link' },
        { link: '/relative', title: 'Relative link' },
        { link: 'https://example.com/valid', title: 'Valid' },
      ],
    }),
  };

  await expect(new FeedReaderService(parser).read('https://example.com/feed.xml'))
    .resolves.toMatchObject({
      items: [expect.objectContaining({ title: 'Valid' })],
      skippedItems: 2,
    });
});

it('caps the returned entries at 50', async () => {
  const parser: FeedParser = {
    parseURL: jest.fn().mockResolvedValue({
      items: Array.from({ length: 51 }, (_, index) => ({
        guid: `guid-${index}`,
        link: `https://example.com/${index}`,
        title: `Article ${index}`,
      })),
    }),
  };

  const result = await new FeedReaderService(parser).read('https://example.com/feed.xml');

  expect(result.items).toHaveLength(50);
});
```

- [ ] **Step 2: Add stable error tests.**

Add tests that verify:

```ts
it('maps network failures to FETCH_FAILED', async () => {
  const error = Object.assign(new Error('lookup failed'), { code: 'ENOTFOUND' });
  const parser: FeedParser = { parseURL: jest.fn().mockRejectedValue(error) };

  await expect(new FeedReaderService(parser).read('https://example.com/feed.xml'))
    .rejects.toMatchObject({ code: 'FETCH_FAILED' });
});

it('maps parser failures to PARSE_FAILED', async () => {
  const parser: FeedParser = {
    parseURL: jest.fn().mockRejectedValue(new Error('malformed XML')),
  };

  await expect(new FeedReaderService(parser).read('https://example.com/feed.xml'))
    .rejects.toMatchObject({ code: 'PARSE_FAILED' });
});

it('maps a parsed feed without an items array to INVALID_FEED', async () => {
  const parser: FeedParser = {
    parseURL: jest.fn().mockResolvedValue({}),
  };

  await expect(new FeedReaderService(parser).read('https://example.com/feed.xml'))
    .rejects.toMatchObject({ code: 'INVALID_FEED' });
});
```

- [ ] **Step 3: Run the focused tests and verify the new cases fail.**

```powershell
pnpm test -- feed-reader.service.spec.ts --runInBand
```

Expected: FAIL because the service and error class are not implemented.

- [ ] **Step 4: Implement `FeedReaderError` and `FeedReaderService`.**

Create `apps/api/src/ingestion/feed-reader.service.ts` with these behaviors:

```ts
export class FeedReaderError extends Error {
  constructor(
    public readonly code: FeedErrorCode,
  ) {
    super(code);
    this.name = 'FeedReaderError';
  }
}
```

`FeedReaderService` must:

1. call `parser.parseURL(url)` exactly once;
2. treat a thrown error with `code` in `ENOTFOUND`, `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`, or `UND_ERR_CONNECT_TIMEOUT` as `FETCH_FAILED`;
3. map other parser rejections to `PARSE_FAILED`;
4. throw `INVALID_FEED` when the result is missing or `items` is not an array;
5. inspect only the first 50 feed entries;
6. require a non-empty title and an absolute `http` or `https` URL;
7. set `externalId` to `guid` when non-empty, otherwise the valid item URL;
8. set `summary` with `contentSnippet ?? content ?? null`;
9. convert a valid `isoDate` to `toISOString()`, otherwise use `null`;
10. set `author` with `creator ?? author ?? null`;
11. preserve string categories and use `[]` when categories are absent;
12. increment `skippedItems` for invalid entries in the inspected slice.

Keep the original error out of the response. `FeedReaderError` exposes only the stable `code` used by the orchestration layer.

- [ ] **Step 5: Add the configured parser provider and module.**

Create `apps/api/src/ingestion/ingestion.module.ts`:

```ts
import { Module } from '@nestjs/common';
import Parser from 'rss-parser';
import { RSS_PARSER } from './ingestion.constants';
import { FeedReaderService } from './feed-reader.service';

@Module({
  providers: [
    {
      provide: RSS_PARSER,
      useFactory: () =>
        new Parser({
          timeout: 10_000,
          maxRedirects: 5,
          headers: { 'User-Agent': 'TechBrief/0.1' },
        }),
    },
    FeedReaderService,
  ],
  exports: [FeedReaderService],
})
export class IngestionModule {}
```

Inject the token in `FeedReaderService` with `@Inject(RSS_PARSER)` and type it as `FeedParser` so unit tests can use a small mock.

- [ ] **Step 6: Run the focused tests and build.**

```powershell
pnpm test -- feed-reader.service.spec.ts --runInBand
pnpm build
```

Expected: all feed-reader tests and the API build pass without Internet access, PostgreSQL, or Redis.

- [ ] **Step 7: Commit the feed reader.**

```powershell
git add apps/api/src/ingestion/feed-reader.service.ts apps/api/src/ingestion/feed-reader.service.spec.ts apps/api/src/ingestion/ingestion.module.ts
git commit -m "feat(api): add rss and atom feed reader"
```

### Task 3: Implement batch orchestration

**Files:**
- Create: `apps/api/src/ingestion/ingestion.service.ts`
- Create: `apps/api/src/ingestion/ingestion.service.spec.ts`
- Modify: `apps/api/src/ingestion/ingestion.module.ts`

**Interfaces:**
- Consumes `SourcesService.list(): Promise<Source[]>` and `FeedReaderService.read(url): Promise<FeedReadResult>`.
- Produces `IngestionService.run(): Promise<IngestionResponse>`.

- [ ] **Step 1: Write the failing orchestration tests.**

Create `ingestion.service.spec.ts` with mocked adapters and these cases:

```ts
const source = (id: number, name: string, url: string): Source => ({
  id,
  name,
  url,
  created_at: new Date('2026-08-06T08:00:00.000Z'),
});

it('returns completed and aggregates all successful sources', async () => {
  sources.list.mockResolvedValue([
    source(1, 'One', 'https://one.example/feed.xml'),
    source(2, 'Two', 'https://two.example/feed.xml'),
  ]);
  reader.read
    .mockResolvedValueOnce({ items: [item('one')], skippedItems: 0 })
    .mockResolvedValueOnce({ items: [item('two')], skippedItems: 1 });

  await expect(service.run()).resolves.toMatchObject({
    status: 'completed',
    summary: {
      totalSources: 2,
      successfulSources: 2,
      failedSources: 0,
      totalItems: 2,
    },
  });
});

it('returns partial while retaining successful and failed source results', async () => {
  sources.list.mockResolvedValue([
    source(1, 'One', 'https://one.example/feed.xml'),
    source(2, 'Two', 'https://two.example/feed.xml'),
  ]);
  reader.read
    .mockResolvedValueOnce({ items: [item('one')], skippedItems: 0 })
    .mockRejectedValueOnce(new FeedReaderError('FETCH_FAILED'));

  const result = await service.run();

  expect(result.status).toBe('partial');
  expect(result.sources[0].status).toBe('ok');
  expect(result.sources[1]).toMatchObject({
    status: 'error',
    items: [],
    skippedItems: 0,
    error: { code: 'FETCH_FAILED' },
  });
});

it('returns failed when every source fails', async () => {
  sources.list.mockResolvedValue([source(1, 'One', 'https://one.example/feed.xml')]);
  reader.read.mockRejectedValue(new FeedReaderError('PARSE_FAILED'));

  await expect(service.run()).resolves.toMatchObject({
    status: 'failed',
    summary: { totalSources: 1, successfulSources: 0, failedSources: 1, totalItems: 0 },
  });
});

it('returns completed with empty results when no sources exist', async () => {
  sources.list.mockResolvedValue([]);

  await expect(service.run()).resolves.toEqual({
    status: 'completed',
    summary: { totalSources: 0, successfulSources: 0, failedSources: 0, totalItems: 0 },
    sources: [],
  });
});
```

Define the `item()` test helper as a valid `NormalizedArticlePreview`, and mock `SourcesService.list` and `FeedReaderService.read` with `jest.fn()`.

- [ ] **Step 2: Run the focused test and verify it fails.**

```powershell
pnpm test -- ingestion.service.spec.ts --runInBand
```

Expected: FAIL because `IngestionService` does not exist.

- [ ] **Step 3: Implement `IngestionService.run()`.**

The implementation must:

1. await `sourcesService.list()` once;
2. call `feedReader.read(source.url)` once for every source;
3. use `Promise.allSettled` so results stay in source-list order;
4. map fulfilled reads to `{ sourceId, sourceName, sourceUrl, status: 'ok', items, skippedItems }`;
5. map only `FeedReaderError` rejections to `{ status: 'error', items: [], skippedItems: 0, error: { code } }`;
6. rethrow unknown programming errors so NestJS handles them as normal server errors;
7. calculate `successfulSources`, `failedSources`, and `totalItems` from the mapped results;
8. set `status` to `completed` for zero failures, `partial` for mixed outcomes, and `failed` when every source failed;
9. log the source id and stable error code with NestJS `Logger`, without logging raw feed errors in the response.

Use a small private `readSource` helper only if it keeps the source metadata mapping readable; keep SQL out of this service.

- [ ] **Step 4: Register orchestration in the module.**

Modify `ingestion.module.ts` to import `SourcesModule`, add `IngestionService` to `providers`, and export `IngestionService` for the controller task:

```ts
import { Module } from '@nestjs/common';
import Parser from 'rss-parser';
import { SourcesModule } from '../sources/sources.module';
import { RSS_PARSER } from './ingestion.constants';
import { FeedReaderService } from './feed-reader.service';
import { IngestionService } from './ingestion.service';

@Module({
  imports: [SourcesModule],
  providers: [
    {
      provide: RSS_PARSER,
      useFactory: () =>
        new Parser({
          timeout: 10_000,
          maxRedirects: 5,
          headers: { 'User-Agent': 'TechBrief/0.1' },
        }),
    },
    FeedReaderService,
    IngestionService,
  ],
  controllers: [],
  exports: [FeedReaderService, IngestionService],
})
export class IngestionModule {}
```

Keep the existing parser provider object in the module; the snippet shows only the changed module shape.

- [ ] **Step 5: Run focused tests and build.**

```powershell
pnpm test -- ingestion.service.spec.ts --runInBand
pnpm build
```

Expected: orchestration tests and build pass without external services.

- [ ] **Step 6: Commit the batch service.**

```powershell
git add apps/api/src/ingestion/ingestion.service.ts apps/api/src/ingestion/ingestion.service.spec.ts apps/api/src/ingestion/ingestion.module.ts
git commit -m "feat(api): orchestrate source ingestion batches"
```

### Task 4: Wire the endpoint into NestJS

**Files:**
- Create: `apps/api/src/ingestion/ingestion.controller.ts`
- Create: `apps/api/src/ingestion/ingestion.controller.spec.ts`
- Modify: `apps/api/src/ingestion/ingestion.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/sources/sources.module.ts`

**Interfaces:**
- Consumes `IngestionService.run(): Promise<IngestionResponse>`.
- Produces `POST /ingestion/run` with HTTP `200` and an `IngestionResponse` body.

- [ ] **Step 1: Write the failing controller test.**

Create `ingestion.controller.spec.ts`:

```ts
describe('IngestionController', () => {
  it('delegates POST /ingestion/run to the ingestion service', async () => {
    const response = {
      status: 'completed',
      summary: { totalSources: 0, successfulSources: 0, failedSources: 0, totalItems: 0 },
      sources: [],
    } as const;
    const service = { run: jest.fn().mockResolvedValue(response) };
    const controller = new IngestionController(service as never);

    await expect(controller.run()).resolves.toBe(response);
    expect(service.run).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails.**

```powershell
pnpm test -- ingestion.controller.spec.ts --runInBand
```

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement the controller.**

Create `ingestion.controller.ts`:

```ts
import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import type { IngestionResponse } from './ingestion.types';

@Controller('ingestion')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  run(): Promise<IngestionResponse> {
    return this.ingestionService.run();
  }
}
```

The controller must not accept a body, perform SQL, call `rss-parser`, or catch feed errors.

- [ ] **Step 4: Wire the module and source export.**

Modify `sources.module.ts`:

```ts
@Module({
  imports: [DatabaseModule],
  controllers: [SourcesController],
  providers: [SourcesService],
  exports: [SourcesService],
})
export class SourcesModule {}
```

Modify `ingestion.module.ts` to add `IngestionController` to `controllers` and keep `SourcesModule` in `imports`.

Modify `app.module.ts` to import `IngestionModule` alongside the existing feature modules.

- [ ] **Step 5: Run the endpoint unit test, full unit suite, and build.**

```powershell
pnpm test -- ingestion.controller.spec.ts --runInBand
pnpm test -- --runInBand
pnpm build
```

Expected: the endpoint test, all existing tests, and the API build pass without PostgreSQL, Redis, or Internet access.

- [ ] **Step 6: Commit the HTTP endpoint.**

```powershell
git add apps/api/src/ingestion/ingestion.controller.ts apps/api/src/ingestion/ingestion.controller.spec.ts apps/api/src/ingestion/ingestion.module.ts apps/api/src/app.module.ts apps/api/src/sources/sources.module.ts
git commit -m "feat(api): expose manual ingestion endpoint"
```

### Task 5: Document and verify Day 4

**Files:**
- Modify: `README.MD`
- Verify: all files from Tasks 1–4.

**Interfaces:**
- Consumes the running API and existing `POST /sources` endpoint.
- Produces a repeatable local preview-ingestion verification flow.

- [ ] **Step 1: Add the ingestion workflow to the README.**

Update the current status to Day 4 and add this flow after the source endpoint examples:

```powershell
$body = @{ name = 'TechBrief Demo'; url = 'https://example.com/feed.xml' } | ConvertTo-Json
Invoke-RestMethod http://localhost:3000/sources -Method Post -ContentType 'application/json' -Body $body
Invoke-RestMethod http://localhost:3000/ingestion/run -Method Post
```

Document that the endpoint reads all registered sources, supports RSS 2.0 and Atom, returns normalized previews, reports per-source errors, and does not save articles yet. State that article persistence is the next day’s work.

- [ ] **Step 2: Run the full offline verification.**

From `apps/api`:

```powershell
pnpm test -- --runInBand
pnpm build
```

From the repository root:

```powershell
git diff --check
```

Expected: all tests pass, the build passes, and the diff has no whitespace errors attributable to the current changes. Existing unrelated working-tree warnings must remain unstaged.

- [ ] **Step 3: Run the optional local smoke check when dependencies are available.**

Start the existing PostgreSQL, Redis, and API services using the Day 3 README commands. Register a real or locally hosted feed source, then run:

```powershell
Invoke-RestMethod http://localhost:3000/ingestion/run -Method Post
```

Expected: HTTP `200` with `status` `completed`, `partial`, or `failed`; no article row is created because Day 4 has no article migration.

- [ ] **Step 4: Commit the documentation.**

```powershell
git add README.MD
git commit -m "docs: document day 4 ingestion preview"
```

## Final verification checklist

- [ ] `rss-parser` is present in the API dependencies and lockfile.
- [ ] `POST /ingestion/run` has no request body and explicitly returns HTTP `200`.
- [ ] RSS 2.0 and Atom-compatible parser output normalize to the same application type.
- [ ] Parser timeout, redirect limit, and User-Agent are configured exactly once in the module provider.
- [ ] Invalid entries are skipped, counted, and never returned.
- [ ] Each source is capped at 50 returned items.
- [ ] `Promise.allSettled` preserves successful results when another source fails.
- [ ] Only stable error codes are exposed to clients.
- [ ] Unknown programming errors still use NestJS's normal error pipeline.
- [ ] No article SQL, migration, persistence, cron, queue, or cache code was added.
- [ ] Existing API tests still pass.
- [ ] API build passes.
- [ ] README documents the manual preview flow.
