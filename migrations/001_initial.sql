CREATE TABLE IF NOT EXISTS projects (
 id TEXT PRIMARY KEY, revision INTEGER NOT NULL, name TEXT NOT NULL, payload TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), sequence INTEGER NOT NULL,
 project_revision INTEGER NOT NULL, request_key TEXT NOT NULL, request_hash TEXT NOT NULL,
 payload TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(project_id,sequence), UNIQUE(project_id,request_key)
);
CREATE TABLE IF NOT EXISTS notes (
 id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES reviews(id), payload TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge_controls (
 id TEXT PRIMARY KEY, blocked INTEGER NOT NULL, reason TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge_changes (
 id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES reviews(id), payload TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_project ON reviews(project_id,sequence DESC);
CREATE INDEX IF NOT EXISTS idx_notes_review ON notes(review_id,created_at);
