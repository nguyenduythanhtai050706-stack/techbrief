ALTER TABLE article_sources
  ADD COLUMN IF NOT EXISTS article_url TEXT,
  ADD COLUMN IF NOT EXISTS source_text TEXT,
  ADD COLUMN IF NOT EXISTS source_text_kind TEXT NOT NULL DEFAULT 'unavailable',
  ADD COLUMN IF NOT EXISTS source_text_hash CHAR(64);

ALTER TABLE article_sources
  DROP CONSTRAINT IF EXISTS article_sources_source_text_kind_check;

ALTER TABLE article_sources
  ADD CONSTRAINT article_sources_source_text_kind_check
  CHECK (source_text_kind IN ('rss_full', 'rss_excerpt', 'page', 'unavailable'));

CREATE INDEX IF NOT EXISTS article_sources_article_evidence_idx
  ON article_sources (article_id, source_id);
