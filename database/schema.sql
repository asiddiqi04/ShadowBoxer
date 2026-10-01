CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  round_duration_seconds INTEGER NOT NULL,
  succeeded_count INTEGER NOT NULL,
  failed_count INTEGER NOT NULL,
  total_combos INTEGER NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
