# TechBrief

TechBrief is a zero-cost technology news briefing platform.

It collects trusted technology updates, groups related stories,
and presents a source-linked daily brief readable in 1–3 minutes.

## Current status

TechBrief MVP is complete and runs locally. The current version includes an
image-aware feed, EN/VI labels, theme controls, responsive layout, PostgreSQL
persistence, Redis caching, RSS/Atom ingestion, cross-source deduplication, and
scheduled ingestion.

The project is currently optimized for project-based learning and personal
local use. Public deployment, production monitoring, database backups, and
multi-process scheduling are future work.

## Stack

- TypeScript
- NestJS
- React + Vite
- PostgreSQL
- Redis
- Docker
- pnpm

## Local infrastructure

TechBrief uses PostgreSQL and Redis for local development.

1. Copy the environment template:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Start the services:

   ```powershell
   docker compose up -d
   ```

3. Verify their status:

   ```powershell
   docker compose ps
   ```

4. Stop the services:

   ```powershell
   docker compose down
   ```

## Run the MVP locally

Start PostgreSQL and Redis first:

```powershell
docker compose up -d
```

In one terminal, migrate the database and start the API:

```powershell
pnpm --dir apps/api db:migrate
pnpm --dir apps/api start:dev
```

In another terminal, start the web app:

```powershell
pnpm --dir apps/web dev
```

Open the Vite URL shown in the terminal, usually `http://localhost:5173`.
The API is available at `http://localhost:3000`.

Stop the local infrastructure when finished:

```powershell
docker compose down
```

## Completion boundary

The MVP is considered complete when the application can be started locally,
read articles from PostgreSQL through the API, use Redis for caching, ingest
registered RSS/Atom sources, and render the feed in the web app. The current
database may contain fixture content until real sources are registered.

The next optional phase is public deployment using a free-tier static host for
the web app, a free web service for the API, and managed free-tier PostgreSQL
and Redis. That phase requires cloud environment variables, CORS configuration,
and an external trigger for ingestion when the free API service is idle.

## API development

The API lives in `apps/api` and reads its local connection settings from the
root `.env` file. Install dependencies and start the API in development mode:

```powershell
pnpm --dir apps/api install
pnpm --dir apps/api db:migrate
pnpm --dir apps/api start:dev
```

The migration is safe to run repeatedly. It creates the PostgreSQL `sources`,
`articles`, and `article_sources` tables. Ingestion persists normalized previews
and retains provenance without overwriting the first-seen article metadata.

Available endpoints:

- `GET /health` checks PostgreSQL with `SELECT 1` and Redis with `PING`.
  It returns `200` with `status: ok` when both are up, or `503` with
  `status: degraded` when either dependency is down.
- `GET /sources` returns sources ordered by newest first.
- `POST /sources` accepts `{ "name": "...", "url": "https://..." }`.
  Duplicate URLs return `409 Conflict`.
- `POST /ingestion/run` reads all registered RSS 2.0 or Atom sources and
  persists normalized previews. Each successful source includes
  `insertedItems` and `duplicateItems`; a persistence failure is isolated to
  that source with error code `PERSIST_FAILED`.
- `GET /articles` returns persisted articles newest first. It defaults to
  `page=1` and `limit=20`; `limit` is at most `100`. Optional `sourceId`,
  `from`, and `to` filters are supported. Each article includes all reporting
  sources. Results expose `nextCursor: null` as a future pagination seam.
- `GET /articles/:id` returns one persisted article with full source provenance,
  or `404` when it does not exist.

Article reads use a Redis read-through cache for 60 seconds. Invalid cache data
or Redis failures fall back to PostgreSQL. Any manual or scheduled ingestion run
with at least one successful source invalidates the article cache namespace.

Scheduled ingestion is enabled by default and shares the same ingestion service
as `POST /ingestion/run`:

```dotenv
INGESTION_SCHEDULER_ENABLED=true
INGESTION_CRON=0 * * * *
```

Set `INGESTION_SCHEDULER_ENABLED=false` to disable only scheduled execution.
The overlap guard is in-memory, so it prevents overlapping runs within one API
process only; a multi-process deployment needs a later distributed lock.

Safe persistence verification:

```powershell
docker compose up -d
pnpm --dir apps/api db:migrate
pnpm --dir apps/api smoke:persistence
```

Quick verification:

```powershell
Invoke-RestMethod http://localhost:3000/health
$body = @{ name = 'TechBrief Demo'; url = 'https://example.com/feed.xml' } | ConvertTo-Json
Invoke-RestMethod http://localhost:3000/sources -Method Post -ContentType 'application/json' -Body $body
Invoke-RestMethod http://localhost:3000/ingestion/run -Method Post
Invoke-RestMethod http://localhost:3000/sources
Invoke-RestMethod 'http://localhost:3000/articles?page=1&limit=20'
Invoke-RestMethod 'http://localhost:3000/articles?sourceId=1&from=2026-08-01T00:00:00.000Z'
Invoke-RestMethod 'http://localhost:3000/articles/1'
```

Keep Redis running for cache reads and scheduler-related cache invalidation.

## Development note

AI tools were used as a pair-programming assistant for scaffolding,
debugging, and documentation. The architecture, implementation,
testing, and final review were completed and verified by the author.
