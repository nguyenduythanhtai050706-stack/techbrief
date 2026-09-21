import { validateBriefV2 } from './article-brief.types';
import {
  briefQualityFixtures,
  type BriefEvidenceFixture,
} from './article-brief-v2.fixtures';

type EvidenceLevel = 'rich' | 'limited';

interface ValidationContext {
  evidence: BriefEvidenceFixture[];
  evidenceLevel: EvidenceLevel;
}

const words = (count: number, word: string) =>
  Array.from({ length: count }, () => word).join(' ');

function validDraft() {
  return {
    schemaVersion: 2,
    en: {
      title: 'A grounded AI update',
      feedSummary: words(35, 'update'),
      summary: words(120, 'context'),
      keyPoints: [
        { text: 'The source describes the launch.', evidenceIds: ['E1'] },
        {
          text: 'The announcement names the intended users.',
          evidenceIds: ['E1'],
        },
        { text: 'The source does not provide pricing.', evidenceIds: ['E1'] },
      ],
    },
    vi: {
      title: 'Cập nhật AI có dẫn chứng',
      feedSummary: words(35, 'cập-nhật'),
      summary: words(120, 'bối-cảnh'),
      keyPoints: [
        { text: 'Nguồn mô tả việc ra mắt.', evidenceIds: ['E1'] },
        {
          text: 'Thông báo nêu nhóm người dùng mục tiêu.',
          evidenceIds: ['E1'],
        },
        { text: 'Nguồn không cung cấp giá.', evidenceIds: ['E1'] },
      ],
    },
    categories: ['AI'],
  };
}

const context = (): ValidationContext => ({
  evidenceLevel: 'rich',
  evidence: [
    {
      id: 'E1',
      sourceId: 1,
      sourceName: 'Trusted Source',
      sourceUrl: 'https://news.example/article',
      text: 'The source describes the launch for business users. Pricing was not provided. Pixel 9 is supported and usage increased by 50%.',
    },
  ],
});

describe('Day 16 quality fixtures', () => {
  it('covers the eight required evidence risks with an explicit rubric', () => {
    expect(briefQualityFixtures.map((fixture) => fixture.id)).toEqual([
      'numbers-and-dates',
      'qualitative-only',
      'attributed-forecast',
      'multi-source-event',
      'number-in-product-name',
      'thin-rss-excerpt',
      'prompt-injection',
      'en-to-vi-fidelity',
    ]);

    for (const fixture of briefQualityFixtures) {
      expect(fixture.evidence.length).toBeGreaterThan(0);
      expect(fixture.expected.requiredFacts.length).toBeGreaterThan(0);
      expect(fixture.expected.forbiddenClaims.length).toBeGreaterThan(0);
      expect(
        fixture.evidence.every((item) => item.sourceUrl.startsWith('https://')),
      ).toBe(true);
    }
  });
});

describe('validateBriefV2 contract', () => {
  it('accepts a rich brief and hydrates trusted evidence metadata', () => {
    const result = validateBriefV2(validDraft(), context());

    expect(result).toMatchObject({
      schemaVersion: 2,
      evidenceLevel: 'rich',
      evidence: [
        {
          id: 'E1',
          sourceId: 1,
          sourceName: 'Trusted Source',
          sourceUrl: 'https://news.example/article',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('usage increased by 50%');
  });

  it('allows a limited brief to remain shorter than the rich word target', () => {
    const draft = validDraft();
    draft.en.feedSummary =
      'The available source only confirms a product update.';
    draft.en.summary =
      'The source only confirms the update. It provides limited supporting detail.';
    draft.vi.feedSummary =
      'Nguồn hiện có chỉ xác nhận một bản cập nhật sản phẩm.';
    draft.vi.summary =
      'Nguồn chỉ xác nhận bản cập nhật và cung cấp ít thông tin hỗ trợ.';

    expect(
      validateBriefV2(draft, { ...context(), evidenceLevel: 'limited' }),
    ).toMatchObject({ evidenceLevel: 'limited' });
  });

  it.each([
    [
      'more than five key points',
      () => {
        const draft = validDraft();
        draft.en.keyPoints.push(
          { text: 'Fourth point.', evidenceIds: ['E1'] },
          { text: 'Fifth point.', evidenceIds: ['E1'] },
          { text: 'Sixth point.', evidenceIds: ['E1'] },
        );
        return draft;
      },
    ],
    [
      'a rich summary shorter than 120 words',
      () => {
        const draft = validDraft();
        draft.en.summary = words(119, 'context');
        return draft;
      },
    ],
    [
      'a feed summary longer than 60 words',
      () => {
        const draft = validDraft();
        draft.vi.feedSummary = words(61, 'cập-nhật');
        return draft;
      },
    ],
  ])('rejects %s', (_name, makeDraft) => {
    expect(() => validateBriefV2(makeDraft(), context())).toThrow(
      'INVALID_BRIEF',
    );
  });

  it('rejects an evidence ID that was not supplied by the server', () => {
    const draft = validDraft();
    draft.en.keyPoints[0].evidenceIds = ['E404'];

    expect(() => validateBriefV2(draft, context())).toThrow(
      'INVALID_BRIEF_EVIDENCE',
    );
  });

  it('rejects a key point without an evidence reference', () => {
    const draft = validDraft();
    draft.vi.keyPoints[0].evidenceIds = [];

    expect(() => validateBriefV2(draft, context())).toThrow(
      'INVALID_BRIEF_EVIDENCE',
    );
  });

  it('rejects evidence metadata or URLs supplied by the model', () => {
    const draft = {
      ...validDraft(),
      evidence: [
        {
          id: 'E1',
          sourceId: 999,
          sourceName: 'Invented Source',
          sourceUrl: 'https://invented.example/story',
        },
      ],
    };

    expect(() => validateBriefV2(draft, context())).toThrow('INVALID_BRIEF');
  });

  it('rejects a number not present in the evidence cited by a key point', () => {
    const draft = validDraft();
    draft.en.keyPoints[0] = {
      text: 'Usage increased by 51%.',
      evidenceIds: ['E1'],
    };

    expect(() => validateBriefV2(draft, context())).toThrow(
      'INVALID_BRIEF_EVIDENCE',
    );
  });

  it('does not treat a supported number in a product name as an invented statistic', () => {
    const draft = validDraft();
    draft.en.keyPoints[0] = {
      text: 'Pixel 9 is supported.',
      evidenceIds: ['E1'],
    };
    draft.vi.keyPoints[0] = {
      text: 'Pixel 9 được hỗ trợ.',
      evidenceIds: ['E1'],
    };

    expect(() => validateBriefV2(draft, context())).not.toThrow();
  });

  it('matches translated currency notation without changing the amount or unit', () => {
    const draft = validDraft();
    draft.en.keyPoints[0] = {
      text: 'Revenue reached $3.2 billion.',
      evidenceIds: ['E1'],
    };
    draft.vi.keyPoints[0] = {
      text: 'Doanh thu đạt 3,2 tỷ USD.',
      evidenceIds: ['E1'],
    };
    const evidence = context();
    evidence.evidence[0].text = 'Revenue reached $3.2 billion.';

    expect(() => validateBriefV2(draft, evidence)).not.toThrow();
  });
});
