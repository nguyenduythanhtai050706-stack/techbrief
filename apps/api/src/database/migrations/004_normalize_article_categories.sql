-- Source labels remain in articles.categories. Both legacy rows and future
-- ingestion writes receive the same normalized, indexable categories.
CREATE OR REPLACE FUNCTION normalize_article_categories(raw_categories JSONB)
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  WITH labels AS (
    SELECT btrim(regexp_replace(lower(value #>> '{}'), '[[:space:]_-]+', ' ', 'g')) AS label
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(raw_categories) = 'array' THEN raw_categories ELSE '[]'::jsonb END
    ) AS entries(value)
    WHERE jsonb_typeof(value) = 'string'
  ), matched AS (
    SELECT DISTINCT CASE
      WHEN label IN (
        'ai', 'artificial intelligence', 'machine learning', 'deep learning',
        'generative ai', 'large language model', 'large language models',
        'llm', 'llms', 'ai and machine learning', 'ai & ml', 'trí tuệ nhân tạo'
      ) THEN 'AI'
      WHEN label IN (
        'product', 'products', 'review', 'reviews', 'gadgets', 'gear',
        'gear and gadgets', 'gear & gadgets', 'hardware', 'software',
        'apps', 'devices', 'smartphones', 'laptops', 'consumer tech', 'sản phẩm'
      ) THEN 'Products'
      WHEN label IN (
        'technology', 'công nghệ', 'security', 'cybersecurity', 'bảo mật',
        'infrastructure', 'programming', 'engineering', 'internet',
        'startups', 'networking', 'science', 'robotics', 'lập trình'
      ) THEN 'Technology'
      ELSE NULL
    END AS category
    FROM labels
  )
  SELECT COALESCE(
    jsonb_agg(category ORDER BY category) FILTER (WHERE category IS NOT NULL),
    '["Technology"]'::jsonb
  )
  FROM matched;
$$;

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS normalized_categories JSONB
  GENERATED ALWAYS AS (normalize_article_categories(categories)) STORED;

CREATE INDEX IF NOT EXISTS articles_normalized_categories_idx
  ON articles USING GIN (normalized_categories);
