import OpenAI from 'openai';
import { Errors } from '../errors.js';
import { SYSTEM_PROMPT, buildUserPrompt } from '../rag/prompt.js';

const DEFAULT_RATE_LIMIT_WAIT_S = 30;
const MAX_RATE_LIMIT_WAIT_S = 65;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// How long the provider asked us to wait: Retry-After header, else "retry in 22.3s" in the
// message (Gemini), else a default. Capped so a bad hint can't stall a job for hours.
export function retryDelaySeconds(err) {
  const header = Number(err?.headers?.get?.('retry-after') ?? err?.headers?.['retry-after']);
  const fromMessage = Number(/retry in ([\d.]+)\s*s/i.exec(err?.message ?? '')?.[1]);
  const s = [header, fromMessage].find((n) => Number.isFinite(n) && n > 0) ?? DEFAULT_RATE_LIMIT_WAIT_S;
  return Math.min(Math.ceil(s), MAX_RATE_LIMIT_WAIT_S);
}

export function createOpenAIProvider(
  {
    apiKey, baseURL, embeddingModel, chatModel, timeoutMs,
    maxTokens = 2_000, reasoningEffort, maxRetries = 2,
    embedBatchSize = 96, maxRateLimitWaits = 5,
  },
  logger,
  { sleep = defaultSleep } = {},
) {
  // The SDK retries 5xx and short 429s with backoff (maxRetries). Quota-style 429s that ask
  // for a long wait are handled below, only for background work.
  const client = new OpenAI({ apiKey, baseURL, timeout: timeoutMs, maxRetries });

  // patient: background jobs (indexing) wait out provider rate limits instead of failing.
  // Interactive requests (a user's question) fail fast with a clear 503 instead.
  const call = async (op, fn, { patient = false } = {}) => {
    for (let attempt = 0; ; attempt++) {
      const started = Date.now();
      try {
        const result = await fn();
        logger.debug({ op, ms: Date.now() - started }, 'openai call ok');
        return result;
      } catch (err) {
        const rateLimited = err.status === 429;
        if (rateLimited && patient && attempt < maxRateLimitWaits) {
          const waitS = retryDelaySeconds(err);
          logger.warn({ op, attempt: attempt + 1, waitS }, 'AI provider rate limit hit; waiting before retry');
          await sleep(waitS * 1000);
          continue;
        }
        logger.error({ op, ms: Date.now() - started, status: err.status, err: err.message }, 'openai call failed');
        if (rateLimited) throw Errors.rateLimited(op, retryDelaySeconds(err));
        throw Errors.upstream(`AI provider request failed (${op}).`);
      }
    }
  };

  return {
    name: 'openai',
    embeddingModel,
    chatModel,

    async embed(texts, { patient = false } = {}) {
      const out = [];
      for (let i = 0; i < texts.length; i += embedBatchSize) {
        const batch = texts.slice(i, i + embedBatchSize);
        const res = await call(
          'embeddings',
          () => client.embeddings.create({ model: embeddingModel, input: batch }),
          { patient },
        );
        // API returns items with an index; sort defensively before appending.
        res.data.sort((a, b) => a.index - b.index).forEach((d) => out.push(d.embedding));
      }
      return out;
    },

    async answer({ question, sources }) {
      const res = await call('chat', () =>
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
