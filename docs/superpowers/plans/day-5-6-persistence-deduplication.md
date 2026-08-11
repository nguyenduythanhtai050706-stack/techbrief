# Day 5-6 Article Persistence and Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist normalized feed entries as idempotent PostgreSQL articles, retain source provenance, and report inserted/duplicate totals from ingestion.

**Architecture:** Feed reading stays unchanged. The new `articles` module separates pure URL/fingerprint creation, repository SQL, and one-item persistence. `IngestionService` keeps concurrent feed reads, then persists each successful source’s previews sequentially to calculate stable counters and isolate source failures.

**Tech Stack:** NestJS 11, TypeScript 5, Jest 30, PostgreSQL 17, `pg`, Node `crypto`, and `rss-parser`.

## Global Constraints

- Do not add runtime dependencies.
- Keep `POST /ingestion/run` bodyless and HTTP 200; exclude UI, cron, queue, Redis caching, authentication, scraping, and semantic/LLM deduplication.
- Canonical URLs remove fragments, `utm_*`, `gclid`, and `fbclid`, retaining meaningful query parameters.
- Compute a cross-URL fingerprint only from normalized title plus normalized summary. The summary must contain at least 80 characters after removing HTML tags and collapsing whitespace.
- A `NULL` fingerprint means canonical-URL-only deduplication. Duplicate feeds must never overwrite editorial metadata.
- Unit tests use mocks only. The smoke test uses PostgreSQL and a local HTTP feed fixture, never Internet.
- Documentation filenames use `day-N-*`, not calendar dates.

---

## File Structure

- `apps/api/src/database/migrations/002_create_articles.sql` — idempotent tables and constraints.
- `apps/api/src/database/migrate.ts` — ordered migration runner.
- `apps/api/src/articles/article.types.ts` — persistence contracts.
- `apps/api/src/articles/article-deduplicator.ts` and `.spec.ts` — pure canonical URL and optional fingerprint.
- `apps/api/src/articles/articles.repository.ts` and `.spec.ts` — parameterized persistence and provenance SQL.
- `apps/api/src/articles/article-persistence.service.ts` and `.spec.ts` — one-preview orchestration and database error boundary.
- `apps/api/src/articles/articles.module.ts` — Nest registration.
- `apps/api/src/ingestion/ingestion.types.ts`, `.service.ts`, `.service.spec.ts`, `.module.ts` — persistence integration and response contract.
- `apps/api/test/fixtures/persistence-smoke-feed.xml` and `apps/api/test/persistence-smoke.ts` — two-pass local smoke check.
- `apps/api/package.json`, `README.md` — smoke command and operating instructions.

### Task 1: Add database schema and ordered migrations

**Files:**
- Create: `apps/api/src/database/migrations/002_create_articles.sql`
- Modify: `apps/api/src/database/migrate.ts`

**Interfaces:**
- Consumes: `sources(id)` from `001_create_sources.sql`.
- Produces: `articles` and `article_sources` for `ArticlesRepository`.

- [ ] **Step 1: Verify the missing-table baseline**

Run: `pnpm --dir apps/api db:migrate`, then `psql -h localhost -U techbrief -d techbrief -c "\d articles"`.

Expected: the migration succeeds and PostgreSQL reports that `articles` does not yet exist.

- [ ] **Step 2: Create the new idempotent migration**

```sql
CREATE TABLE IF NOT EXISTS articles (
  id SERIAL PRIMARY KEY,
  canonical_url TEXT NOT NULL UNIQUE,
  content_fingerprint CHAR(64) UNIQUE,
  title VARCHAR(500) NOT NULL,
  summary TEXT,
  published_at TIMESTAMPTZ,
  author VARCHAR(255),
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS article_sources (
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (article_id, source_id, external_id)
);
```

- [ ] **Step 3: Run migrations in sequence**

Replace the single filename in `migrate.ts` with:

```ts
const migrationFiles = [
  '001_create_sources.sql',
  '002_create_articles.sql',
] as const;
for (const fileName of migrationFiles) {
  const path = resolve(process.cwd(), 'src/database/migrations', fileName);
  await app.get(DatabaseService).query(await readFile(path, 'utf8'));
  console.log(`Migration ${fileName} completed.`);
}
```

- [ ] **Step 4: Verify idempotence and commit**

Run `pnpm --dir apps/api db:migrate` twice, then inspect both tables with `psql \d`. Both commands must pass.

```bash
git add apps/api/src/database/migrations/002_create_articles.sql apps/api/src/database/migrate.ts
git commit -m "feat(api): add article persistence schema"
```

