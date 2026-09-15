ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS translations JSONB,
  ADD COLUMN IF NOT EXISTS ai_categories JSONB,
  ADD COLUMN IF NOT EXISTS brief_input_hash TEXT,
  ADD COLUMN IF NOT EXISTS brief_model TEXT,
  ADD COLUMN IF NOT EXISTS brief_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS brief_claim TEXT,
  ADD COLUMN IF NOT EXISTS brief_lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS brief_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS brief_error TEXT;

-- Keep RSS labels intact. AI classifications take precedence only after success.
ALTER TABLE articles ADD COLUMN IF NOT EXISTS effective_categories JSONB
  GENERATED ALWAYS AS (COALESCE(ai_categories, normalize_article_categories(categories))) STORED;
CREATE INDEX IF NOT EXISTS articles_effective_categories_idx
  ON articles USING GIN (effective_categories);
