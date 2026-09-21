import { ArticleEvidenceService } from './article-evidence.service';

const row = (
  sourceId: number,
  sourceText: string,
  sourceName = `Source ${sourceId}`,
) => ({
  source_id: sourceId,
  source_name: sourceName,
  source_url: `https://source${sourceId}.example/story`,
  source_text: sourceText,
});

describe('ArticleEvidenceService', () => {
  const service = new ArticleEvidenceService({ query: jest.fn() } as never);

  it('builds the same IDs, order and hash for the same input', () => {
    const rows = [
      row(
        1,
        `${'Background information explains the launch in detail. '.repeat(20)} Revenue reached $3.2 billion in Q2 2026. The company said demand remained strong.`,
      ),
    ];

    const first = service.build(7, 'Company launch revenue', rows);
    const second = service.build(7, 'Company launch revenue', rows);

    expect(second).toEqual(first);
    expect(first.chunks.map((chunk) => chunk.id)).toEqual(
      first.chunks.map((_, index) => `E${index + 1}`),
    );
    expect(first.evidenceLevel).toBe('rich');
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps context around a numerical claim', () => {
    const packet = service.build(8, 'Shipments increased', [
      row(
        1,
        'The comparison covers the prior quarter. Shipments increased by 18%. Supply remained stable afterward.',
      ),
    ]);

    expect(packet.chunks[0].text).toContain('prior quarter');
    expect(packet.chunks[0].text).toContain('18%');
    expect(packet.chunks[0].text).toContain('Supply remained stable');
  });

  it('merges repeated facts while retaining every reporting source', () => {
    const repeated =
      'Acme launched Atlas Cloud for business customers in Singapore.';
    const packet = service.build(9, 'Atlas Cloud launch', [
      row(2, repeated),
      row(1, repeated),
    ]);

    expect(packet.chunks).toHaveLength(1);
    expect(packet.chunks[0].sources.map((source) => source.sourceId)).toEqual([
      1, 2,
    ]);
  });

  it('marks a thin excerpt as limited', () => {
    const packet = service.build(10, 'Battery preview', [
      row(1, 'Volta Labs previewed a battery prototype.'),
    ]);

    expect(packet.evidenceLevel).toBe('limited');
  });

  it('uses stored article fallback fields through the evidence query', async () => {
    const database = {
      query: jest.fn().mockResolvedValue({
        rows: [row(1, 'Fallback summary with enough detail to retain.')],
      }),
    };
    const repositoryBacked = new ArticleEvidenceService(database as never);

    await repositoryBacked.create(42, 'Fallback');

    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'COALESCE(provenance.source_text, article.summary)',
      ),
      [42],
    );
  });
});
