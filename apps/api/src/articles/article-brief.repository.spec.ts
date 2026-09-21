import {
  ArticleBriefRepository,
  BRIEF_PROMPT_VERSION,
  BRIEF_SCHEMA_VERSION,
} from './article-brief.repository';
import type { ArticleBriefV2 } from './article-brief.types';

const input = {
  id: 1,
  title: 'Story',
  summary: 'Excerpt',
  input_hash: 'input-hash',
};
const brief: ArticleBriefV2 = {
  schemaVersion: 2,
  en: {
    title: 'Story',
    feedSummary: 'Feed summary',
    summary: 'Detailed summary',
    keyPoints: [{ text: 'Point', evidenceIds: ['E1'] }],
  },
  vi: {
    title: 'Câu chuyện',
    feedSummary: 'Tóm tắt dòng tin',
    summary: 'Tóm tắt chi tiết',
    keyPoints: [{ text: 'Ý chính', evidenceIds: ['E1'] }],
  },
  evidence: [
    {
      id: 'E1',
      sourceId: 7,
      sourceName: 'Source',
      sourceUrl: 'https://source.example/story',
    },
  ],
  categories: ['Technology'],
  evidenceLevel: 'limited',
};

function queryMock(rows: unknown[]) {
  let lastSql = '';
  return {
    run: jest.fn(async (text: string) => {
      lastSql = text;
      return Promise.resolve({ rows });
    }),
    sql: () => lastSql,
  };
}

describe('ArticleBriefRepository V2', () => {
  it('claims work when evidence or the V2 prompt/schema version changes', async () => {
    const query = queryMock([input]);
    const database = { query: query.run };
    const repository = new ArticleBriefRepository(database as never);

    await expect(repository.claim('owner')).resolves.toEqual(input);

    const sql = query.sql();
    expect(sql).toContain('provenance.source_text_hash');
    expect(sql).toContain(
      'ORDER BY provenance.source_id, provenance.external_id',
    );
    expect(sql).toContain(
      `brief_schema_version IS DISTINCT FROM ${BRIEF_SCHEMA_VERSION}`,
    );
    expect(sql).toContain(
      `brief_prompt_version IS DISTINCT FROM '${BRIEF_PROMPT_VERSION}'`,
    );
  });

  it('saves V2 atomically with trusted evidence and version metadata', async () => {
    const query = queryMock([{ id: 1 }]);
    const database = { query: query.run };
    const repository = new ArticleBriefRepository(database as never);

    await expect(repository.save(input, 'owner', 'model', brief)).resolves.toBe(
      true,
    );

    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('brief_schema_version = $7'),
      [
        1,
        'owner',
        JSON.stringify({
          schemaVersion: 2,
          en: brief.en,
          vi: brief.vi,
          evidence: brief.evidence,
          evidenceLevel: brief.evidenceLevel,
        }),
        JSON.stringify(brief.categories),
        input.input_hash,
        'model',
        BRIEF_SCHEMA_VERSION,
        BRIEF_PROMPT_VERSION,
      ],
    );
  });

  it('reports a stale optimistic save without clearing the current brief', async () => {
    const query = queryMock([]);
    const database = { query: query.run };
    const repository = new ArticleBriefRepository(database as never);

    await expect(
      repository.save(input, 'stale-owner', 'model', brief),
    ).resolves.toBe(false);
    expect(query.sql()).not.toContain('translations = NULL');
  });

  it('records an error without deleting the V1 fallback', async () => {
    const query = queryMock([]);
    const database = { query: query.run };
    const repository = new ArticleBriefRepository(database as never);

    await repository.fail(1, 'owner', 'INVALID_BRIEF_EVIDENCE');

    expect(query.sql()).not.toContain('translations = NULL');
  });
});
