import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ArticlePersistenceService } from '../src/articles/article-persistence.service';
import { DatabaseService } from '../src/database/database.service';
import { FeedReaderService } from '../src/ingestion/feed-reader.service';
import { SourcesService } from '../src/sources/sources.service';

async function listen(server: Server): Promise<number> {
  return new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Persistence smoke server did not bind a TCP port'));
        return;
      }
      resolveListen(address.port);
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
}

async function run(): Promise<void> {
  const articleUrl = `https://smoke.example/articles/${randomUUID()}`;
  const fixture = await readFile(
    resolve(process.cwd(), 'test/fixtures/persistence-smoke-feed.xml'),
    'utf8',
  );
  const feed = fixture.replaceAll('{{ARTICLE_URL}}', articleUrl);
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/rss+xml' });
    response.end(feed);
  });

  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;
  let database: DatabaseService | undefined;
  let sourceId: number | undefined;

  try {
    const port = await listen(server);
    const feedUrl = `http://127.0.0.1:${port}/feed.xml`;
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'],
    });
    const databaseService = app.get(DatabaseService);
    database = databaseService;
    const sources = app.get(SourcesService);
    const reader = app.get(FeedReaderService);
    const persistence = app.get(ArticlePersistenceService);

    const source = await sources.create({
      name: `Persistence smoke ${randomUUID()}`,
      url: feedUrl,
    });
    sourceId = source.id;

    const result = await reader.read(feedUrl);
    if (result.items.length !== 1) {
      throw new Error('Persistence smoke fixture did not yield exactly one item');
    }

    const firstOutcome = await persistence.persist(source.id, result.items[0]);
    const secondOutcome = await persistence.persist(source.id, result.items[0]);
    if (firstOutcome !== 'inserted' || secondOutcome !== 'duplicate') {
      throw new Error('Persistence smoke deduplication assertion failed');
    }

    const articleCount = await databaseService.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM articles WHERE canonical_url = $1',
      [articleUrl],
    );
    const associationCount = await databaseService.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM article_sources association
       JOIN articles article ON article.id = association.article_id
       WHERE article.canonical_url = $1`,
      [articleUrl],
    );
    if (
      articleCount.rows[0].count !== '1' ||
      associationCount.rows[0].count !== '1'
    ) {
      throw new Error('Persistence smoke assertion failed');
    }

    console.log('Persistence smoke verification passed.');
  } finally {
    if (database) {
      if (sourceId !== undefined) {
        await database.query('DELETE FROM sources WHERE id = $1', [sourceId]);
      }
      await database.query('DELETE FROM articles WHERE canonical_url = $1', [
        articleUrl,
      ]);
    }
    if (app) await app.close();
    await closeServer(server);
  }
}

run().catch((error: unknown) => {
  console.error('Persistence smoke verification failed.', error);
  process.exitCode = 1;
});
