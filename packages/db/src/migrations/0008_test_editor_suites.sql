-- Test editor: lock edited tests from regeneration
ALTER TABLE generated_tests ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT false;

-- Test suites
CREATE TABLE IF NOT EXISTS test_suites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  run_order VARCHAR(20) NOT NULL DEFAULT 'parallel',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE generated_tests ADD COLUMN IF NOT EXISTS suite_id UUID REFERENCES test_suites(id) ON DELETE SET NULL;
