import { useEffect, useRef, useState } from "react";
import type { Article } from "./Feed";
import { articleContent, safeHttpUrl } from "./article-content";

const copy = {
  vi: {
    back: "← Quay lại dòng tin",
    loading: "Đang tải bài…",
    missing: "Không tìm thấy bài viết.",
    error: "Không thể tải bài viết.",
    retry: "Thử lại",
    excerpt: "Đoạn trích từ nguồn RSS",
    empty: "Nguồn chưa cung cấp đoạn trích cho bài này.",
    original: "Đọc bài gốc ↗",
    summary: "Bản tóm tắt TechBrief",
    keyPoints: "Ý chính",
    evidence: "Nguồn dẫn chứng",
    rich: "Nguồn đầy đủ",
    limited: "Nguồn giới hạn",
    aiV2: "Tóm tắt bằng AI dựa trên các nguồn dẫn chứng bên dưới; có thể có sai sót. Xem nguồn để đối chiếu.",
    aiV1: "Tóm tắt bằng AI từ nội dung RSS; có thể có sai sót. Xem nguồn để đối chiếu.",
    untranslated: "Chưa có bản dịch. Đang hiển thị nội dung gốc.",
  },
  en: {
    back: "← Back to feed",
    loading: "Loading article…",
    missing: "Article not found.",
    error: "Could not load this article.",
    retry: "Try again",
    excerpt: "Excerpt from the RSS source",
    empty: "The source has not provided an excerpt for this article.",
    original: "Read original ↗",
    summary: "TechBrief summary",
    keyPoints: "Key points",
    evidence: "Evidence sources",
    rich: "Full sources",
    limited: "Limited sources",
    aiV2: "AI summary grounded in the evidence sources below; it may contain errors. Check the sources for details.",
    aiV1: "AI summary based on the RSS excerpt; may contain errors. Check the source for details.",
    untranslated: "Translation unavailable. Showing original content.",
  },
};

export function ArticleReader({
  id,
  locale,
}: {
  id: string;
  locale: "vi" | "en";
}) {
  const [article, setArticle] = useState<Article>();
  const [error, setError] = useState<"missing" | "error">();
  const [failedImage, setFailedImage] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const text = copy[locale];

  useEffect(() => {
    const controller = new AbortController();
    const base = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");
    fetch(`${base}/articles/${encodeURIComponent(id)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(response.status === 404 ? "missing" : "error");
        const data: Article = await response.json();
        if (
          data.id !== Number(id) ||
          typeof data.title !== "string" ||
          !Array.isArray(data.sources)
        ) {
          throw new Error("error");
        }
        if (!controller.signal.aborted) setArticle(data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error && reason.message === "missing"
              ? "missing"
              : "error",
          );
      });
    return () => controller.abort();
  }, [id, attempt]);

  useEffect(() => {
    if (article) heading.current?.focus({ preventScroll: true });
  }, [article]);

  const content = article ? articleContent(article, locale) : undefined;
  const summary = new DOMParser()
    .parseFromString(content?.summary ?? "", "text/html")
    .body.textContent?.trim();
  const safeEvidence = (content?.evidence ?? []).flatMap((evidence) => {
    const url = safeHttpUrl(evidence.sourceUrl);
    return url ? [{ ...evidence, sourceUrl: url }] : [];
  });
  const evidenceForIds = (ids: string[]) =>
    safeEvidence.filter(
      (item, index, all) =>
        ids.includes(item.id) &&
        all.findIndex(
          (candidate) =>
            candidate.sourceId === item.sourceId &&
            candidate.sourceUrl === item.sourceUrl &&
            ids.includes(candidate.id),
        ) === index,
    );
  const original = safeHttpUrl(article?.canonicalUrl);
  const image = safeHttpUrl(article?.imageUrl);

  return (
    <section className="article-reader" aria-busy={!article && !error}>
      <a className="reader-back" href="/">
        {text.back}
      </a>
      {!article && !error && <p role="status">{text.loading}</p>}
      {error && <p role="alert">{text[error]}</p>}
      {error === "error" && (
        <button
          className="preference-button"
          onClick={() => {
            setError(undefined);
            setAttempt((value) => value + 1);
          }}
        >
          {text.retry}
        </button>
      )}
      {article && (
        <article>
          <p className="eyebrow">TechBrief</p>
          <h1 ref={heading} tabIndex={-1} lang={locale}>
            {content?.title}
          </h1>
          <p className="news-meta">
            {article.sources.map((source) => source.name).join(" · ")}
          </p>
          {image && failedImage !== image && (
            <img
              className="reader-image"
              src={image}
              alt=""
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setFailedImage(image)}
            />
          )}
          <h2>{content?.generated ? text.summary : text.excerpt}</h2>
          {content?.schemaVersion === 2 && content.evidenceLevel && (
            <p className={`evidence-level evidence-${content.evidenceLevel}`}>
              {text[content.evidenceLevel]}
            </p>
          )}
          <p className="news-meta">
            {content?.generated
              ? content.schemaVersion === 2
                ? text.aiV2
                : text.aiV1
              : text.untranslated}
          </p>
          <p className="reader-summary">{summary || text.empty}</p>
          {content?.schemaVersion === 2 && content.keyPoints.length > 0 && (
            <section
              className="reader-key-points"
              aria-labelledby="key-points-heading"
            >
              <h2 id="key-points-heading">{text.keyPoints}</h2>
              <ul>
                {content.keyPoints.map((point, index) => (
                  <li key={`${point.text}-${index}`}>
                    <span>{point.text}</span>
                    <span className="point-sources">
                      {evidenceForIds(point.evidenceIds).map((source) => (
                        <a
                          key={`${source.id}-${source.sourceId}`}
                          href={source.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {source.sourceName} ↗
                        </a>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {content?.schemaVersion === 2 && safeEvidence.length > 0 && (
            <section
              className="reader-evidence"
              aria-labelledby="evidence-heading"
            >
              <h2 id="evidence-heading">{text.evidence}</h2>
              <ul>
                {safeEvidence
                  .filter(
                    (item, index, all) =>
                      all.findIndex(
                        (candidate) =>
                          candidate.sourceId === item.sourceId &&
                          candidate.sourceUrl === item.sourceUrl,
                      ) === index,
                  )
                  .map((item) => (
                    <li key={`${item.sourceId}-${item.sourceUrl}`}>
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {item.sourceName} ↗
                      </a>
                    </li>
                  ))}
              </ul>
            </section>
          )}
          {original && (
            <a
              className="reader-original"
              href={original}
              target="_blank"
              rel="noopener noreferrer"
            >
              {text.original}
            </a>
          )}
        </article>
      )}
    </section>
  );
}
