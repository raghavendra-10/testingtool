-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column for semantic search
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_requirements_embedding ON requirements
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
