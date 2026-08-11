CREATE TABLE IF NOT EXISTS articles (
  id SERIAL PRIMARY KEY,
  canonical_url TEXT NOT NULL UNIQUE,
  content_fingerprint CHAR(64) UNIQUE,
  title VARCHAR(500) NOT NULL,
  summary TEXT,
  published_at TIMESTAMPTZ,
  author VARCHAR(255),
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS article_sources (
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (article_id, source_id, external_id)
);
