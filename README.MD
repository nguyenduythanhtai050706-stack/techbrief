# TechBrief

TechBrief is a zero-cost technology news briefing platform.

It collects trusted technology updates, groups related stories,
and presents a source-linked daily brief readable in 1–3 minutes.

## Current status

Day 2 — local development infrastructure.

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

## Development note

AI tools were used as a pair-programming assistant for scaffolding,
debugging, and documentation. The architecture, implementation,
testing, and final review were completed and verified by the author.
