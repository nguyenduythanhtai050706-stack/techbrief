import { ConfigService } from '@nestjs/config';
import { GeminiBriefService } from './gemini-brief.service';
import { validateBrief } from './article-brief.types';

const brief = {
  en: { title: 'New AI model', summary: 'The company introduced a model.' },
  vi: { title: 'Mô hình AI mới', summary: 'Công ty giới thiệu một mô hình.' },
  categories: ['AI'],
};
const words = (count: number, word: string) =>
  Array.from({ length: count }, () => word).join(' ');
const packet = {
  articleId: 1,
  title: 'Pixel 9 update',
  evidenceLevel: 'rich' as const,
  chunks: [
    {
      id: 'E1',
      text: 'Google added offline editing to Pixel 9 for business users. Pricing was not disclosed.',
      sources: [
        {
          sourceId: 7,
          sourceName: 'Device Report',
          sourceUrl: 'https://device.example/pixel-9',
        },
      ],
      hash: 'a'.repeat(64),
    },
  ],
  hash: 'b'.repeat(64),
};
const briefV2Draft = {
  schemaVersion: 2,
  en: {
    title: 'Pixel 9 update',
    feedSummary: words(35, 'update'),
    summary: words(120, 'context'),
    keyPoints: [
      { text: 'Google added offline editing to Pixel 9.', evidenceIds: ['E1'] },
      { text: 'The feature is for business users.', evidenceIds: ['E1'] },
      { text: 'Pricing was not disclosed.', evidenceIds: ['E1'] },
    ],
  },
  vi: {
    title: 'Cập nhật Pixel 9',
    feedSummary: words(35, 'cập-nhật'),
    summary: words(120, 'bối-cảnh'),
    keyPoints: [
      {
        text: 'Google bổ sung chỉnh sửa ngoại tuyến cho Pixel 9.',
        evidenceIds: ['E1'],
      },
      {
        text: 'Tính năng dành cho người dùng doanh nghiệp.',
        evidenceIds: ['E1'],
      },
      { text: 'Giá chưa được công bố.', evidenceIds: ['E1'] },
    ],
  },
  categories: ['Products'],
};

describe('GeminiBriefService', () => {
  afterEach(() => jest.restoreAllMocks());
  const service = () =>
    new GeminiBriefService(
      new ConfigService({ GEMINI_API_KEY: 'test-secret' }),
    );

  it('sends credentials in headers and validates bilingual JSON', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: JSON.stringify(brief) }] },
            },
          ],
        }),
      ),
    );
    await expect(
      service().generate('Original', 'RSS content'),
    ).resolves.toEqual(brief);
    expect(request.mock.calls[0][0]).not.toContain('test-secret');
    expect(request.mock.calls[0][1]?.headers).toMatchObject({
      'x-goog-api-key': 'test-secret',
    });
  });
  it('reports quota without exposing provider response or key', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('test-secret', { status: 429 }));
    await expect(service().generate('A', null)).rejects.toThrow(
      'GEMINI_HTTP_429',
    );
  });
  it('rejects truncated output', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS' }] }),
        ),
      );
    await expect(service().generate('A', null)).rejects.toThrow(
      'INVALID_BRIEF',
    );
  });
  it('does not call the network without a key', async () => {
    const request = jest.spyOn(global, 'fetch');
    await expect(
      new GeminiBriefService(new ConfigService({})).generate('A', null),
    ).rejects.toThrow('GEMINI_KEY_MISSING');
    expect(request).not.toHaveBeenCalled();
  });
  it.each([
    { ...brief, vi: null },
    { ...brief, categories: ['Politics'] },
    { ...brief, categories: [] },
    { ...brief, en: { title: '', summary: 'A' } },
  ])('rejects malformed result %j', (value) => {
    expect(() => validateBrief(value)).toThrow('INVALID_BRIEF');
  });

  it('sends only evidence IDs and text for V2, then hydrates trusted source URLs', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: JSON.stringify(briefV2Draft) }] },
            },
          ],
        }),
      ),
    );

    await expect(service().generateV2(packet)).resolves.toMatchObject({
      schemaVersion: 2,
      evidence: [
        { id: 'E1', sourceId: 7, sourceUrl: 'https://device.example/pixel-9' },
      ],
    });

    const rawBody = request.mock.calls[0]?.[1]?.body;
    expect(typeof rawBody).toBe('string');
    const body = JSON.parse(typeof rawBody === 'string' ? rawBody : '') as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    expect(body.contents[0].parts[0].text).toContain('"id":"E1"');
    expect(body.contents[0].parts[0].text).not.toContain('device.example');
  });

  it('surfaces V2 evidence validation failures distinctly', async () => {
    const invalid = structuredClone(briefV2Draft);
    invalid.en.keyPoints[0].text = 'Usage improved by 51%.';
    invalid.vi.keyPoints[0].text = 'Mức sử dụng tăng 51%.';
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: JSON.stringify(invalid) }] },
            },
          ],
        }),
      ),
    );

    await expect(service().generateV2(packet)).rejects.toThrow(
      'INVALID_BRIEF_EVIDENCE',
    );
  });
});
