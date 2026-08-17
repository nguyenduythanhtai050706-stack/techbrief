# Day 3 Health and Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the NestJS API to PostgreSQL and Redis, expose dependency health checks, and provide CRUD-lite endpoints for PostgreSQL-backed technology sources.

**Architecture:** Use `@nestjs/config` for environment settings, one lazy PostgreSQL `Pool` wrapped by `DatabaseService`, and one lazily connected Redis client wrapped by `RedisService`. Keep health and sources in separate NestJS modules; run the idempotent SQL migration through an explicit `db:migrate` command so API tests can start without Docker.

**Tech Stack:** NestJS 11, TypeScript, PostgreSQL 17, `pg`, Redis 7, `redis`, `@nestjs/config`, `class-validator`, `class-transformer`, Jest, Supertest, pnpm, Docker Compose.

## Global Constraints

- Use direct `pg` and Redis clients for this milestone; do not add an ORM.
- Keep credentials in `.env`; commit only `.env.example` changes.
- The `sources.url` column is unique and the migration must be safe to run repeatedly.
- `GET /health` returns `200` for both dependencies up and `503` when either is down.
- Do not add RSS ingestion, authentication, caching, background jobs, or frontend work.
- Use test-first steps: write a focused failing test, run it, implement the smallest change, then rerun it.

---

## File map

### Create

- `apps/api/src/database/database.constants.ts` — injection token for the PostgreSQL pool.
- `apps/api/src/database/database.module.ts` — PostgreSQL pool provider and exported adapter.
- `apps/api/src/database/database.service.ts` — typed query wrapper and pool shutdown.
- `apps/api/src/database/database.service.spec.ts` — PostgreSQL query forwarding test.
- `apps/api/src/database/migrations/001_create_sources.sql` — idempotent `sources` schema.
- `apps/api/src/database/migrate.ts` — explicit migration command entry point.
- `apps/api/src/redis/redis.module.ts` — Redis client provider and exported adapter.
- `apps/api/src/redis/redis.service.ts` — lazy connection, `PING`, logging, shutdown.
- `apps/api/src/redis/redis.service.spec.ts` — lazy connection and reuse tests.
- `apps/api/src/health/health.types.ts` — health response and dependency status types.
- `apps/api/src/health/health.service.ts` — concurrent PostgreSQL and Redis checks.
- `apps/api/src/health/health.controller.ts` — `GET /health` and HTTP status mapping.
- `apps/api/src/health/health.module.ts` — health module wiring.
- `apps/api/src/sources/source.types.ts` — persisted source shape.
- `apps/api/src/sources/dto/create-source.dto.ts` — validated create payload.
- `apps/api/src/sources/sources.service.ts` — list/create SQL and duplicate mapping.
- `apps/api/src/sources/sources.controller.ts` — `GET /sources` and `POST /sources`.
- `apps/api/src/sources/sources.module.ts` — sources module wiring.
- `apps/api/src/health/health.service.spec.ts` — health success/failure unit tests.
- `apps/api/src/sources/sources.service.spec.ts` — source query/validation mapping unit tests.

### Modify

- `apps/api/package.json` — runtime dependencies and `db:migrate` script.
- `apps/api/src/app.module.ts` — import Config, Database, Redis, Health, and Sources modules.
- `apps/api/src/main.ts` — enable global `ValidationPipe`.
- `.env.example` — add local host values used by the API.
- `README.MD` — document migration, API startup, and smoke checks.

### Test/verify

- `apps/api/test/app.e2e-spec.ts` — keep the existing root endpoint test passing with lazy external connections.
- Docker Compose services — integration smoke check for real PostgreSQL and Redis.

---

### Task 1: Add configuration and client dependencies

**Files:**
- Modify: `apps/api/package.json`
- Modify: `.env.example`
- Modify: `apps/api/src/app.module.ts`
- Test: existing `apps/api/src/app.controller.spec.ts`

