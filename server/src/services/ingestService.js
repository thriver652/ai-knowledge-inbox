import crypto from 'node:crypto';
import { Errors } from '../errors.js';
import { chunkText, normalizeText } from '../rag/chunker.js';
import { fetchUrlContent } from '../ingest/urlFetcher.js';

const deriveNoteTitle = (text) => {
  const firstLine = text.split('\n').find((l) => l.trim())?.trim() ?? '';
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine || null;
};

// Ingestion is two-phase:
//   1. synchronous: validate, fetch the URL, persist the raw item (status "pending")
//      -> the client gets fast, specific errors for bad input or unreachable URLs.
//   2. async job: chunk + embed + index (status -> "ready" | "failed")
//      -> slow/flaky AI calls never hold the HTTP request open.
export function createIngestService({ config, itemsRepository, vectorStore, ai, jobQueue, logger }) {
  async function indexItem(item) {
    const log = logger.child({ itemId: item.id });
    const started = Date.now();
    try {
      const chunks = chunkText(item.content, config.chunking);
      if (chunks.length === 0) throw Errors.emptyContent('Nothing to index after cleaning the text.');

      // Prefix each chunk with its document title before embedding ("contextual header"),
      // so a chunk that never names its topic can still be found by it.
      const header = item.title ? `${item.title}\n\n` : '';
      const embeddings = await ai.embed(chunks.map((c) => header + c));

      vectorStore.upsertItem(
        item.id,
        chunks.map((text, i) => ({ id: crypto.randomUUID(), ordinal: i, text, embedding: embeddings[i] })),
      );
      itemsRepository.markReady(item.id, chunks.length);
      log.info({ chunks: chunks.length, ms: Date.now() - started, model: vectorStore.model }, 'item indexed');
    } catch (err) {
      const message = err.code ? err.message : 'Indexing failed due to an internal error.';
      itemsRepository.markFailed(item.id, message);
      log.error({ err: err.message, ms: Date.now() - started }, 'item indexing failed');
    }
  }

  const enqueueIndex = (item) => jobQueue.enqueue(`index:${item.id}`, () => indexItem(item));

  return {
    async ingest(input, { log = logger } = {}) {
      let record;
      if (input.type === 'note') {
        const content = normalizeText(input.content);
        if (!content) throw Errors.emptyContent('Note is empty after removing whitespace.');
        record = { sourceType: 'note', title: input.title?.trim() || deriveNoteTitle(content), url: null, content };
      } else {
        const page = await fetchUrlContent(input.url, {
          timeoutMs: config.limits.fetchTimeoutMs,
          maxBytes: config.limits.maxFetchBytes,
          maxChars: config.limits.maxStoredUrlChars,
          allowPrivate: config.allowPrivateUrls,
        });
        record = {
          sourceType: 'url',
          title: input.title?.trim() || page.title || new URL(page.finalUrl).hostname,
          url: page.finalUrl,
          content: page.text,
        };
        if (page.truncated) log.warn({ url: page.finalUrl }, 'page text truncated to limit');
      }

      const item = itemsRepository.insert({ id: crypto.randomUUID(), ...record });
      log.info({ itemId: item.id, sourceType: item.sourceType, chars: item.content.length }, 'item saved');
      enqueueIndex(item);
      return item;
    },

    // Called at startup: finish anything a previous process didn't, and re-embed items
    // whose vectors came from a different embedding model.
    resumePending() {
      const items = itemsRepository.listNeedingIndex(vectorStore.model);
      if (items.length) logger.info({ count: items.length }, 're-queueing items for indexing');
      items.forEach(enqueueIndex);
    },

    remove(id, { log = logger } = {}) {
      if (!itemsRepository.remove(id)) throw Errors.notFound('Item');
      vectorStore.removeItem(id);
      log.info({ itemId: id }, 'item deleted');
    },
  };
}
