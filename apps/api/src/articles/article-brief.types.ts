export type BriefCategory = 'AI' | 'Products' | 'Technology';
export interface LocalizedBrief { title: string; summary: string }
export interface ArticleBrief {
  en: LocalizedBrief;
  vi: LocalizedBrief;
  categories: BriefCategory[];
}

export function validateBrief(value: unknown): ArticleBrief {
  if (!value || typeof value !== 'object') throw new Error('INVALID_BRIEF');
  const data = value as Record<string, unknown>;
  const locales = {} as Pick<ArticleBrief, 'en' | 'vi'>;
  for (const locale of ['en', 'vi'] as const) {
    const item = data[locale] as Record<string, unknown> | undefined;
    if (!item || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 500 ||
      typeof item.summary !== 'string' || !item.summary.trim() || item.summary.length > 4000) {
      throw new Error('INVALID_BRIEF');
    }
    locales[locale] = { title: item.title.trim(), summary: item.summary.trim() };
  }
  if (!Array.isArray(data.categories) || data.categories.length === 0 || data.categories.length > 3 ||
    data.categories.some((category: unknown) => !['AI', 'Products', 'Technology'].includes(category as string))) {
    throw new Error('INVALID_BRIEF');
  }
  return { ...locales, categories: [...new Set(data.categories as BriefCategory[])].sort() };
}