**Interfaces:**
- Produces a global `ConfigModule` and environment keys consumed by Tasks 2 and 3: `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `REDIS_HOST`, and `REDIS_PORT`.

- [ ] **Step 1: Add the exact dependencies and command.**

Run from `apps/api`:

```powershell
pnpm add @nestjs/config pg redis class-validator class-transformer
pnpm add -D @types/pg
```

Add this script to `apps/api/package.json`:

```json
"db:migrate": "ts-node -r tsconfig-paths/register src/database/migrate.ts"
```

- [ ] **Step 2: Extend the environment template.**

Add:

```dotenv
POSTGRES_HOST=localhost
REDIS_HOST=localhost
```

Keep the existing database name, user, password, and ports unchanged.

- [ ] **Step 3: Write the configuration wiring.**

In `AppModule`, import:

```ts
ConfigModule.forRoot({ isGlobal: true })
```

Do not create database or Redis clients in this task; those providers belong to Tasks 2 and 3.

- [ ] **Step 4: Run the existing API tests.**

Run from `apps/api`:

```powershell
pnpm test -- --runInBand
```

Expected: existing controller unit test passes; no external service is required.

- [ ] **Step 5: Commit.**

```powershell
git add apps/api/package.json apps/api/pnpm-lock.yaml .env.example apps/api/src/app.module.ts
git commit -m "build(api): add day 3 configuration dependencies"
```

### Task 2: Create the PostgreSQL adapter and migration command

**Files:**
- Create: `apps/api/src/database/database.constants.ts`
- Create: `apps/api/src/database/database.module.ts`
- Create: `apps/api/src/database/database.service.ts`
- Create: `apps/api/src/database/migrations/001_create_sources.sql`
- Create: `apps/api/src/database/migrate.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes `ConfigService` from Task 1.
- Produces `DatabaseService.query<T extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>` for Tasks 4 and 5.

- [ ] **Step 1: Write the adapter contract test.**

Test that `DatabaseService.query` forwards SQL and parameters to the injected pool:

```ts
const query = jest.fn().mockResolvedValue({ rows: [{ value: 1 }], rowCount: 1 });
const service = new DatabaseService({ query, end: jest.fn() } as never);

await service.query('SELECT $1 AS value', [1]);

expect(query).toHaveBeenCalledWith('SELECT $1 AS value', [1]);
```

- [ ] **Step 2: Run the focused test and verify it fails.**

Run:

```powershell
pnpm test -- database.service.spec.ts --runInBand
```

Expected: FAIL because `DatabaseService` does not exist yet.

- [ ] **Step 3: Implement the pool provider and service.**

Create an injection token `POSTGRES_POOL`. The provider should read `ConfigService` values and construct:

```ts
new Pool({
  host: config.get<string>('POSTGRES_HOST', 'localhost'),
  port: Number(config.get<string>('POSTGRES_PORT', '5432')),
  database: config.get<string>('POSTGRES_DB', 'techbrief'),
  user: config.get<string>('POSTGRES_USER', 'techbrief'),
  password: config.get<string>('POSTGRES_PASSWORD', 'techbrief_dev_password'),
})
```

`DatabaseService` forwards `query` and calls `pool.end()` in `onModuleDestroy`.

- [ ] **Step 4: Add the idempotent migration SQL.**

Write exactly one migration file with:

```sql
CREATE TABLE IF NOT EXISTS sources (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 5: Implement the migration command.**

`src/database/migrate.ts` should create an application context from `AppModule`, read `src/database/migrations/001_create_sources.sql` using `node:fs/promises`, call `DatabaseService.query(sql)`, log a success message, and close the context in a `finally` block.

- [ ] **Step 6: Run tests and build.**

```powershell
pnpm test -- database.service.spec.ts --runInBand
pnpm build
```

Expected: focused test and build pass.

- [ ] **Step 7: Commit.**

```powershell
git add apps/api/src/database apps/api/src/app.module.ts
git commit -m "feat(api): add postgres adapter and sources migration"
```

### Task 3: Create the Redis adapter with lazy connection

**Files:**
- Create: `apps/api/src/redis/redis.module.ts`
- Create: `apps/api/src/redis/redis.service.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes `ConfigService` from Task 1.
- Produces `RedisService.ping(): Promise<string>` for Task 4 and `RedisService.onModuleDestroy()` for clean shutdown.