### Task 2: Build deterministic article preparation with TDD

**Files:**
- Create: `apps/api/src/articles/article.types.ts`
- Create: `apps/api/src/articles/article-deduplicator.ts`
- Test: `apps/api/src/articles/article-deduplicator.spec.ts`

**Interfaces:**
- Consumes: `NormalizedArticlePreview`.
- Produces: `ArticleDeduplicator.prepare(preview): PreparedArticle`.

- [ ] **Step 1: Write a failing deduplicator test**

```ts
const preview = (overrides = {}) => ({
  externalId: 'guid-1', title: '  AI Guide ',
  url: 'https://news.example/article?b=2&utm_source=rss&a=1#comments',
  summary: `<p>${'Useful article content. '.repeat(5)}</p>`,
  publishedAt: null, author: null, categories: [], ...overrides,
});

it('removes tracking parameters but keeps meaningful ones', () => {
  expect(new ArticleDeduplicator().prepare(preview()).canonicalUrl)
    .toBe('https://news.example/article?a=1&b=2');
});
it('matches detailed equal content at different URLs', () => {
  const service = new ArticleDeduplicator();
  expect(service.prepare(preview()).contentFingerprint).toBe(
    service.prepare(preview({ url: 'https://syndicate.example/story' })).contentFingerprint,
  );
});
it('does not fingerprint short content', () => {
  expect(new ArticleDeduplicator().prepare(preview({ summary: 'Short' })).contentFingerprint)
    .toBeNull();
});
```

- [ ] **Step 2: Confirm failure**

Run: `pnpm --dir apps/api test -- article-deduplicator.spec.ts --runInBand`

Expected: FAIL because `ArticleDeduplicator` is absent.

- [ ] **Step 3: Define contracts and implement the minimum behavior**

```ts
export interface PreparedArticle extends NormalizedArticlePreview {
  canonicalUrl: string;
  contentFingerprint: string | null;
}
export interface ArticleRecord {
  id: number;
  canonical_url: string;
  content_fingerprint: string | null;
}
export interface ArticlePersistenceInput extends PreparedArticle { sourceId: number; }
export type ArticlePersistenceOutcome = 'inserted' | 'duplicate';

function normalizeText(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}
const summary = normalizeText(preview.summary ?? '');
const contentFingerprint = summary.length < 80 ? null : createHash('sha256')
  .update(`${normalizeText(preview.title)}\n${summary}`)
  .digest('hex');
```

`prepare` must use `new URL(preview.url)`, clear `hash`, delete query keys whose lowercase form is `gclid`, `fbclid`, or begins `utm_`, and call `searchParams.sort()` before returning the original preview plus canonical URL and fingerprint.

- [ ] **Step 4: Add edge cases, verify, and commit**

Add tests for `summary: null` and changed detailed summary. Run the focused test; it must PASS.

```bash
git add apps/api/src/articles/article.types.ts apps/api/src/articles/article-deduplicator.ts apps/api/src/articles/article-deduplicator.spec.ts
git commit -m "feat(api): add deterministic article fingerprinting"
```

### Task 3: Persist articles and source provenance with TDD

**Files:**
- Create: `apps/api/src/articles/articles.repository.ts`
- Test: `apps/api/src/articles/articles.repository.spec.ts`

**Interfaces:**
- Consumes: `DatabaseService`, `ArticlePersistenceInput`, `ArticleRecord`.
- Produces: `ArticlesRepository.persist(input): Promise<ArticlePersistenceOutcome>`.

- [ ] **Step 1: Write failing repository contract tests**

Mock `database.query`. Cover: insert after two empty lookups; canonical URL duplicate; non-null fingerprint duplicate; provenance upsert; and `23505` insert race followed by a successful re-read. The insertion test must assert:

```ts
await expect(repository.persist(input)).resolves.toBe('inserted');
expect(database.query).toHaveBeenCalledWith(
  expect.stringContaining('INSERT INTO articles'),
  expect.arrayContaining([input.canonicalUrl, input.contentFingerprint]),
);
expect(database.query).toHaveBeenCalledWith(
  expect.stringContaining('ON CONFLICT (article_id, source_id, external_id)'),
  [41, input.sourceId, input.externalId],
);
```

- [ ] **Step 2: Confirm failure**

Run: `pnpm --dir apps/api test -- articles.repository.spec.ts --runInBand`

Expected: FAIL because `ArticlesRepository` is absent.

- [ ] **Step 3: Implement parameterized repository behavior**

Search canonical URL first, then only a non-null fingerprint:

