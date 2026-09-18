import { useEffect, useRef, useState } from "react";
import { articleContent } from './article-content';

export type Article = {
  translations?: Record<'en' | 'vi', { title: string; summary: string }>;
  id: number;
  canonicalUrl: string;
  title: string;
  summary: string | null;
  imageUrl?: string | null;
  publishedAt: string | null;
  categories: string[];
  sources: { id: number; name: string }[];
};
type Page = { items: Article[]; totalPages: number };
const categoryValues = ['', 'Products', 'AI', 'Technology'] as const;
type CategoryFilter = (typeof categoryValues)[number];

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
    categories: ["Tất cả", "Sản phẩm", "AI", "Công nghệ"],
    filterLabel: "Lọc theo danh mục",
    pending: "Chưa có bản dịch · Nội dung gốc",
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
    categories: ["All", "Products", "AI", "Technology"],
    filterLabel: "Filter by category",
    pending: "Original content · Translation unavailable",
  },
} as const;

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
  const content = articleContent(article, locale);
  const summary = new DOMParser()
    .parseFromString(content.summary ?? "", "text/html")
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
        <h3 lang={locale}><a href={`/articles/${article.id}`}>{content.title}</a></h3>
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
        {!content.generated && <p className="news-meta">{labels[locale].pending}</p>}
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
  const [category, setCategory] = useState<CategoryFilter>("");
  const ingestionPromise = useRef<Promise<void> | null>(null);
  const text = labels[locale];

  function changeCategory(next: CategoryFilter) {
    if (next === category) return;
    setItems([]);
    setPage(1);
    setTotalPages(1);
    setError(false);
    setLoading(true);
    setCategory(next);
  }
  useEffect(() => {
    const controller = new AbortController();
    const base = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");
    const categoryQuery = category ? `&category=${encodeURIComponent(category)}` : "";
    if (page === 1 && !ingestionPromise.current) {
      ingestionPromise.current = fetch(`${base}/ingestion/run`, {
        method: "POST",
      }).then((response) => {
        if (!response.ok) throw new Error("Ingestion failed");
      });
    }

    async function loadArticles() {
      if (page === 1 && ingestionPromise.current) {
        try {
          await ingestionPromise.current;
        } catch (ingestionError) {
          if (controller.signal.aborted) return;
          console.warn("Could not refresh the feed before loading articles", ingestionError);
        }
      }

      const response = await fetch(
        `${base}/articles?page=${page}&limit=12${categoryQuery}`,
        { signal: controller.signal },
      );
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
    }

    loadArticles()
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, attempt, category]);

  return (
    <section
      className="news-feed"
      aria-label={text.feed}
      aria-busy={loading}
    >
      <div className="category-tabs" role="group" aria-label={text.filterLabel}>
        {text.categories.map((label, index) => (
          <button
            key={categoryValues[index]}
            type="button"
            className="preference-button"
            aria-pressed={category === categoryValues[index]}
            onClick={() => changeCategory(categoryValues[index])}
          >
            {label}
          </button>
        ))}
      </div>
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
