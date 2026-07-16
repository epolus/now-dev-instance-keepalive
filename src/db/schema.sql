CREATE TABLE IF NOT EXISTS instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  instance_url TEXT NOT NULL,
  username TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,
  interval_minutes INTEGER NOT NULL DEFAULT 240,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_run_at TEXT,
  last_result TEXT,
  next_run_at TEXT
);

CREATE TABLE IF NOT EXISTS login_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id INTEGER NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  success INTEGER NOT NULL,
  message TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_login_logs_instance_id ON login_logs(instance_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_timestamp ON login_logs(timestamp DESC);
