export type BriefCategory = 'AI' | 'Products' | 'Technology';
export interface LocalizedBrief {
  title: string;
  summary: string;
}
export interface ArticleBrief {
  en: LocalizedBrief;
  vi: LocalizedBrief;
  categories: BriefCategory[];
}

export interface LocalizedBriefV2 {
  title: string;
  feedSummary: string;
  summary: string;
  keyPoints: Array<{ text: string; evidenceIds: string[] }>;
}

export interface BriefEvidence {
  id: string;
  sourceId: number;
  sourceName: string;
  sourceUrl: string;
}

export interface ArticleBriefV2 {
  schemaVersion: 2;
  en: LocalizedBriefV2;
  vi: LocalizedBriefV2;
  evidence: BriefEvidence[];
  categories: BriefCategory[];
  evidenceLevel: 'rich' | 'limited';
}

export interface BriefEvidenceContext {
  evidenceLevel: 'rich' | 'limited';
  evidence: Array<{
    id: string;
    text: string;
    sources?: Array<{
      sourceId: number;
      sourceName: string;
      sourceUrl: string;
    }>;
    sourceId?: number;
    sourceName?: string;
    sourceUrl?: string;
  }>;
}

const allowedCategories = ['AI', 'Products', 'Technology'] as const;

function invalidBrief(): never {
  throw new Error('INVALID_BRIEF');
}

