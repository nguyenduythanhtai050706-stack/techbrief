ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS brief_schema_version INTEGER,
  ADD COLUMN IF NOT EXISTS brief_prompt_version TEXT;

CREATE INDEX IF NOT EXISTS articles_brief_version_idx
  ON articles (brief_schema_version, brief_prompt_version);
