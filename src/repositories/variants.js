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