- [ ] **Step 1: Write tests for the Redis service.**

Cover these cases:

```ts
it('connects lazily and returns PONG', async () => {
  const client = { isOpen: false, connect: jest.fn(), ping: jest.fn().mockResolvedValue('PONG'), quit: jest.fn() };
  const service = new RedisService(client as never);

  await expect(service.ping()).resolves.toBe('PONG');
  expect(client.connect).toHaveBeenCalledTimes(1);
});

it('does not connect twice when already open', async () => {
  const client = { isOpen: true, connect: jest.fn(), ping: jest.fn().mockResolvedValue('PONG'), quit: jest.fn() };
  const service = new RedisService(client as never);

  await service.ping();
  expect(client.connect).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused test and verify it fails.**

```powershell
pnpm test -- redis.service.spec.ts --runInBand
```

Expected: FAIL because the service does not exist yet.

- [ ] **Step 3: Implement the client provider and lazy service.**

Create a Redis client with:

```ts
createClient({
  socket: {
    host: config.get<string>('REDIS_HOST', 'localhost'),
    port: Number(config.get<string>('REDIS_PORT', '6379')),
  },
})
```

Attach an `error` listener that logs a service-level message. `ping()` must connect only when `client.isOpen` is false, reuse an in-flight connection promise, and call `client.ping()`. `onModuleDestroy` calls `quit()` only when the client is open.

- [ ] **Step 4: Run focused tests and build.**

```powershell
pnpm test -- redis.service.spec.ts --runInBand
pnpm build
```

Expected: tests and build pass without Redis running.

- [ ] **Step 5: Commit.**

```powershell
git add apps/api/src/redis apps/api/src/app.module.ts
git commit -m "feat(api): add redis adapter"
```

### Task 4: Add the health endpoint

**Files:**
- Create: `apps/api/src/health/health.types.ts`
- Create: `apps/api/src/health/health.service.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/src/health/health.module.ts`
- Create: `apps/api/src/health/health.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes `DatabaseService.query('SELECT 1')` and `RedisService.ping()` from Tasks 2 and 3.
- Produces `GET /health` with `{ status: 'ok' | 'degraded'; postgres: 'up' | 'down'; redis: 'up' | 'down' }`.

- [ ] **Step 1: Write healthy and degraded tests.**

Use mocked adapters and `Promise.allSettled` behavior. Assert that two successes produce `status: 'ok'` and both `up`; make one mock reject and assert `status: 'degraded'` with only that dependency `down`.

- [ ] **Step 2: Run the focused test and verify it fails.**

```powershell
pnpm test -- health.service.spec.ts --runInBand
```

Expected: FAIL because the health service does not exist yet.

- [ ] **Step 3: Implement the service and controller.**

Run both checks concurrently:

```ts
const [postgres, redis] = await Promise.allSettled([
  this.database.query('SELECT 1'),
  this.redis.ping(),
]);
```

Map fulfilled checks to `up`, rejected checks to `down`, and return HTTP 503 whenever the top-level status is `degraded`. Do not include exception messages in the JSON response.

- [ ] **Step 4: Enable the module and run tests.**

```powershell
pnpm test -- health.service.spec.ts --runInBand
pnpm test:e2e -- --runInBand
```

Expected: focused tests pass; the existing root endpoint test still passes because connections are lazy.

- [ ] **Step 5: Commit.**

```powershell
git add apps/api/src/health apps/api/src/app.module.ts
git commit -m "feat(api): add postgres and redis health endpoint"
```

### Task 5: Add the sources schema API

**Files:**
- Create: `apps/api/src/sources/source.types.ts`
- Create: `apps/api/src/sources/dto/create-source.dto.ts`
- Create: `apps/api/src/sources/sources.service.ts`
- Create: `apps/api/src/sources/sources.controller.ts`
- Create: `apps/api/src/sources/sources.module.ts`
- Create: `apps/api/src/sources/sources.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts`

