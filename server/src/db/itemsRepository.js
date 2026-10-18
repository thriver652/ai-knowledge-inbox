// Data access for items. Returns plain camelCase objects; SQL stays in this file.

const toItem = (row) =>
  row && {
    id: row.id,
    sourceType: row.source_type,
    title: row.title,
    url: row.url,
    content: row.content,
    status: row.status,
    error: row.error,
    chunkCount: row.chunk_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

export function createItemsRepository(db) {
  const stmts = {
    insert: db.prepare(`
      INSERT INTO items (id, source_type, title, url, content, status, created_at, updated_at)
      VALUES (@id, @sourceType, @title, @url, @content, 'pending', @now, @now)`),
    get: db.prepare('SELECT * FROM items WHERE id = ?'),
    list: db.prepare('SELECT * FROM items ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM items'),
    markReady: db.prepare(
      `UPDATE items SET status = 'ready', error = NULL, chunk_count = ?, updated_at = ? WHERE id = ?`,
    ),
    markFailed: db.prepare(
      `UPDATE items SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`,
    ),
    remove: db.prepare('DELETE FROM items WHERE id = ?'),
    // Pending items (interrupted by a restart) and ready items that have no vectors for the
    // current embedding model (provider/model was switched).
    needingIndex: db.prepare(`
      SELECT * FROM items i
      WHERE i.status = 'pending'
         OR (i.status = 'ready' AND NOT EXISTS (
               SELECT 1 FROM chunks c WHERE c.item_id = i.id AND c.embedding_model = ?))
      ORDER BY created_at`),
    byIds: (n) => db.prepare(`SELECT * FROM items WHERE id IN (${Array(n).fill('?').join(',')})`),
  };

  return {
    insert({ id, sourceType, title, url, content }) {
      stmts.insert.run({ id, sourceType, title, url, content, now: new Date().toISOString() });
      return toItem(stmts.get.get(id));
    },
    get: (id) => toItem(stmts.get.get(id)),
    list: ({ limit, offset }) => ({
      items: stmts.list.all(limit, offset).map(toItem),
      total: stmts.count.get().n,
    }),
    getMany(ids) {
      if (ids.length === 0) return new Map();
      return new Map(stmts.byIds(ids.length).all(...ids).map((r) => [r.id, toItem(r)]));
    },
    markReady: (id, chunkCount) => stmts.markReady.run(chunkCount, new Date().toISOString(), id),
    markFailed: (id, error) => stmts.markFailed.run(error, new Date().toISOString(), id),
    remove: (id) => stmts.remove.run(id).changes > 0,
    listNeedingIndex: (model) => stmts.needingIndex.all(model).map(toItem),
  };
}
