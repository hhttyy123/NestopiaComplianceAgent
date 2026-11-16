CREATE TABLE ai_explanations (
 review_id TEXT PRIMARY KEY REFERENCES reviews(id), payload TEXT NOT NULL, updated_at TEXT NOT NULL
);