```sql
SELECT id, canonical_url, content_fingerprint FROM articles WHERE canonical_url = $1 LIMIT 1;
SELECT id, canonical_url, content_fingerprint FROM articles WHERE content_fingerprint = $1 LIMIT 1;
UPDATE articles SET last_seen_at = NOW() WHERE id = $1;
INSERT INTO article_sources (article_id, source_id, external_id)
VALUES ($1, $2, $3)
ON CONFLICT (article_id, source_id, external_id)
DO UPDATE SET last_seen_at = NOW();
```

If neither lookup finds a row, insert the first-seen title, summary, publication date, author, and `JSON.stringify(input.categories)` cast through `$6::jsonb`. A duplicate path only updates `last_seen_at` and provenance; never issue an editorial update. On an insertion `23505`, re-run the two lookups and return `duplicate` if one now finds a row; otherwise rethrow.

- [ ] **Step 4: Verify and commit**

Run the focused test; it must PASS and duplicate tests must assert no SQL containing `UPDATE articles SET title`.

```bash
git add apps/api/src/articles/articles.repository.ts apps/api/src/articles/articles.repository.spec.ts
git commit -m "feat(api): persist deduplicated article provenance"
```

### Task 4: Add the persistence service and Nest module with TDD

**Files:**
- Create: `apps/api/src/articles/article-persistence.service.ts`
- Create: `apps/api/src/articles/articles.module.ts`
- Test: `apps/api/src/articles/article-persistence.service.spec.ts`

**Interfaces:**
- Consumes: `ArticleDeduplicator.prepare` and `ArticlesRepository.persist`.
- Produces: `ArticlePersistenceService.persist(sourceId, preview)` and `ArticlePersistenceError`.

- [ ] **Step 1: Write failing boundary tests**

Test that the service forwards `{ ...preparedArticle, sourceId }`, preserves an `inserted` outcome, maps an error with database code `08006` to `{ code: 'PERSIST_FAILED' }`, and rethrows `new Error('programming bug')` unchanged.

- [ ] **Step 2: Confirm failure**

Run: `pnpm --dir apps/api test -- article-persistence.service.spec.ts --runInBand`

Expected: FAIL because the service is absent.

- [ ] **Step 3: Implement the explicit error boundary**

```ts
export class ArticlePersistenceError extends Error {
  readonly code = 'PERSIST_FAILED' as const;
  constructor() { super('PERSIST_FAILED'); this.name = 'ArticlePersistenceError'; }
}

async persist(sourceId: number, preview: NormalizedArticlePreview): Promise<ArticlePersistenceOutcome> {
  try {
    return await this.repository.persist({ ...this.deduplicator.prepare(preview), sourceId });
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string') {
      throw new ArticlePersistenceError();
    }
    throw error;
  }
}
```

Create `ArticlesModule` that imports `DatabaseModule`, provides the deduplicator, repository, and service, and exports only `ArticlePersistenceService`.

- [ ] **Step 4: Verify and commit**

Run the three article spec files with `--runInBand`; they must PASS.

```bash
git add apps/api/src/articles/article-persistence.service.ts apps/api/src/articles/article-persistence.service.spec.ts apps/api/src/articles/articles.module.ts
git commit -m "feat(api): add article persistence service"
```

### Task 5: Integrate persistence into ingestion with TDD

**Files:**
- Modify: `apps/api/src/ingestion/ingestion.types.ts`
- Modify: `apps/api/src/ingestion/ingestion.service.ts`
- Modify: `apps/api/src/ingestion/ingestion.module.ts`
- Test: `apps/api/src/ingestion/ingestion.service.spec.ts`

**Interfaces:**
- Consumes: `ArticlePersistenceService.persist(sourceId, preview): Promise<'inserted' | 'duplicate'>`.
- Produces: `insertedItems` and `duplicateItems` on successful sources; `PERSIST_FAILED` on persistence failure.

- [ ] **Step 1: Write failing ingestion behavior tests**

Give the service a persistence mock returning `inserted`, then `duplicate`. Expect each successful source to include:

```ts
status: 'ok',
items: [item('one'), item('two')],
skippedItems: 0,
insertedItems: 1,
duplicateItems: 1,
```

Add a read-failure test proving persistence is not called for the failed source. Add a persistence-failure test proving only that source returns `status: 'error'`, `items: []`, `skippedItems: 0`, and `error: { code: 'PERSIST_FAILED' }`, while another source remains successful.

- [ ] **Step 2: Confirm failure**

Run: `pnpm --dir apps/api test -- ingestion.service.spec.ts --runInBand`

Expected: FAIL because there is no persistence dependency or counter fields.

- [ ] **Step 3: Add a discriminated response contract**

