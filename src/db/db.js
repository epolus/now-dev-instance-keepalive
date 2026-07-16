const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let db;

function getDb() {
  if (db) return db;

  const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/keepalive.db');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  return db;
}

function getInstanceById(id) {
  return getDb().prepare('SELECT * FROM instances WHERE id = ?').get(id);
}

function getAllInstances() {
  return getDb().prepare('SELECT * FROM instances ORDER BY name ASC').all();
}

function getEnabledInstances() {
  return getDb().prepare('SELECT * FROM instances WHERE enabled = 1 ORDER BY name ASC').all();
}

function createInstance({ name, instance_url, username, encrypted_password, interval_minutes, enabled }) {
  const result = getDb()
    .prepare(
      `INSERT INTO instances (name, instance_url, username, encrypted_password, interval_minutes, enabled)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(name, instance_url, username, encrypted_password, interval_minutes, enabled ? 1 : 0);
  return result.lastInsertRowid;
}

function updateInstance(id, { name, instance_url, username, encrypted_password, interval_minutes, enabled }) {
  if (encrypted_password !== undefined) {
    getDb()
      .prepare(
        `UPDATE instances SET name = ?, instance_url = ?, username = ?, encrypted_password = ?,
         interval_minutes = ?, enabled = ? WHERE id = ?`
      )
      .run(name, instance_url, username, encrypted_password, interval_minutes, enabled ? 1 : 0, id);
  } else {
    getDb()
      .prepare(
        `UPDATE instances SET name = ?, instance_url = ?, username = ?,
         interval_minutes = ?, enabled = ? WHERE id = ?`
      )
      .run(name, instance_url, username, interval_minutes, enabled ? 1 : 0, id);
  }
}

function deleteInstance(id) {
  getDb().prepare('DELETE FROM instances WHERE id = ?').run(id);
}

function updateInstanceRunStatus(id, { last_run_at, last_result, next_run_at }) {
  getDb()
    .prepare(
      `UPDATE instances SET last_run_at = ?, last_result = ?, next_run_at = ? WHERE id = ?`
    )
    .run(last_run_at, last_result, next_run_at, id);
}

function insertLoginLog({ instance_id, success, message, duration_ms }) {
  getDb()
    .prepare(
      `INSERT INTO login_logs (instance_id, success, message, duration_ms) VALUES (?, ?, ?, ?)`
    )
    .run(instance_id, success ? 1 : 0, message, duration_ms);
}

function getRecentLogs(limit = 50) {
  return getDb()
    .prepare(
      `SELECT l.*, i.name AS instance_name
       FROM login_logs l
       JOIN instances i ON i.id = l.instance_id
       ORDER BY l.timestamp DESC
       LIMIT ?`
    )
    .all(limit);
}

function getLogsForInstance(instanceId, limit = 20) {
  return getDb()
    .prepare(
      `SELECT * FROM login_logs WHERE instance_id = ? ORDER BY timestamp DESC LIMIT ?`
    )
    .all(instanceId, limit);
}

module.exports = {
  getDb,
  getInstanceById,
  getAllInstances,
  getEnabledInstances,
  createInstance,
  updateInstance,
  deleteInstance,
  updateInstanceRunStatus,
  insertLoginLog,
  getRecentLogs,
  getLogsForInstance,
};
