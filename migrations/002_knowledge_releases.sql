CREATE TABLE knowledge_releases (
 id TEXT PRIMARY KEY, payload TEXT NOT NULL, content_hash TEXT NOT NULL,
 published_by TEXT NOT NULL, evidence TEXT NOT NULL, validation_json TEXT NOT NULL, published_at TEXT NOT NULL
);
CREATE TABLE knowledge_head (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), release_id TEXT NOT NULL REFERENCES knowledge_releases(id)
);
CREATE TABLE knowledge_change_events (
 id TEXT PRIMARY KEY, change_id TEXT NOT NULL REFERENCES knowledge_changes(id),
 kind TEXT NOT NULL CHECK(kind IN ('verified','published')), payload TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX idx_change_events ON knowledge_change_events(change_id);
CREATE TRIGGER immutable_knowledge_release_update BEFORE UPDATE ON knowledge_releases BEGIN SELECT RAISE(ABORT, 'Knowledge releases are immutable'); END;
CREATE TRIGGER immutable_knowledge_release_delete BEFORE DELETE ON knowledge_releases BEGIN SELECT RAISE(ABORT, 'Knowledge releases are immutable'); END;
