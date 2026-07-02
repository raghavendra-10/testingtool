CREATE TABLE IF NOT EXISTS requirement_duplicates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requirement_a_id UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  requirement_b_id UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  similarity REAL NOT NULL,
  is_duplicate VARCHAR(10) NOT NULL,
  explanation TEXT,
  suggested_action VARCHAR(20) NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_req_dupes_project ON requirement_duplicates(project_id);
