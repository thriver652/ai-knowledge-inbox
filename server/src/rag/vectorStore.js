// Brute-force cosine search over an in-memory copy of the chunk embeddings.
// SQLite is the source of truth; this cache is rebuilt from it at startup and kept in
// sync on every write, so search never touches disk.
//
// Exact search is O(N·d) per query. At d=1536 that's fine for tens of thousands of chunks
// (single-digit ms); past that, swap this module for sqlite-vec / pgvector / an ANN index
// without changing callers. See README "What breaks at scale".

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function normalize(vec) {
  const out = Float32Array.from(vec);
  let norm = 0;
  for (let i = 0; i < out.length; i++) norm += out[i] * out[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

export function createVectorStore({ chunksRepository, model }) {
  // itemId -> array of { id, itemId, ordinal, text, embedding }
  const byItem = new Map();

  for (const chunk of chunksRepository.loadAllForModel(model)) {
    if (!byItem.has(chunk.itemId)) byItem.set(chunk.itemId, []);
    byItem.get(chunk.itemId).push(chunk);
  }

  return {
    model,
    // Persist first, then update the cache, so a crash can't leave the cache ahead of disk.
    upsertItem(itemId, chunks) {
      const normalized = chunks.map((c) => ({ ...c, itemId, embedding: normalize(c.embedding) }));
      chunksRepository.replaceForItem(itemId, model, normalized);
      byItem.set(itemId, normalized);
    },
    removeItem(itemId) {
      byItem.delete(itemId);
    },
    size() {
      let n = 0;
      for (const list of byItem.values()) n += list.length;
      return n;
    },
    search(queryEmbedding, { topK, minScore }) {
      const q = normalize(queryEmbedding);
      const scored = [];
      for (const list of byItem.values()) {
        for (const chunk of list) {
          if (chunk.embedding.length !== q.length) continue;
          const score = dot(q, chunk.embedding);
          if (score >= minScore) scored.push({ chunk, score });
        }
      }
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, topK);
    },
  };
}
