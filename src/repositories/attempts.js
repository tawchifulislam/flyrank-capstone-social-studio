export function recordAttempt(
  db,
  { slotId, variantId, platform, idempotencyKey, result, externalId = null, error = null }
) {
  db.prepare(
    "INSERT INTO publish_attempts (slot_id, variant_id, platform, idempotency_key, result, external_id, error) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(slotId, variantId, platform, idempotencyKey, result, externalId, error);
}

export function findSuccessByKey(db, idempotencyKey) {
  return (
    db
      .prepare(
        "SELECT * FROM publish_attempts WHERE idempotency_key = ? AND result = 'success' LIMIT 1"
      )
      .get(idempotencyKey) ?? null
  );
}

export function lastAttemptForSlot(db, slotId) {
  return (
    db
      .prepare(
        "SELECT * FROM publish_attempts WHERE slot_id = ? AND result IN ('success', 'failed', 'unknown') ORDER BY id DESC LIMIT 1"
      )
      .get(slotId) ?? null
  );
}

export function countFailedAttempts(db, slotId) {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS total FROM publish_attempts WHERE slot_id = ? AND result IN ('failed', 'unknown')"
    )
    .get(slotId);
  return Number(row.total);
}

export function listHistory(db, limit) {
  return db
    .prepare(
      "SELECT id, slot_id, variant_id, platform, idempotency_key, result, external_id, error, attempted_at FROM publish_attempts ORDER BY id DESC LIMIT ?"
    )
    .all(limit);
}
