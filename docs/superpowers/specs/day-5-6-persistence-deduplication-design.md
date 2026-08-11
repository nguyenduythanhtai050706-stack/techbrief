# Day 5-6 Design: Article Persistence and Deduplication

## Goal

Turn Day 4's normalized RSS/Atom previews into durable article records while preventing the same article from being stored more than once. The system must preserve which registered sources reported each article.

## Scope

### Included

- PostgreSQL migrations for `articles` and `article_sources`.
- Persistence of valid normalized previews produced by `FeedReaderService`.
- Deterministic deduplication based on canonical URL, then content hash when URLs differ.
- Idempotent ingestion: running the same batch again must not create another `articles` row or identical source association.
- Per-source persistence totals for inserted articles and duplicates.
- Unit tests for deduplication rules, repository SQL contracts, and persistence orchestration.

### Explicit non-goals

- No UI, cron job, BullMQ worker, retries, Redis cache, authentication, or article-content scraping.
- No fuzzy/semantic similarity or LLM/embedding deduplication.
- No overwrite of article title, summary, author, or publication date from later duplicate feed entries.

## Data model

### `articles`

One row represents one canonical article:

```text
id              serial primary key
canonical_url   text not null unique
content_fingerprint char(64) unique null
title           varchar(500) not null
summary         text null
published_at    timestamptz null
author          varchar(255) null
categories      jsonb not null default '[]'
created_at      timestamptz not null default now()
last_seen_at    timestamptz not null default now()
```

`canonical_url` removes fragments and known tracking parameters (`utm_*`, `gclid`, `fbclid`) but retains meaningful query parameters. `content_fingerprint` is nullable: when a preview has a summary with at least 80 characters after HTML-tag removal and whitespace normalization, it is the SHA-256 of its normalized title and normalized summary, separated by a newline. The URL is deliberately excluded so syndications at different URLs can merge. PostgreSQL permits multiple `NULL` values in the unique column, so previews with insufficient content are deduplicated by canonical URL only.

### `article_sources`

This table preserves provenance without duplicating the article:

```text
article_id      integer not null references articles(id) on delete cascade
source_id       integer not null references sources(id) on delete cascade
external_id     text not null
first_seen_at   timestamptz not null default now()
last_seen_at    timestamptz not null default now()
primary key (article_id, source_id, external_id)
```

The primary key makes repeated feed entries idempotent while allowing one source to report different feed identifiers for the same article.

## Components and flow

```text
POST /ingestion/run
  -> IngestionService
  -> FeedReaderService (existing normalization)
  -> ArticlePersistenceService
      -> ArticleDeduplicator
      -> ArticlesRepository
      -> article_sources upsert
```

`ArticleDeduplicator` is pure: it returns a canonical URL and an optional content fingerprint, but owns no SQL. `ArticlesRepository` owns parameterized SQL: it finds an article by canonical URL first, then a non-null content fingerprint, inserts new articles, leaves editorial fields unchanged on duplicates, updates `last_seen_at`, and upserts the source association. `ArticlePersistenceService` returns `inserted` or `duplicate` for one preview.

Successful ingestion source results gain `insertedItems` and `duplicateItems` totals. A read failure retains Day 4 behavior. A persistence failure is reported with stable `PERSIST_FAILED`; raw database errors are logged server-side only. Unexpected programming errors continue through NestJS's normal error handling.

## Deduplication rules

1. Canonicalize the preview URL; Day 4 already rejects invalid URLs.
2. Match `articles.canonical_url` first.
3. If not found and the preview has a content fingerprint, match `articles.content_fingerprint` so sufficiently detailed syndicated entries can merge.
4. Insert a new article only when neither key matches.
5. In every case, upsert `(article_id, source_id, external_id)` and update its `last_seen_at`.
6. Never overwrite stored editorial metadata from a later duplicate feed entry.

Unique-conflict races are treated as duplicates: the repository re-reads by canonical URL and then, when available, by content fingerprint before upserting provenance.

## Testing strategy

### Pure deduplication tests

- removes fragments and known tracking parameters;
- preserves meaningful query parameters;
- produces the same fingerprint for equivalent normalized title and sufficiently detailed summary at different URLs;
- produces no fingerprint for a missing or shorter-than-80-character summary;
- produces a different fingerprint when normalized content changes.

### Repository tests

- inserts an article when neither unique key matches;
- treats matching canonical URL as duplicate;
- treats matching non-null content fingerprint as duplicate;
- upserts article-source provenance;
- handles a duplicate-key race by re-reading the article.

### Orchestration tests

- persists every valid preview from a successful feed;
- totals inserted and duplicates correctly;
- is idempotent when an identical batch runs again;
- preserves Day 4 behavior when a different source feed fails.

All unit tests run without Internet, PostgreSQL, or Redis. A local smoke test runs migrations, executes ingestion twice using fixture sources, and confirms one article row plus the expected provenance rows.

## Acceptance criteria

1. Migrations create `articles` and `article_sources` safely on an empty database.
2. A valid normalized preview persists with its source association.
3. Repeating it creates neither another article nor an identical association.
4. Different URLs with the same sufficiently detailed normalized title and summary deduplicate.
5. A later duplicate does not overwrite the original article metadata.
6. The ingestion response reports inserted and duplicate totals for successful sources.
7. API tests, build, migration check, and two-run local smoke test pass.
