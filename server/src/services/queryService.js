import { extractCitations } from '../rag/prompt.js';

const NO_MATCH_ANSWER =
  "I couldn't find anything in your saved content that's relevant to this question.";

export function createQueryService({ config, itemsRepository, vectorStore, ai, logger }) {
  return {
    async query({ question, topK = config.retrieval.defaultTopK }, { log = logger } = {}) {
      const started = Date.now();
      const timings = {};

      const [queryEmbedding] = await ai.embed([question]);
      timings.embedMs = Date.now() - started;

      const t1 = Date.now();
      const hits = vectorStore.search(queryEmbedding, { topK, minScore: config.retrieval.minScore });
      timings.searchMs = Date.now() - t1;

      const meta = {
        provider: ai.name,
        embeddingModel: ai.embeddingModel,
        chatModel: ai.chatModel,
        retrieved: hits.length,
        indexedChunks: vectorStore.size(),
      };

      // Nothing relevant: say so without spending an LLM call (and without hallucinating).
      if (hits.length === 0) {
        log.info({ ...timings, retrieved: 0 }, 'query answered: no relevant chunks');
        return { answer: NO_MATCH_ANSWER, sources: [], meta: { ...meta, ...timings, totalMs: Date.now() - started } };
      }

      const items = itemsRepository.getMany([...new Set(hits.map((h) => h.chunk.itemId))]);
      const sources = hits
        .filter((h) => items.has(h.chunk.itemId)) // item deleted mid-query
        .map((h, i) => {
          const item = items.get(h.chunk.itemId);
          return {
            ref: i + 1,
            itemId: item.id,
            chunkId: h.chunk.id,
            title: item.title,
            sourceType: item.sourceType,
            url: item.url,
            text: h.chunk.text,
            score: Number(h.score.toFixed(4)),
          };
        });

      const t2 = Date.now();
      const { text, usage } = await ai.answer({ question, sources });
      timings.llmMs = Date.now() - t2;

      const cited = new Set(extractCitations(text, sources.length));
      const result = {
        answer: text || NO_MATCH_ANSWER,
        sources: sources.map(({ text: snippet, ...s }) => ({ ...s, snippet, cited: cited.has(s.ref) })),
        meta: { ...meta, ...timings, totalMs: Date.now() - started, usage },
      };
      log.info(
        { ...timings, totalMs: result.meta.totalMs, retrieved: sources.length, cited: cited.size, topScore: sources[0]?.score },
        'query answered',
      );
      return result;
    },
  };
}
