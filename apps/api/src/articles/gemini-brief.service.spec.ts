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

  it('uses provider-compatible string enum values throughout the response schema', async () => {
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      const rawBody = init?.body;
      const body = JSON.parse(typeof rawBody === 'string' ? rawBody : '') as {
        generationConfig: { responseSchema: unknown };
      };
      function validEnums(node: unknown): boolean {
        if (!node || typeof node !== 'object') return true;
        const value = node as Record<string, unknown>;
        if (
          Array.isArray(value.enum) &&
          value.enum.some((item) => typeof item !== 'string')
        )
          return false;
        return Object.values(value).every(validEnums);
      }
      if (!validEnums(body.generationConfig.responseSchema)) {
        return Promise.resolve(
          new Response('Invalid schema enum type', { status: 400 }),
        );
      }
      return Promise.resolve(
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
    });

    await expect(service().generateV2(packet)).resolves.toMatchObject({
      schemaVersion: 2,
    });
  });

  it('keeps a thin source honest with cited facts and explicit missing details', async () => {
    const limitedPacket = {
      ...packet,
      title: 'Volta Labs previews a battery prototype',
      evidenceLevel: 'limited' as const,
      chunks: [
        {
          ...packet.chunks[0],
          text: 'Volta Labs previewed a battery prototype. No specifications or availability details were supplied in the feed.',
        },
      ],
    };
    const draft = {
      schemaVersion: 2,
      en: {
        title: limitedPacket.title,
        feedSummary: 'Volta Labs previewed a battery prototype.',
        summary:
          'Volta Labs previewed a battery prototype. The supplied source does not provide technical specifications or availability details, so its performance and practical impact cannot be established from this report.',
        keyPoints: [
          {
            text: 'Volta Labs previewed a battery prototype.',
            evidenceIds: ['E1'],
          },
          {
            text: 'The supplied source gives no technical specifications.',
            evidenceIds: ['E1'],
          },
          {
            text: 'The supplied source gives no availability details.',
            evidenceIds: ['E1'],
          },
        ],
      },
      vi: {
        title: 'Volta Labs giới thiệu nguyên mẫu pin',
        feedSummary: 'Volta Labs đã giới thiệu một nguyên mẫu pin.',
        summary:
          'Volta Labs đã giới thiệu một nguyên mẫu pin. Nguồn được cung cấp chưa nêu thông số kỹ thuật hoặc thời điểm có thể sử dụng, nên chưa đủ căn cứ để xác định hiệu năng và tác động thực tế từ bản tin này.',
        keyPoints: [
          {
            text: 'Volta Labs đã giới thiệu một nguyên mẫu pin.',
            evidenceIds: ['E1'],
          },
          {
            text: 'Nguồn được cung cấp chưa nêu thông số kỹ thuật.',
            evidenceIds: ['E1'],
          },
          {
            text: 'Nguồn được cung cấp chưa nêu thời điểm có thể sử dụng.',
            evidenceIds: ['E1'],
          },
        ],
      },
      categories: ['Technology'],
    };
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: JSON.stringify(draft) }] },
            },
          ],
        }),
      ),
    );

    const result = await service().generateV2(limitedPacket);
    expect(result.en.keyPoints).toHaveLength(3);
    expect(result.vi.keyPoints).toHaveLength(3);
    expect(result.en.summary).toContain('cannot be established');
    expect(result.vi.summary).toContain('chưa đủ căn cứ');
    expect(result.en.summary).not.toMatch(/\d/);
    expect(result.evidence).toEqual([
      { id: 'E1', ...packet.chunks[0].sources[0] },
    ]);
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
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('repairs a missed word limit once using measured feedback', async () => {
    const short = structuredClone(briefV2Draft);
    short.en.feedSummary = 'Google added offline editing for business users.';
    const responseFor = (draft: unknown) =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: JSON.stringify(draft) }] },
            },
          ],
        }),
      );
    const request = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(responseFor(short))
      .mockResolvedValueOnce(responseFor(briefV2Draft));

    await expect(service().generateV2(packet)).resolves.toMatchObject({
      schemaVersion: 2,
    });
    expect(request).toHaveBeenCalledTimes(2);
    const rawBody = request.mock.calls[1][1]?.body;
    const repair = JSON.parse(typeof rawBody === 'string' ? rawBody : '') as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    expect(repair.contents[2].parts[0].text).toContain(
      'en.feedSummary has 7 words',
    );
  });

  it('does not loop when the repaired copy still misses the word limit', async () => {
    const short = structuredClone(briefV2Draft);
    short.en.feedSummary = 'Too short.';
    const request = jest.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: 'STOP',
                content: { parts: [{ text: JSON.stringify(short) }] },
              },
            ],
          }),
        ),
      ),
    );

    await expect(service().generateV2(packet)).rejects.toThrow('INVALID_BRIEF');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('preserves quota errors during length repair and stops immediately', async () => {
    const short = structuredClone(briefV2Draft);
    short.en.feedSummary = 'Too short.';
    const request = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: 'STOP',
                content: { parts: [{ text: JSON.stringify(short) }] },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response('Quota exceeded', { status: 429 }));

    await expect(service().generateV2(packet)).rejects.toThrow(
      'GEMINI_HTTP_429',
    );
    expect(request).toHaveBeenCalledTimes(2);
  });
});
