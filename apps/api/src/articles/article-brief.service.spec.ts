import { ArticleBriefService } from './article-brief.service';

const input = { id: 1, title: 'Test', summary: 'Excerpt', input_hash: 'hash' };
const brief = { en: { title: 'Test', summary: 'Short' }, vi: { title: 'Thử', summary: 'Ngắn' }, categories: ['Products'] };
function setup() {
  const repository = { claim: jest.fn().mockResolvedValueOnce(input).mockResolvedValue(null), save: jest.fn().mockResolvedValue(true), fail: jest.fn() };
  const gemini = { enabled: true, model: 'test-model', generate: jest.fn().mockResolvedValue(brief) };
  const cache = { invalidateArticles: jest.fn() };
  return { repository, gemini, cache, service: new ArticleBriefService(repository as never, gemini as never, cache as never) };
}
describe('ArticleBriefService', () => {
  it('stores a brief and invalidates lists and detail', async () => {
    const { service, gemini, cache, repository } = setup();
    await expect(service.run()).resolves.toMatchObject({ processed: 1, failed: 0 });
    expect(repository.save).toHaveBeenCalledWith(input, expect.any(String), 'test-model', brief);
    expect(gemini.generate).toHaveBeenCalledTimes(1);
    expect(cache.invalidateArticles).toHaveBeenCalledTimes(1);
  });
  it('does not call AI if no pending rows exist', async () => {
    const { service, repository, gemini } = setup();
    repository.claim.mockReset().mockResolvedValue(null);
    await service.run();
    expect(gemini.generate).not.toHaveBeenCalled();
  });
  it('stops on quota and records a deferred retry', async () => {
    const { service, repository, gemini } = setup();
    gemini.generate.mockRejectedValue(new Error('GEMINI_HTTP_429'));
    await expect(service.run()).resolves.toMatchObject({ status: 'partial', failed: 1, error: 'GEMINI_HTTP_429' });
    expect(repository.claim).toHaveBeenCalledTimes(1);
    expect(repository.fail).toHaveBeenCalledWith(1, expect.any(String), 'GEMINI_HTTP_429');
    expect(repository.save).not.toHaveBeenCalled();
  });
  it('skips when the provider is not configured', async () => {
    const { service, repository, gemini } = setup();
    gemini.enabled = false;
    await expect(service.run()).resolves.toMatchObject({ status: 'disabled' });
    expect(repository.claim).not.toHaveBeenCalled();
  });
});
