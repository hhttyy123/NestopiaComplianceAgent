CREATE TABLE research_trace (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES research_runs(id), created_at TEXT NOT NULL, kind TEXT NOT NULL, summary TEXT NOT NULL, payload TEXT NOT NULL);
CREATE INDEX research_trace_run ON research_trace(run_id, created_at);
