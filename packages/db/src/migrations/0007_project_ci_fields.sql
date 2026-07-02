ALTER TABLE projects ADD COLUMN IF NOT EXISTS coverage_threshold INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_installation_id TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_repo TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS bitbucket_workspace TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS bitbucket_repo TEXT;
