ALTER TABLE generated_tests ADD COLUMN IF NOT EXISTS quality_score INTEGER;
ALTER TABLE generated_tests ADD COLUMN IF NOT EXISTS quality_notes TEXT;
