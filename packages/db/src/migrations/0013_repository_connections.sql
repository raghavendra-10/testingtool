CREATE TABLE IF NOT EXISTS repository_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL,
  repo_url TEXT NOT NULL,
  branch VARCHAR(255) NOT NULL DEFAULT 'main',
  encrypted_token TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  last_analyzed_at TIMESTAMPTZ,
  endpoint_count INTEGER DEFAULT 0,
  stack_detected TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repo_conn_project ON repository_connections(project_id);