Define `IngestionErrorCode = FeedErrorCode | 'PERSIST_FAILED'`. Replace the current result interface with an `ok` result containing `insertedItems` and `duplicateItems`, and an `error` result where `items: []` and `error.code: IngestionErrorCode`.

- [ ] **Step 4: Persist successful reads and wire the module**

Inject `ArticlePersistenceService`. For every fulfilled feed read, use `for...of` with `await this.persistence.persist(source.id, preview)`, increment the matching counter, and return the successful shape. Catch only `ArticlePersistenceError`, log source ID plus code, and return the error shape; preserve existing `FeedReaderError` and unexpected-error behavior. Add `ArticlesModule` to `IngestionModule.imports`.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
pnpm --dir apps/api test -- ingestion.service.spec.ts ingestion.controller.spec.ts --runInBand
pnpm --dir apps/api build
```

Both commands must PASS.

```bash
git add apps/api/src/ingestion/ingestion.types.ts apps/api/src/ingestion/ingestion.service.ts apps/api/src/ingestion/ingestion.service.spec.ts apps/api/src/ingestion/ingestion.module.ts
git commit -m "feat(api): report persisted ingestion outcomes"
```

### Task 6: Add local smoke verification and update documentation

**Files:**
- Create: `apps/api/test/fixtures/persistence-smoke-feed.xml`
- Create: `apps/api/test/persistence-smoke.ts`
- Modify: `apps/api/package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: real `FeedReaderService`, `ArticlePersistenceService`, `SourcesService`, and `DatabaseService` after Task 1 migration.
- Produces: `pnpm --dir apps/api smoke:persistence` with one article and one provenance row after two passes.

- [ ] **Step 1: Write the fixture and failing smoke assertion**

Use an RSS fixture whose `<guid>` and `<link>` contain `{{ARTICLE_URL}}`, with a detailed summary. Make the script query its exact random article URL after two `ArticlePersistenceService.persist` calls:

```ts
const articleCount = await database.query<{ count: string }>(
  'SELECT COUNT(*)::text AS count FROM articles WHERE canonical_url = $1', [articleUrl],
);
const associationCount = await database.query<{ count: string }>(
  `SELECT COUNT(*)::text AS count FROM article_sources association
   JOIN articles article ON article.id = association.article_id
   WHERE article.canonical_url = $1`, [articleUrl],
);
if (articleCount.rows[0].count !== '1' || associationCount.rows[0].count !== '1') {
  throw new Error('Persistence smoke assertion failed');
}
```

- [ ] **Step 2: Confirm command failure**

Run: `pnpm --dir apps/api smoke:persistence`

Expected: FAIL because no script exists.

- [ ] **Step 3: Implement the self-contained smoke script**

Add `"smoke:persistence": "ts-node -r tsconfig-paths/register test/persistence-smoke.ts"`. The script starts a `node:http` server at `127.0.0.1` port `0`, substitutes the random URL into the fixture, opens a Nest application context, creates one uniquely named source, reads the local feed, and persists its only preview twice. In `finally`, close the app and server, then delete only that source ID and exact article URL; never truncate shared tables.

- [ ] **Step 4: Update README behavior and commands**

State that migrations create `sources`, `articles`, and `article_sources`; ingestion persists normalized previews and returns per-source `insertedItems`/`duplicateItems`; and the safe verification sequence is:

```powershell
docker compose up -d
pnpm --dir apps/api db:migrate
pnpm --dir apps/api smoke:persistence
```

- [ ] **Step 5: Verify everything and commit**

Run:

```powershell
pnpm --dir apps/api test -- --runInBand
pnpm --dir apps/api build
pnpm --dir apps/api db:migrate
pnpm --dir apps/api smoke:persistence
```

Then run `git diff --check`. All commands must PASS.

```bash
git add apps/api/test/fixtures/persistence-smoke-feed.xml apps/api/test/persistence-smoke.ts apps/api/package.json README.md
git commit -m "docs: add article persistence verification"
```

## Self-Review

- **Spec coverage:** Task 1 delivers both tables. Tasks 2–4 provide canonical URL, guarded fingerprint, provenance, metadata preservation, and race recovery. Task 5 supplies stable source outcomes. Task 6 verifies two passes locally and documents operations.
- **Placeholder scan:** No deferred behavior or underspecified error handling remains; each code task names files, contracts, tests, commands, and behavior.
- **Type consistency:** `prepare` returns `PreparedArticle`; adding `sourceId` forms `ArticlePersistenceInput`; repository and service return `ArticlePersistenceOutcome`; ingestion counts that same two-value union.
