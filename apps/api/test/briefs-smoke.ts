import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { DatabaseService } from '../src/database/database.service';
import { ArticleBriefRepository } from '../src/articles/article-brief.repository';
import { ArticlesRepository } from '../src/articles/articles.repository';
import type { ArticleBrief } from '../src/articles/article-brief.types';

async function run() {
  const client = await PGlite.create();
  try {
    const directory = resolve('src/database/migrations');
    for (let pass = 0; pass < 2; pass++) {
      for (const file of (await readdir(directory)).filter(file => file.endsWith('.sql')).sort()) {
        await client.exec(await readFile(resolve(directory, file), 'utf8'));
      }
    }
    const db = new DatabaseService(client as unknown as Pool);
    const briefs = new ArticleBriefRepository(db);
    const articles = new ArticlesRepository(db);
    await client.query("INSERT INTO articles (canonical_url,title,summary) VALUES ('https://example.test/a','New laptop','A lighter laptop was released')");
    const input = await briefs.claim('owner');
    assert.ok(input);
    assert.equal(await briefs.claim('racer'), null, 'leased article cannot be claimed twice');
    const brief: ArticleBrief = { en: { title: 'New laptop', summary: 'A lighter laptop was released.' }, vi: { title: 'Máy tính mới', summary: 'Một mẫu máy tính nhẹ hơn đã ra mắt.' }, categories: ['Products'] };
    assert.equal(await briefs.save(input, 'wrong-owner', 'mock', brief), false);
    assert.equal(await briefs.save(input, 'owner', 'mock', brief), true);
    assert.equal(await briefs.claim('again'), null, 'unchanged input is skipped');
    const query = { page: 1, limit: 1, sourceId: null, from: null, to: null };
    const page = await articles.list({ ...query, category: 'Products' });
    assert.equal(page.totalItems, 1);
    assert.equal(page.items[0].translations?.vi.title, brief.vi.title);
    assert.equal((await articles.list({ ...query, category: 'Technology' })).totalItems, 0);
    assert.deepEqual((await articles.findById(input.id))?.categories, ['Products']);
    assert.deepEqual((await client.query<{ categories: string[] }>('SELECT categories FROM articles')).rows[0].categories, [], 'raw RSS labels retained');
    await client.query("UPDATE articles SET summary='Updated excerpt'");
    const changed = await briefs.claim('new-owner');
    assert.ok(changed);
    assert.notEqual(changed.input_hash, input.input_hash);
    assert.equal(await briefs.save(input, 'new-owner', 'mock', brief), false, 'stale result not persisted');
    await briefs.fail(changed.id, 'new-owner', 'GEMINI_HTTP_429');
    assert.equal(await briefs.claim('retry-too-early'), null);
    console.log('Brief smoke passed: repeatable migration, claim ownership, bilingual storage, category filtering/COUNT, deduplication, changed content, retry delay.');
  } finally { await client.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
