import { ConfigService } from '@nestjs/config';
import { GeminiBriefService } from './gemini-brief.service';
import { validateBrief } from './article-brief.types';

const brief = { en: { title: 'New AI model', summary: 'The company introduced a model.' }, vi: { title: 'Mô hình AI mới', summary: 'Công ty giới thiệu một mô hình.' }, categories: ['AI'] };

describe('GeminiBriefService', () => {
  afterEach(() => jest.restoreAllMocks());
  const service = () => new GeminiBriefService(new ConfigService({ GEMINI_API_KEY: 'test-secret' }));

  it('sends credentials in headers and validates bilingual JSON', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(brief) }] } }] })));
    await expect(service().generate('Original', 'RSS content')).resolves.toEqual(brief);
    expect(request.mock.calls[0][0]).not.toContain('test-secret');
    expect(request.mock.calls[0][1]?.headers).toMatchObject({ 'x-goog-api-key': 'test-secret' });
  });
  it('reports quota without exposing provider response or key', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('test-secret', { status: 429 }));
    await expect(service().generate('A', null)).rejects.toThrow('GEMINI_HTTP_429');
  });
  it('rejects truncated output', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS' }] })));
    await expect(service().generate('A', null)).rejects.toThrow('INVALID_BRIEF');
  });
  it('does not call the network without a key', async () => {
    const request = jest.spyOn(global, 'fetch');
    await expect(new GeminiBriefService(new ConfigService({})).generate('A', null)).rejects.toThrow('GEMINI_KEY_MISSING');
    expect(request).not.toHaveBeenCalled();
  });
  it.each([
    { ...brief, vi: null }, { ...brief, categories: ['Politics'] },
    { ...brief, categories: [] }, { ...brief, en: { title: '', summary: 'A' } },
  ])('rejects malformed result %j', value => {
    expect(() => validateBrief(value)).toThrow('INVALID_BRIEF');
  });
});
