type Content = {
  title: string;
  summary: string | null;
  translations?:
    | Record<'en' | 'vi', { title: string; summary: string }>
    | {
        schemaVersion: 2;
        en: LocalizedV2;
        vi: LocalizedV2;
        evidence: Evidence[];
        evidenceLevel: 'rich' | 'limited';
      };
};

export type Evidence = {
  id: string;
  sourceId: number;
  sourceName: string;
  sourceUrl: string;
};

type KeyPoint = { text: string; evidenceIds: string[] };
type LocalizedV2 = {
  title: string;
  feedSummary: string;
  summary: string;
  keyPoints: KeyPoint[];
};

export function safeHttpUrl(value: string | null | undefined): string | undefined {
  try {
    const url = new URL(value ?? '');
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function articleContent(article: Content, locale: 'en' | 'vi') {
  const translations = article.translations;
  const localized = translations?.[locale];
  const v2 =
    translations &&
    'schemaVersion' in translations &&
    translations.schemaVersion === 2
      ? translations
      : undefined;
  return {
    title: localized?.title ?? article.title,
    summary: localized?.summary ?? article.summary,
    feedSummary: v2 ? v2[locale].feedSummary : localized?.summary ?? article.summary,
    keyPoints: v2?.[locale].keyPoints ?? [],
    evidence: v2?.evidence ?? [],
    evidenceLevel: v2?.evidenceLevel,
    generated: !!localized,
    schemaVersion: v2 ? 2 : localized ? 1 : 0,
  };
}
