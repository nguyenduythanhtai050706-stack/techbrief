import { ArticleBriefService } from './article-brief.service';

const input = { id: 1, title: 'Test', summary: 'Excerpt', input_hash: 'hash' };
const packet = {
  articleId: 1,
  title: 'Test',
  evidenceLevel: 'limited',
  chunks: [
    {
      id: 'E1',
      text: 'Grounded evidence.',
      sources: [
        {
          sourceId: 1,
          sourceName: 'Source',
          sourceUrl: 'https://source.example/story',
        },
      ],
      hash: 'evidence-hash',
    },
  ],
  hash: 'packet-hash',
};
const brief = {
  schemaVersion: 2,
  en: { title: 'Test', feedSummary: 'Short', summary: 'Short', keyPoints: [] },
  vi: { title: 'Thử', feedSummary: 'Ngắn', summary: 'Ngắn', keyPoints: [] },
  evidence: [],
  evidenceLevel: 'limited',
  categories: ['Products'],
};
function setup() {
  const repository = {
    claim: jest.fn().mockResolvedValueOnce(input).mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(true),
    fail: jest.fn(),
  };
  const gemini = {
    enabled: true,
    model: 'test-model',
    generateV2: jest.fn().mockResolvedValue(brief),
  };
  const cache = { invalidateArticles: jest.fn() };
  const evidence = { create: jest.fn().mockResolvedValue(packet) };
  return {
    repository,
    gemini,
    cache,
    evidence,
    service: new ArticleBriefService(
      repository as never,
      gemini as never,
      cache as never,
      evidence as never,
    ),
  };
}
describe('ArticleBriefService', () => {
  it('stores a brief and invalidates lists and detail', async () => {
    const { service, gemini, cache, repository } = setup();
    await expect(service.run()).resolves.toMatchObject({
      processed: 1,
      failed: 0,
    });
    expect(repository.save).toHaveBeenCalledWith(
      input,
      expect.any(String),
      'test-model',
      brief,
    );
    expect(gemini.generateV2).toHaveBeenCalledWith(packet);
    expect(cache.invalidateArticles).toHaveBeenCalledTimes(1);
  });
  it('does not call AI if no pending rows exist', async () => {
    const { service, repository, gemini } = setup();
    repository.claim.mockReset().mockResolvedValue(null);
    await service.run();
    expect(gemini.generateV2).not.toHaveBeenCalled();
  });
  it('stops on quota and records a deferred retry', async () => {
    const { service, repository, gemini } = setup();
    gemini.generateV2.mockRejectedValue(new Error('GEMINI_HTTP_429'));
    await expect(service.run()).resolves.toMatchObject({
      status: 'partial',
      failed: 1,
      error: 'GEMINI_HTTP_429',
    });
    expect(repository.claim).toHaveBeenCalledTimes(1);
    expect(repository.fail).toHaveBeenCalledWith(
      1,
      expect.any(String),
      'GEMINI_HTTP_429',
    );
    expect(repository.save).not.toHaveBeenCalled();
  });
  it('does not spend provider quota when no evidence chunk is available', async () => {
    const { service, repository, gemini, evidence } = setup();
    evidence.create.mockResolvedValue({ ...packet, chunks: [] });

    await expect(service.run()).resolves.toMatchObject({
      status: 'partial',
      failed: 1,
      error: 'INVALID_BRIEF_EVIDENCE',
    });
    expect(gemini.generateV2).not.toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledWith(
      1,
      expect.any(String),
      'INVALID_BRIEF_EVIDENCE',
    );
  });
  it('skips when the provider is not configured', async () => {
    const { service, repository, gemini } = setup();
    gemini.enabled = false;
    await expect(service.run()).resolves.toMatchObject({ status: 'disabled' });
    expect(repository.claim).not.toHaveBeenCalled();
  });
});
