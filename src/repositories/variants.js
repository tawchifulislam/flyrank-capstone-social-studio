const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

function placeholders(values) {
  return values.map(() => "?").join(", ");
}

export function createVariant(db, { postId, platform, text }) {
  const result = db
    .prepare("INSERT INTO variants (post_id, platform, text) VALUES (?, ?, ?)")
    .run(postId, platform, text);
  return getVariant(db, Number(result.lastInsertRowid));
}

export function getVariant(db, id) {
  return db.prepare("SELECT * FROM variants WHERE id = ?").get(id) ?? null;
}

export function listVariantsByPost(db, postId) {
  return db
    .prepare("SELECT * FROM variants WHERE post_id = ? ORDER BY id")
    .all(postId);
}

export function deleteReplaceableVariants(db, postId, platform) {
  db.prepare(
    "DELETE FROM variants WHERE post_id = ? AND platform = ? AND status IN ('draft', 'rejected')"
  ).run(postId, platform);
}

export function transitionVariant(db, id, fromStatuses, toStatus, reason = null) {
  const result = db
    .prepare(
      `UPDATE variants SET status = ?, rejection_reason = ?, updated_at = ${NOW} WHERE id = ? AND status IN (${placeholders(fromStatuses)})`
    )
    .run(toStatus, reason, id, ...fromStatuses);
  return Number(result.changes) === 1;
}

export function updateVariantText(db, id, text, fromStatuses) {
  const result = db
    .prepare(
      `UPDATE variants SET text = ?, status = 'draft', rejection_reason = NULL, updated_at = ${NOW} WHERE id = ? AND status IN (${placeholders(fromStatuses)})`
    )
    .run(text, id, ...fromStatuses);
  return Number(result.changes) === 1;
}
