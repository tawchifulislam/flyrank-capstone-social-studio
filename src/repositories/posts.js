export function createPost(db, { sourceType, sourceUrl, title, body }) {
  const result = db
    .prepare(
      "INSERT INTO posts (source_type, source_url, title, body) VALUES (?, ?, ?, ?)"
    )
    .run(sourceType, sourceUrl ?? null, title, body);
  return getPost(db, Number(result.lastInsertRowid));
}

export function getPost(db, id) {
  return db.prepare("SELECT * FROM posts WHERE id = ?").get(id) ?? null;
}
