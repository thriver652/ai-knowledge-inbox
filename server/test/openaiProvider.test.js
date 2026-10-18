import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import pino from 'pino';
import { createOpenAIProvider } from '../src/ai/openaiProvider.js';
import { buildTestApp } from './helpers.js';

// A fake OpenAI-compatible server: deterministic "embeddings" (bag of known words) and a
// chat endpoint that records the prompt and answers with a citation.
const VOCAB = ['backup', 'postgres', 'nightly', 'tea', 'coffee', 'alice', 'bob', 'database'];
const fakeEmbed = (text) => VOCAB.map((w) => (text.toLowerCase().includes(w) ? 1 : 0)).concat([0.01]);

function startFakeOpenAI({ failChat = false } = {}) {
  const calls = { embeddings: [], chat: [] };
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || '{}');
    res.setHeader('content-type', 'application/json');
    if (req.url.endsWith('/embeddings')) {
      calls.embeddings.push(body);
      const inputs = Array.isArray(body.input) ? body.input : [body.input];
      // Return out of order to prove the provider sorts by index.
      const data = inputs.map((t, index) => ({ object: 'embedding', index, embedding: fakeEmbed(t) })).reverse();
      res.end(JSON.stringify({ object: 'list', data, model: body.model }));
    } else if (req.url.endsWith('/chat/completions')) {
      calls.chat.push(body);
      if (failChat) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: { message: 'boom' } }));
      }
      res.end(JSON.stringify({
        id: 'x', object: 'chat.completion', model: body.model,
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'Backups run nightly at 02:00 UTC [1].' } }],
        usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
      }));
    } else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ server, calls, baseURL: `http://127.0.0.1:${server.address().port}/v1` })),
  );
}

describe('OpenAI provider (against a fake OpenAI-compatible server)', () => {
  let fake;
  before(async () => { fake = await startFakeOpenAI(); });
  after(() => fake.server.close());

  it('runs the full ingest -> retrieve -> answer pipeline with citations', async () => {
    const ai = createOpenAIProvider(
      { apiKey: 'test', baseURL: fake.baseURL, embeddingModel: 'emb-test', chatModel: 'chat-test', timeoutMs: 5000 },
      pino({ level: 'silent' }),
    );
    const { api, jobQueue } = buildTestApp({ ai });
    await api.post('/api/ingest', { type: 'note', title: 'DB ops', content: 'Postgres backup runs nightly at 02:00 UTC.' });
    await api.post('/api/ingest', { type: 'note', content: 'Alice likes tea, Bob likes coffee.' });
    await jobQueue.onIdle();

    const res = await api.post('/api/query', { question: 'When does the database backup run?' });
    assert.equal(res.status, 200);
    assert.equal(res.body.answer, 'Backups run nightly at 02:00 UTC [1].');
    assert.equal(res.body.sources[0].title, 'DB ops');
    assert.equal(res.body.sources[0].cited, true);
    assert.equal(res.body.meta.chatModel, 'chat-test');
    assert.equal(res.body.meta.usage.total_tokens, 110);

    // Title is prepended to the chunk before embedding (contextual header).
    assert.ok(fake.calls.embeddings.some((c) => c.input[0]?.startsWith('DB ops\n\n')));
    // The prompt carries numbered sources, the question, and the grounding rules.
    const chat = fake.calls.chat.at(-1);
    assert.equal(chat.model, 'chat-test');
    assert.match(chat.messages[0].content, /ONLY the user's saved notes/);
    assert.match(chat.messages[1].content, /\[1\] "DB ops"/);
    assert.match(chat.messages[1].content, /Question: When does the database backup run\?/);
  });

  it('maps an upstream failure to 502 UPSTREAM_AI_ERROR', async () => {
    const failing = await startFakeOpenAI({ failChat: true });
    try {
      const ai = createOpenAIProvider(
        { apiKey: 'test', baseURL: failing.baseURL, embeddingModel: 'e', chatModel: 'c', timeoutMs: 5000, maxRetries: 0 },
        pino({ level: 'silent' }),
      );
      const { api, jobQueue } = buildTestApp({ ai });
      await api.post('/api/ingest', { type: 'note', content: 'Postgres backup runs nightly.' });
      await jobQueue.onIdle();
      const res = await api.post('/api/query', { question: 'when is the backup?' });
      assert.equal(res.status, 502);
      assert.equal(res.body.error.code, 'UPSTREAM_AI_ERROR');
      assert.match(res.body.error.message, /chat/);
    } finally {
      failing.server.close();
    }
  });
});
