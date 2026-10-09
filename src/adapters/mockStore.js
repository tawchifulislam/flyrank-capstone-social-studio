export function ensureMockTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mock_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      adapter TEXT NOT NULL,
      variant_id INTEGER NOT NULL,
      idempotency_key TEXT NOT NULL,
      text TEXT NOT NULL,
      preview TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
}

export function recordMockPost(db, { adapter, variantId, idempotencyKey, text, preview }) {
  const result = db
    .prepare(
      "INSERT INTO mock_posts (adapter, variant_id, idempotency_key, text, preview) VALUES (?, ?, ?, ?, ?)"
    )
    .run(adapter, variantId, idempotencyKey, text, preview);
  return Number(result.lastInsertRowid);
}

export function listMockPosts(db) {
  return db.prepare("SELECT * FROM mock_posts ORDER BY id").all();
}