**Interfaces:**
- Consumes `DatabaseService.query<T>` from Task 2.
- Produces `GET /sources` and `POST /sources`.
- `CreateSourceDto` has `name: string` and `url: string`; URL validation permits only `http` and `https`.
- `Source` has `id: number`, `name: string`, `url: string`, and `created_at: Date`; Nest serializes the date as an ISO string in JSON.

- [ ] **Step 1: Write service tests.**

Test that `list()` uses `ORDER BY created_at DESC`, `create()` sends parameterized SQL, and a PostgreSQL error with code `23505` becomes `ConflictException`.

- [ ] **Step 2: Run the focused test and verify it fails.**

```powershell
pnpm test -- sources.service.spec.ts --runInBand
```

Expected: FAIL because the sources service does not exist yet.

- [ ] **Step 3: Implement DTO validation and the service.**

Use `@IsString()`, `@IsNotEmpty()`, and `@MaxLength(255)` for `name`; use `@IsUrl({ protocols: ['http', 'https'], require_protocol: true })` for `url`.

Use parameterized SQL:

```sql
SELECT id, name, url, created_at FROM sources ORDER BY created_at DESC
```

```sql
INSERT INTO sources (name, url) VALUES ($1, $2)
RETURNING id, name, url, created_at
```

Catch only PostgreSQL unique-violation code `23505` and throw `ConflictException('A source with this URL already exists')`.

- [ ] **Step 4: Wire the controller and global validation.**

Add `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })` in `main.ts`. The controller delegates `GET` and `POST` to `SourcesService`; no SQL belongs in the controller.

- [ ] **Step 5: Run unit tests and build.**

```powershell
pnpm test -- sources.service.spec.ts --runInBand
pnpm test -- --runInBand
pnpm build
```

Expected: all tests and build pass without Docker.

- [ ] **Step 6: Commit.**

```powershell
git add apps/api/src/sources apps/api/src/main.ts apps/api/src/app.module.ts
git commit -m "feat(api): add postgres-backed sources endpoints"
```

### Task 6: Run the real-service smoke check and document the lesson

**Files:**
- Modify: `README.MD`
- Verify: `docker-compose.yml`, `.env`, `apps/api/src/database/migrations/001_create_sources.sql`

**Interfaces:**
- Consumes all endpoints and commands from Tasks 1–5.
- Produces a documented repeatable local verification flow.

- [ ] **Step 1: Start the local dependencies.**

From the repository root:

```powershell
docker compose up -d
docker compose ps
```

Expected: `postgres` and `redis` report healthy/running.

- [ ] **Step 2: Run the migration twice.**

From `apps/api`:

```powershell
pnpm db:migrate
pnpm db:migrate
```

Expected: both commands succeed, demonstrating idempotency.

- [ ] **Step 3: Start the API and verify health.**

```powershell
pnpm start:dev
```

In another terminal:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

Expected: `status` is `ok`, `postgres` is `up`, and `redis` is `up`.

- [ ] **Step 4: Verify create and read behavior.**

```powershell
$body = @{ name = 'TechBrief Demo'; url = 'https://example.com/feed.xml' } | ConvertTo-Json
Invoke-RestMethod http://localhost:3000/sources -Method Post -ContentType 'application/json' -Body $body
Invoke-RestMethod http://localhost:3000/sources
```

Expected: the created source is returned and appears in the list. Repeating the POST with the same URL returns HTTP 409.

- [ ] **Step 5: Update the README.**

Document the API start command, `pnpm db:migrate`, the three endpoints, and the meaning of `ok`, `degraded`, `up`, and `down`. Include the reason Redis is checked but not yet used as a cache.

- [ ] **Step 6: Run final verification and commit documentation.**

```powershell
pnpm test -- --runInBand
pnpm build
git diff --check
git add README.MD
git commit -m "docs: document day 3 api verification"
```

Expected: tests, build, and whitespace checks pass.