function invalidEvidence(): never {
  throw new Error('INVALID_BRIEF_EVIDENCE');
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

const unitAliases: Record<string, string> = {
  '%': '%',
  percent: '%',
  percentage: '%',
  million: 'million',
  triệu: 'million',
  billion: 'billion',
  tỷ: 'billion',
  tỉ: 'billion',
  thousand: 'thousand',
  nghìn: 'thousand',
  ms: 'ms',
  gb: 'gb',
  tb: 'tb',
  mhz: 'mhz',
  ghz: 'ghz',
  hours: 'hour',
  hour: 'hour',
  giờ: 'hour',
  days: 'day',
  day: 'day',
  ngày: 'day',
  weeks: 'week',
  week: 'week',
  tuần: 'week',
  months: 'month',
  month: 'month',
  tháng: 'month',
  years: 'year',
  year: 'year',
};

function numericClaims(value: string): Set<string> {
  const claims = new Set<string>();
  const pattern =
    /([$€£])?\s*(\d+(?:[.,]\d+)*)\s*(%|percent(?:age)?|million|billion|thousand|triệu|tỷ|tỉ|nghìn|ms|gb|tb|mhz|ghz|hours?|giờ|days?|ngày|weeks?|tuần|months?|tháng|years?)?\s*(USD|EUR|GBP)?/giu;
  for (const match of value.matchAll(pattern)) {
    const currency =
      match[4]?.toLowerCase() ??
      { $: 'usd', '€': 'eur', '£': 'gbp' }[match[1] ?? ''] ??
      '';
    const number = match[2]
      .replace(',', '.')
      .replace(/(?<=\d)\.(?=\d{3}(?:\D|$))/g, '');
    const unit = match[3]
      ? (unitAliases[match[3].toLowerCase()] ?? match[3].toLowerCase())
      : '';
    claims.add(`${number}|${unit}|${currency}`);
  }
  return claims;
}

function assertClaimsSupported(output: string, evidence: string): void {
  const supported = numericClaims(evidence);
  for (const claim of numericClaims(output)) {
    if (!supported.has(claim)) invalidEvidence();
  }
}

function parseLocale(
  value: unknown,
  level: 'rich' | 'limited',
  evidenceById: Map<string, BriefEvidenceContext['evidence'][number]>,
): LocalizedBriefV2 {
  if (!value || typeof value !== 'object') invalidBrief();
  const item = value as Record<string, unknown>;
  if (!hasOnlyKeys(item, ['title', 'feedSummary', 'summary', 'keyPoints']))
    invalidBrief();
  if (
    typeof item.title !== 'string' ||
    !item.title.trim() ||
    item.title.length > 500
  )
    invalidBrief();
  if (typeof item.feedSummary !== 'string' || typeof item.summary !== 'string')
    invalidBrief();
  const feedWords = wordCount(item.feedSummary);
  const summaryWords = wordCount(item.summary);
  if (feedWords < (level === 'rich' ? 35 : 1) || feedWords > 60) invalidBrief();
  if (summaryWords < (level === 'rich' ? 120 : 1) || summaryWords > 220)
    invalidBrief();
  if (!Array.isArray(item.keyPoints)) invalidBrief();
  if (
    item.keyPoints.length < (level === 'rich' ? 3 : 1) ||
    item.keyPoints.length > 5
  )
    invalidBrief();

  const keyPoints = item.keyPoints.map(
    (raw): LocalizedBriefV2['keyPoints'][number] => {
      if (!raw || typeof raw !== 'object') invalidBrief();
      const point = raw as Record<string, unknown>;
      if (!hasOnlyKeys(point, ['text', 'evidenceIds'])) invalidBrief();
      if (
        typeof point.text !== 'string' ||
        !point.text.trim() ||
        point.text.length > 1000
      )
        invalidBrief();
      if (!Array.isArray(point.evidenceIds) || point.evidenceIds.length === 0)
        invalidEvidence();
      if (
        point.evidenceIds.some(
          (id) => typeof id !== 'string' || !evidenceById.has(id),
        )
      )
        invalidEvidence();
      const evidenceText = [...new Set(point.evidenceIds as string[])]
        .map((id) => evidenceById.get(id)?.text ?? '')
        .join(' ');
      assertClaimsSupported(point.text, evidenceText);
      return {
        text: point.text.trim(),
        evidenceIds: [...new Set(point.evidenceIds as string[])],
      };
    },
  );

  const allEvidence = [...evidenceById.values()]
    .map((item) => item.text)
    .join(' ');
  assertClaimsSupported(
    `${item.title} ${item.feedSummary} ${item.summary}`,
    allEvidence,
  );
  return {
    title: item.title.trim(),
    feedSummary: item.feedSummary.trim(),
    summary: item.summary.trim(),
    keyPoints,
  };
}

export function validateBriefV2(
  value: unknown,
  context: BriefEvidenceContext,
): ArticleBriefV2 {
  if (!value || typeof value !== 'object') invalidBrief();
  const data = value as Record<string, unknown>;
  if (!hasOnlyKeys(data, ['schemaVersion', 'en', 'vi', 'categories']))
    invalidBrief();
  if (data.schemaVersion !== 2) invalidBrief();
  if (
    !Array.isArray(data.categories) ||
    data.categories.length === 0 ||
    data.categories.length > 3
  )
    invalidBrief();
  if (
    data.categories.some(
      (category) => !allowedCategories.includes(category as BriefCategory),
    )
  )
    invalidBrief();
  if (!Array.isArray(context.evidence) || context.evidence.length === 0)
    invalidEvidence();
  const evidenceById = new Map(context.evidence.map((item) => [item.id, item]));
  if (evidenceById.size !== context.evidence.length) invalidEvidence();

  const en = parseLocale(data.en, context.evidenceLevel, evidenceById);
  const vi = parseLocale(data.vi, context.evidenceLevel, evidenceById);
  const enClaims = numericClaims(
    `${en.title} ${en.feedSummary} ${en.summary} ${en.keyPoints.map((point) => point.text).join(' ')}`,
  );
  const viClaims = numericClaims(
    `${vi.title} ${vi.feedSummary} ${vi.summary} ${vi.keyPoints.map((point) => point.text).join(' ')}`,
  );
  if (
    [...enClaims].some((claim) => !viClaims.has(claim)) ||
    [...viClaims].some((claim) => !enClaims.has(claim))
  )
    invalidEvidence();

  const citedIds = new Set([
    ...en.keyPoints.flatMap((point) => point.evidenceIds),
    ...vi.keyPoints.flatMap((point) => point.evidenceIds),
  ]);
  const evidence: BriefEvidence[] = [];
  for (const id of citedIds) {
    const item = evidenceById.get(id)!;
    const sources =
      item.sources ??
      (item.sourceId !== undefined && item.sourceName && item.sourceUrl
        ? [
            {
              sourceId: item.sourceId,
              sourceName: item.sourceName,
              sourceUrl: item.sourceUrl,
            },
          ]
        : []);
    if (sources.length === 0) invalidEvidence();
    for (const source of sources) {
      evidence.push({ id, ...source });
    }
  }

  return {
    schemaVersion: 2,
    en,
    vi,
    evidence,
    categories: [...new Set(data.categories as BriefCategory[])].sort(),
    evidenceLevel: context.evidenceLevel,
  };
}

export function validateBrief(value: unknown): ArticleBrief {
  if (!value || typeof value !== 'object') throw new Error('INVALID_BRIEF');
  const data = value as Record<string, unknown>;
  const locales = {} as Pick<ArticleBrief, 'en' | 'vi'>;
  for (const locale of ['en', 'vi'] as const) {
    const item = data[locale] as Record<string, unknown> | undefined;
    if (
      !item ||
      typeof item.title !== 'string' ||
      !item.title.trim() ||
      item.title.length > 500 ||
      typeof item.summary !== 'string' ||
      !item.summary.trim() ||
      item.summary.length > 4000
    ) {
      throw new Error('INVALID_BRIEF');
    }
    locales[locale] = {
      title: item.title.trim(),
      summary: item.summary.trim(),
    };
  }
  if (
    !Array.isArray(data.categories) ||
    data.categories.length === 0 ||
    data.categories.length > 3 ||
    data.categories.some(
      (category: unknown) =>
        !['AI', 'Products', 'Technology'].includes(category as string),
    )
  ) {
    throw new Error('INVALID_BRIEF');
  }
  return {
    ...locales,
    categories: [...new Set(data.categories as BriefCategory[])].sort(),
  };
}
