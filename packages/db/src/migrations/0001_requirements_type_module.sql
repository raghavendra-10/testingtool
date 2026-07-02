-- Rename category → type, add module column
ALTER TABLE requirements RENAME COLUMN category TO type;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS module VARCHAR(255) DEFAULT '';
