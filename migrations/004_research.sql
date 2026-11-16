CREATE TABLE IF NOT EXISTS research_runs(id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL,input_hash TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS research_queries(query TEXT PRIMARY KEY,payload TEXT NOT NULL,checked_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS research_sources(url TEXT PRIMARY KEY,payload TEXT NOT NULL,checked_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS research_source_versions(hash TEXT PRIMARY KEY,payload TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS research_feedback(id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES research_runs(id),kind TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);
