import { deepStrictEqual, strictEqual } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { DatabaseService } from '../src/database/database.service';
import { ArticlesRepository } from '../src/articles/articles.repository';
import { ArticleDeduplicator } from '../src/articles/article-deduplicator';
import type { ArticleListQuery } from '../src/articles/article.types';

async function run() {
  const client = await PGlite.create();
  try {
    await client.query('BEGIN');
    const schema = `category_smoke_${randomUUID().replaceAll('-', '')}`;
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema}`);
    const directory = resolve(process.cwd(), 'src/database/migrations');
    const migrations = (await readdir(directory))
      .filter((name) => name.endsWith('.sql'))
      .sort();
    for (const file of migrations.filter((name) => name < '004')) {
      await client.exec(await readFile(resolve(directory, file), 'utf8'));
    }
    // A legacy row must be classified without losing its original labels.
    await client.query(`INSERT INTO articles (canonical_url, title, categories)
      VALUES ('https://example.test/legacy', 'Legacy', '[" ARTIFICIAL INTELLIGENCE ", "Reviews"]')`);
    for (const file of migrations.filter((name) => name >= '004')) {
      const sql = await readFile(resolve(directory, file), 'utf8');
      await client.exec(sql);
      await client.exec(sql); // Migration must be safe to run twice.
    }
    const repository = new ArticlesRepository(
      new DatabaseService(client as unknown as Pool),
    );
    const base: ArticleListQuery = {
      page: 1,
      limit: 20,
      sourceId: null,
      from: null,
      to: null,
    };
    const legacy = (await repository.list(base)).items[0];
    deepStrictEqual(legacy.categories, ['AI', 'Products']);
    deepStrictEqual(
      (
        await client.query<{ categories: string[] }>(
          'SELECT categories FROM articles WHERE id = $1',
          [legacy.id],
        )
      ).rows[0].categories,
      [' ARTIFICIAL INTELLIGENCE ', 'Reviews'],
    );

    const cases: [unknown, string[]][] = [
      [['AI', 'ai', 'Artificial Intelligence', 'unknown'], ['AI']],
      [['machine-learning', 'Large Language Models'], ['AI']],
      [['Gadgets', 'Hardware', 'Apps'], ['Products']],
      [['Cybersecurity', 'Infrastructure', 'Programming'], ['Technology']],
      [
        ['Trí tuệ nhân tạo', 'Sản phẩm'],
        ['AI', 'Products'],
      ],
      [
        ['Reviews', 'AI', 'Security'],
        ['AI', 'Products', 'Technology'],
      ],
      [['Tech', 'AI'], ['AI']],
      [['chair', 'fair', 'said'], ['Technology']],
      [[], ['Technology']],
      [['unknown'], ['Technology']],
      [null, ['Technology']],
      [['AI', 1, null, { term: 'Reviews' }], ['AI']],
    ];
    for (const [raw, expected] of cases) {
      const result = await client.query<{ categories: string[] }>(
        'SELECT normalize_article_categories($1::jsonb) AS categories',
        [JSON.stringify(raw)],
      );
      deepStrictEqual(result.rows[0].categories, expected, JSON.stringify(raw));
    }
    const source = (
      await client.query<{ id: number }>(`INSERT INTO sources (name, url)
      VALUES ('Category fixture', 'https://example.test/feed') RETURNING id`)
    ).rows[0];
    const prepared = new ArticleDeduplicator().prepare({
      externalId: 'fixture',
      title: 'New RSS item',
      url: 'https://example.test/new',
      summary: null,
      publishedAt: null,
      author: null,
      categories: ['Gadgets'],
    });
    strictEqual(
      await repository.persist({ ...prepared, sourceId: source.id }),
      'inserted',
    );
    let products = await repository.list({
      ...base,
      sourceId: source.id,
      category: 'Products',
    });
    strictEqual(products.totalItems, 1);
    deepStrictEqual(products.items[0].categories, ['Products']);
    const id = products.items[0].id;
    strictEqual(
      await repository.persist({
        ...prepared,
        categories: ['Artificial Intelligence'],
        sourceId: source.id,
      }),
      'duplicate',
    );
    deepStrictEqual((await repository.findById(id))?.categories, [
      'AI',
      'Products',
    ]);
    products = await repository.list({
      ...base,
      category: 'Products',
      limit: 1,
    });
    strictEqual(products.totalItems, 2);
    strictEqual(products.items.length, 1);
    const secondPage = await repository.list({
      ...base,
      category: 'Products',
      limit: 1,
      page: 2,
    });
    strictEqual(secondPage.items.length, 1);
    strictEqual(secondPage.items[0].id === products.items[0].id, false);
    strictEqual(
      (await repository.list({ ...base, category: 'AI', sourceId: source.id }))
        .totalItems,
      1,
    );
    strictEqual(
      (await repository.list({ ...base, category: 'Technology' })).totalItems,
      0,
    );
    console.log(
      'Category smoke passed: migration/backfill, aliases, raw labels, ingestion, duplicates, filters and pagination.',
    );
  } finally {
    await client.query('ROLLBACK');
    await client.close();
  }
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
