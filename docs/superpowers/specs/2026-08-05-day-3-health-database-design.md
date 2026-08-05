# Day 3 Design: PostgreSQL, Redis, and Health Checks

## Goal

Extend the Day 2 local infrastructure so the NestJS API can verify both PostgreSQL and Redis, persist technology-news sources in PostgreSQL, and expose small HTTP endpoints that make the connection visible and testable.

This day is intentionally infrastructure-focused. RSS ingestion, authentication, caching, background jobs, and frontend integration are out of scope.

## Learning outcomes

By the end of Day 3, the learner should be able to explain:

- why configuration belongs in environment variables;
- how a PostgreSQL connection pool and a Redis client are created and closed;
- how an API health check tests a real dependency rather than only reporting that NestJS started;
- how a SQL migration creates a repeatable database schema;
- how a NestJS module, controller, service, and database adapter work together.

## Architecture

The API will be split into focused modules:

```text
AppModule
├── ConfigModule
├── DatabaseModule       PostgreSQL Pool
├── RedisModule          Redis Client
├── HealthModule         dependency checks
└── SourcesModule        source queries and commands
```

`DatabaseModule` owns one PostgreSQL pool for the application process. `RedisModule` owns one Redis client. Both modules expose their clients through injectable providers and close them during NestJS shutdown.

The application will use the direct `pg` and Redis clients for this learning milestone. An ORM can be evaluated later after the SQL and connection lifecycle are understood.

## Data model

Create a `sources` table with an idempotent SQL migration:

```sql
CREATE TABLE IF NOT EXISTS sources (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The `url` uniqueness constraint prevents the same feed source from being registered twice. The migration must be safe to run more than once.

## HTTP API

### `GET /health`

Run `SELECT 1` against PostgreSQL and `PING` against Redis. Return a stable JSON shape:

```json
{
  "status": "ok",
  "postgres": "up",
  "redis": "up"
}
```

If either dependency fails, return HTTP 503 with the same fields and `status: "degraded"`; the failing dependency is reported as `down`. The endpoint must not expose credentials or raw connection errors.

### `GET /sources`

Return sources ordered by newest `created_at` first. The first implementation may return an empty array when the table contains no rows.

### `POST /sources`

Accept `name` and `url`, insert one row, and return the created source. Invalid input should produce a client error. A duplicate URL should produce a clear conflict response rather than an unhandled database error.

## Configuration

Use the existing `.env` values as the source of truth and add API-side connection settings with sensible local defaults:

- PostgreSQL host, port, database, user, and password;
- Redis host and port.

The committed repository must contain only `.env.example`; actual credentials remain in the local `.env` file.

## Error handling

- A failed dependency check changes the health response to degraded and does not leak low-level errors.
- Database connection failures are logged with a useful service-level message.
- Duplicate source URLs are mapped to an HTTP conflict.
- Unexpected errors retain NestJS's normal 500 behavior and are not silently converted to success.

## Testing strategy

- Unit-test the health service's healthy and failed dependency branches with mocked clients.
- Unit-test source validation and duplicate-url mapping where practical.
- Keep the existing root endpoint test passing unless the endpoint is deliberately replaced.
- Run an integration smoke check with Docker services: start containers, run the migration, call `/health`, create a source, and read it back with `/sources`.

## Acceptance criteria

Day 3 is complete when:

1. PostgreSQL and Redis clients are configured from environment variables.
2. The migration creates `sources` and can be safely re-run.
3. `GET /health` reports both dependency states and returns 503 when one is unavailable.
4. `POST /sources` inserts a valid source and rejects duplicate URLs.
5. `GET /sources` reads persisted rows from PostgreSQL.
6. Tests and build pass, and the behavior is documented in the repository README.

## Deliberate non-goals

- No RSS fetching or article processing.
- No Redis caching yet; Redis is used as a live dependency check only.
- No production secret management.
- No frontend work in this day.
