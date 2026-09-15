import { useEffect, useRef, useState } from 'react'
import type { Article } from './Feed'
import { articleContent } from './article-content'

const copy = {
  vi: { back: '← Quay lại dòng tin', loading: 'Đang tải bài…', missing: 'Không tìm thấy bài viết.', error: 'Không thể tải bài viết.', retry: 'Thử lại', excerpt: 'Đoạn trích từ nguồn RSS', empty: 'Nguồn chưa cung cấp đoạn trích cho bài này.', original: 'Đọc bài gốc ↗' },
  en: { back: '← Back to feed', loading: 'Loading article…', missing: 'Article not found.', error: 'Could not load this article.', retry: 'Try again', excerpt: 'Excerpt from the RSS source', empty: 'The source has not provided an excerpt for this article.', original: 'Read original ↗' },
}

export function ArticleReader({ id, locale }: { id: string; locale: 'vi' | 'en' }) {
  const [article, setArticle] = useState<Article>()
  const [error, setError] = useState<'missing' | 'error'>()
  const [failedImage, setFailedImage] = useState<string>()
  const [attempt, setAttempt] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const text = copy[locale]

  useEffect(() => {
    const controller = new AbortController()
    const base = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')
    fetch(`${base}/articles/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 404 ? 'missing' : 'error')
        const data: Article = await response.json()
        if (data.id !== Number(id) || typeof data.title !== 'string' || !Array.isArray(data.sources)) {
          throw new Error('error')
        }
        if (!controller.signal.aborted) setArticle(data)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error && reason.message === 'missing' ? 'missing' : 'error')
      })
    return () => controller.abort()
  }, [id, attempt])

  useEffect(() => {
    if (article) heading.current?.focus({ preventScroll: true })
  }, [article])

  const content = article ? articleContent(article, locale) : undefined
  const summary = new DOMParser().parseFromString(content?.summary ?? '', 'text/html').body.textContent?.trim()
  let original: string | undefined
  let image: string | undefined
  try {
    const url = new URL(article?.canonicalUrl ?? '')
    if (['http:', 'https:'].includes(url.protocol)) original = url.href
  } catch { /* Invalid source URLs are not rendered as links. */ }
  try {
    const url = new URL(article?.imageUrl ?? '')
    if (['http:', 'https:'].includes(url.protocol)) image = url.href
  } catch { /* Invalid image URLs are not rendered. */ }

  return (
    <section className="article-reader" aria-busy={!article && !error}>
      <a className="reader-back" href="/">{text.back}</a>
      {!article && !error && <p role="status">{text.loading}</p>}
      {error && <p role="alert">{text[error]}</p>}
      {error === 'error' && <button className="preference-button" onClick={() => { setError(undefined); setAttempt(value => value + 1) }}>{text.retry}</button>}
      {article && <article>
        <p className="eyebrow">TechBrief</p>
        <h1 ref={heading} tabIndex={-1} lang={locale}>{content?.title}</h1>
        <p className="news-meta">{article.sources.map(source => source.name).join(' · ')}</p>
        {image && failedImage !== image && <img className="reader-image" src={image} alt="" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedImage(image)} />}
        <h2>{content?.generated ? (locale === 'vi' ? 'Bản tóm tắt TechBrief' : 'TechBrief summary') : text.excerpt}</h2>
        <p className="news-meta">{content?.generated
          ? (locale === 'vi' ? 'Tóm tắt bằng AI từ nội dung RSS; có thể có sai sót. Xem nguồn để đối chiếu.' : 'AI summary based on the RSS excerpt; may contain errors. Check the source for details.')
          : (locale === 'vi' ? 'Chưa có bản dịch. Đang hiển thị nội dung gốc.' : 'Translation unavailable. Showing original content.')}</p>
        <p className="reader-summary">{summary || text.empty}</p>
        {original && <a className="reader-original" href={original} target="_blank" rel="noopener noreferrer">{text.original}</a>}
      </article>}
    </section>
  )
}
