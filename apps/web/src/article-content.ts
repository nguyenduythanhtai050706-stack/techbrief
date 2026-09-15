type Content = {
  title: string;
  summary: string | null;
  translations?: Record<'en' | 'vi', { title: string; summary: string }>;
};

export function articleContent(article: Content, locale: 'en' | 'vi') {
  const localized = article.translations?.[locale];
  return {
    title: localized?.title ?? article.title,
    summary: localized?.summary ?? article.summary,
    generated: !!localized,
  };
}
