import OpenAI from 'openai';
import { Errors } from '../errors.js';
import { SYSTEM_PROMPT, buildUserPrompt } from '../rag/prompt.js';

const EMBED_BATCH = 96;

export function createOpenAIProvider(
  { apiKey, baseURL, embeddingModel, chatModel, timeoutMs, maxTokens = 2_000, reasoningEffort, maxRetries = 2 },
  logger,
) {
  // The SDK retries 429/5xx with backoff (maxRetries), so we don't hand-roll that here.
  const client = new OpenAI({ apiKey, baseURL, timeout: timeoutMs, maxRetries });

  const wrap = async (op, fn) => {
    const started = Date.now();
    try {
      const result = await fn();
      logger.debug({ op, ms: Date.now() - started }, 'openai call ok');
      return result;
    } catch (err) {
      logger.error({ op, ms: Date.now() - started, status: err.status, err: err.message }, 'openai call failed');
      throw Errors.upstream(`AI provider request failed (${op}).`);
    }
  };

  return {
    name: 'openai',
    embeddingModel,
    chatModel,

    async embed(texts) {
      const out = [];
      for (let i = 0; i < texts.length; i += EMBED_BATCH) {
        const batch = texts.slice(i, i + EMBED_BATCH);
        const res = await wrap('embeddings', () =>
          client.embeddings.create({ model: embeddingModel, input: batch }),
        );
        // API returns items with an index; sort defensively before appending.
        res.data.sort((a, b) => a.index - b.index).forEach((d) => out.push(d.embedding));
      }
      return out;
    },

    async answer({ question, sources }) {
      const res = await wrap('chat', () =>
        client.chat.completions.create({
          model: chatModel,
          temperature: 0.1,
          max_tokens: maxTokens,
          ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(question, sources) },
          ],
        }),
      );
      const choice = res.choices[0];
      if (choice?.finish_reason === 'length') {
        logger.warn({ maxTokens, usage: res.usage }, 'answer truncated by max_tokens; raise OPENAI_MAX_TOKENS');
      }
      return {
        text: choice?.message?.content?.trim() || '',
        usage: res.usage ?? null,
      };
    },
  };
}
