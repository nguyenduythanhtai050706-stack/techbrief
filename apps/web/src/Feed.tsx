import { useEffect, useState } from "react";

type Article = {
  id: number;
  canonicalUrl: string;
  title: string;
  summary: string | null;
  imageUrl?: string | null;
  publishedAt: string | null;
  sources: { id: number; name: string }[];
};
type Page = { items: Article[]; totalPages: number };

const labels = {
  vi: {
    latest: "Mới nhất",
    feed: "Dòng tin",
    loading: "Đang tải bản tin…",
    empty: "Chưa có bản tin nào.",
    error: "Không thể tải bản tin. Bạn thử lại nhé.",
    retry: "Thử lại",
    more: "Xem thêm",
    original: "Đọc bài gốc ↗",
  },
  en: {
    latest: "Latest",
    feed: "The feed",
    loading: "Loading briefs…",
    empty: "No stories yet.",
    error: "Could not load stories. Please try again.",
    retry: "Try again",
    more: "Load more",
    original: "Read original ↗",
  },
};

function safeUrl(value: string | null | undefined) {
  try {
    const url = new URL(value ?? "");
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function ArticleCard({
  article,
  locale,
  lead = false,
}: {
  article: Article;
  locale: "vi" | "en";
  lead?: boolean;
}) {
  const [failedImage, setFailedImage] = useState<string>();
  const image = safeUrl(article.imageUrl);
  const href = safeUrl(article.canonicalUrl);
  const summary = new DOMParser()
    .parseFromString(article.summary ?? "", "text/html")
    .body.textContent?.trim();
  const date = article.publishedAt ? new Date(article.publishedAt) : null;
  return (
    <article className={`news-card ${lead ? "news-lead" : ""}`}>
      {image && failedImage !== image && (
        <img
          src={image}
          alt=""
          loading={lead ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedImage(image)}
        />
      )}
      <div className="news-copy">
        {lead && <p className="eyebrow">{labels[locale].latest}</p>}
        <h3>
          <a href={href}>{article.title}</a>
        </h3>
        <p className="news-meta">
          {article.sources.map((source) => source.name).join(" · ")}
          {date && !Number.isNaN(date.getTime()) && (
            <>
              {" "}
              ·{" "}
              <time dateTime={date.toISOString()}>
                {date.toLocaleDateString(locale === "vi" ? "vi-VN" : "en-US")}
              </time>
            </>
          )}
        </p>
        {summary && <p className="news-summary">{summary}</p>}
        {href && (
          <a className="news-original" href={href}>
            {labels[locale].original}
          </a>
        )}
      </div>
    </article>
  );
}

export function Feed({ locale }: { locale: "vi" | "en" }) {
  const [items, setItems] = useState<Article[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const text = labels[locale];
  useEffect(() => {
    const controller = new AbortController();
    const base = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");
    fetch(`${base}/articles?page=${page}&limit=12`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Request failed");
        const data: Page = await response.json();
        if (!Array.isArray(data.items) || !Number.isInteger(data.totalPages))
          throw new Error("Invalid response");
        if (controller.signal.aborted) return;
        setItems((previous) =>
          page === 1
            ? data.items
            : [
                ...previous,
                ...data.items.filter(
                  (item) =>
                    !previous.some((existing) => existing.id === item.id),
                ),
              ],
        );
        setTotalPages(data.totalPages);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, attempt]);

  return (
    <section
      className="news-feed"
      aria-label={text.feed}
      aria-busy={loading}
    >
      {items.length > 0 && (
        <>
          <div className="news-featured">
            <ArticleCard
              key={items[0].id}
              article={items[0]}
              locale={locale}
              lead
            />
            <div className="news-side">
              {items.slice(1, 3).map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  locale={locale}
                />
              ))}
            </div>
          </div>
          <div className="news-list">
            {items.slice(3).map((article) => (
              <ArticleCard key={article.id} article={article} locale={locale} />
            ))}
          </div>
        </>
      )}
      <div role="status">
        {loading
          ? text.loading
          : !error && items.length === 0
            ? text.empty
            : ""}
      </div>
      {error && <p role="alert">{text.error}</p>}
      {error && (
        <button
          className="preference-button"
          disabled={loading}
          onClick={() => {
            setError(false);
            setLoading(true);
            setAttempt((value) => value + 1);
          }}
        >
          {text.retry}
        </button>
      )}
      {!error && page < totalPages && (
        <button
          className="preference-button"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            setPage((value) => value + 1);
          }}
        >
          {text.more}
        </button>
      )}
    </section>
  );
}
