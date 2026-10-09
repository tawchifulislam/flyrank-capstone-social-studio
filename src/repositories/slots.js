const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

export function createSlot(db, { variantId, scheduledAt, idempotencyKey }) {
  const result = db
    .prepare(
      "INSERT INTO slots (variant_id, scheduled_at, idempotency_key) VALUES (?, ?, ?)"
    )
    .run(variantId, scheduledAt, idempotencyKey);
  return getSlot(db, Number(result.lastInsertRowid));
}

export function getSlot(db, id) {
  return db.prepare("SELECT * FROM slots WHERE id = ?").get(id) ?? null;
}

export function getSlotByKey(db, idempotencyKey) {
  return (
    db.prepare("SELECT * FROM slots WHERE idempotency_key = ?").get(idempotencyKey) ??
    null
  );
}

export function getSlotByVariant(db, variantId) {
  return (
    db
      .prepare("SELECT * FROM slots WHERE variant_id = ? ORDER BY id DESC LIMIT 1")
      .get(variantId) ?? null
  );
}

export function deletePendingSlotsForVariant(db, variantId) {
  const result = db
    .prepare("DELETE FROM slots WHERE variant_id = ? AND status = 'pending'")
    .run(variantId);
  return Number(result.changes);
}

export function claimSlot(db, id) {
  const result = db
    .prepare(
      `UPDATE slots SET status = 'claimed', claimed_at = ${NOW} WHERE id = ? AND status = 'pending'`
    )
    .run(id);
  return Number(result.changes) === 1;
}

export function releaseSlot(db, id) {
  const result = db
    .prepare(
      "UPDATE slots SET status = 'pending', claimed_at = NULL WHERE id = ? AND status = 'claimed'"
    )
    .run(id);
  return Number(result.changes) === 1;
}

export function finishSlot(db, id, status) {
  db.prepare("UPDATE slots SET status = ? WHERE id = ?").run(status, id);
}
