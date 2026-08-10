# TechBrief

TechBrief is a zero-cost technology news briefing platform.

It collects trusted technology updates, groups related stories,
and presents a source-linked daily brief readable in 1–3 minutes.

## Current status

Day 4 — RSS and Atom ingestion previews for registered sources.

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

## API development

The API lives in `apps/api` and reads its local connection settings from the
root `.env` file. Install dependencies and start the API in development mode:

```powershell
pnpm --dir apps/api install
pnpm --dir apps/api db:migrate
pnpm --dir apps/api start:dev
```

The migration is safe to run repeatedly. It creates the PostgreSQL `sources`
table with a unique URL constraint.

Available endpoints:

- `GET /health` checks PostgreSQL with `SELECT 1` and Redis with `PING`.
  It returns `200` with `status: ok` when both are up, or `503` with
  `status: degraded` when either dependency is down.
- `GET /sources` returns sources ordered by newest first.
- `POST /sources` accepts `{ "name": "...", "url": "https://..." }`.
  Duplicate URLs return `409 Conflict`.
- `POST /ingestion/run` reads all registered RSS 2.0 or Atom sources and
  returns normalized previews with per-source errors.
  Previews are not saved; article persistence is the next day's work.

Quick verification:

```powershell
Invoke-RestMethod http://localhost:3000/health
$body = @{ name = 'TechBrief Demo'; url = 'https://example.com/feed.xml' } | ConvertTo-Json
Invoke-RestMethod http://localhost:3000/sources -Method Post -ContentType 'application/json' -Body $body
Invoke-RestMethod http://localhost:3000/ingestion/run -Method Post
Invoke-RestMethod http://localhost:3000/sources
```

Redis is checked as a live dependency in Day 3 but is not used as a cache yet.

## Development note

AI tools were used as a pair-programming assistant for scaffolding,
debugging, and documentation. The architecture, implementation,
testing, and final review were completed and verified by the author.
