import { transaction } from './database.js';

// Data access for chunks + their embeddings. Embeddings are stored as raw Float32 bytes.

const toBlob = (vec) => new Uint8Array(Float32Array.from(vec).buffer);
// Copy into a fresh buffer: a Float32Array view needs a 4-byte-aligned offset.
const fromBlob = (bytes) => new Float32Array(Uint8Array.from(bytes).buffer);

export function createChunksRepository(db) {
  const insert = db.prepare(`
    INSERT INTO chunks (id, item_id, ordinal, text, embedding, embedding_model, created_at)
    VALUES (@id, @itemId, @ordinal, @text, @embedding, @model, @now)`);
  const deleteForItem = db.prepare('DELETE FROM chunks WHERE item_id = ?');
  const allForModel = db.prepare(
    'SELECT id, item_id, ordinal, text, embedding FROM chunks WHERE embedding_model = ?',
  );

  // Replace an item's chunks atomically so a retry never leaves duplicates behind.
  const replaceForItem = transaction(db, (itemId, model, chunks) => {
    deleteForItem.run(itemId);
    const now = new Date().toISOString();
    for (const c of chunks) {
      insert.run({
        id: c.id,
        itemId,
        ordinal: c.ordinal,
        text: c.text,
        embedding: toBlob(c.embedding),
        model,
        now,
      });
    }
  });

  return {
    replaceForItem,
    loadAllForModel: (model) =>
      allForModel.all(model).map((r) => ({
        id: r.id,
        itemId: r.item_id,
        ordinal: r.ordinal,
        text: r.text,
        embedding: fromBlob(r.embedding),
      })),
  };
}
