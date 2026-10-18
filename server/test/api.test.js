import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { buildTestApp } from './helpers.js';

const BACKUP_NOTE =
  'Infrastructure notes.\n\nOur Postgres primary runs on db-01. Database backups run nightly at 02:00 UTC and are written to the S3 bucket acme-backups.\n\nThe Redis cache stores user sessions with a TTL of 24 hours.';
const TEA_NOTE = 'Office preferences: Alice drinks green tea. Bob takes his coffee black with no sugar.';

describe('POST /api/ingest', () => {
  const { api, jobQueue } = buildTestApp();

  it('accepts a note with 202 and indexes it in the background', async () => {
    const res = await api.post('/api/ingest', { type: 'note', content: BACKUP_NOTE });
    assert.equal(res.status, 202);
    assert.equal(res.body.item.sourceType, 'note');
    assert.equal(res.body.item.status, 'pending');
    assert.equal(res.body.item.title, 'Infrastructure notes.');
    assert.match(res.headers.location, /^\/api\/items\/[0-9a-f-]{36}$/);

    await jobQueue.onIdle();
    const detail = await api.get(res.headers.location);
    assert.equal(detail.body.item.status, 'ready');
    assert.ok(detail.body.item.chunkCount >= 1);
    assert.equal(detail.body.item.content, BACKUP_NOTE);
  });

  const invalid = [
    ['missing type', {}, 'body.type'],
    ['unknown type', { type: 'pdf' }, 'body.type'],
    ['missing content', { type: 'note' }, 'body.content'],
    ['blank content', { type: 'note', content: '   ' }, 'body.content'],
    ['non-http url', { type: 'url', url: 'ftp://example.com/file' }, 'body.url'],
    ['malformed url', { type: 'url', url: 'not a url' }, 'body.url'],
    ['unknown field', { type: 'note', content: 'hi', extra: 1 }, 'body'],
  ];
  for (const [name, body, field] of invalid) {
    it(`rejects ${name} with 400 VALIDATION_ERROR`, async () => {
      const res = await api.post('/api/ingest', body);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.ok(res.body.error.details.some((d) => d.field === field), JSON.stringify(res.body.error.details));
      assert.ok(res.body.error.requestId);
    });
  }

  it('rejects malformed JSON with 400 INVALID_JSON', async () => {
    const res = await api.raw().post('/api/ingest').set('content-type', 'application/json').send('{oops');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_JSON');
  });

  it('blocks private-network URLs (SSRF guard) with 422', async () => {
    const res = await api.post('/api/ingest', { type: 'url', url: 'http://169.254.169.254/latest/meta-data' });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'URL_NOT_ALLOWED');
  });
});

describe('URL ingestion', () => {
  let server;
  let base;
  const { api, jobQueue } = buildTestApp({ configOverrides: { allowPrivateUrls: true } });

  before(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/article') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(`<html><head><title>Rate Limits Explained</title><script>var x = 1;</script></head>
          <body><nav>Home | About</nav><article><h1>Rate limits</h1>
          <p>The public API allows 600 requests per minute per API key.</p>
          <p>Exceeding the limit returns HTTP 429 with a Retry-After header.</p></article>
          <footer>Copyright</footer></body></html>`);
      } else if (req.url === '/redirect') {
        res.writeHead(302, { location: '/article' });
        res.end();
      } else if (req.url === '/image') {
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end('png');
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => server.close());

  it('fetches, extracts readable text (dropping nav/script/footer) and follows redirects', async () => {
    const res = await api.post('/api/ingest', { type: 'url', url: `${base}/redirect` });
    assert.equal(res.status, 202);
    assert.equal(res.body.item.title, 'Rate Limits Explained');
    assert.equal(res.body.item.url, `${base}/article`);
    await jobQueue.onIdle();

    const { item } = (await api.get(`/api/items/${res.body.item.id}`)).body;
    assert.match(item.content, /600 requests per minute/);
    assert.doesNotMatch(item.content, /var x|Home \| About|Copyright/);

    const q = await api.post('/api/query', { question: 'How many requests per minute does the API allow?' });
    assert.equal(q.body.sources[0].itemId, item.id);
    assert.equal(q.body.sources[0].url, `${base}/article`);
  });

  it('returns 422 URL_FETCH_FAILED for a 404 page', async () => {
    const res = await api.post('/api/ingest', { type: 'url', url: `${base}/missing` });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'URL_FETCH_FAILED');
    assert.match(res.body.error.message, /404/);
    // `details` is reserved for validation issues; non-validation errors omit it.
    assert.equal(res.body.error.details, undefined);
  });

  it('returns 422 for unsupported content types', async () => {
    const res = await api.post('/api/ingest', { type: 'url', url: `${base}/image` });
    assert.equal(res.status, 422);
    assert.match(res.body.error.message, /content type/i);
  });
});

describe('GET /api/items', () => {
  const { api, jobQueue } = buildTestApp();

  it('lists newest first with previews and pagination', async () => {
    await api.post('/api/ingest', { type: 'note', content: 'first note' });
    await api.post('/api/ingest', { type: 'note', content: 'x'.repeat(1000), title: 'Long one' });
    await jobQueue.onIdle();

    const res = await api.get('/api/items?limit=1');
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 2);
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.items[0].title, 'Long one');
    assert.equal(res.body.items[0].contentLength, 1000);
    assert.ok(res.body.items[0].preview.length < 300);
    assert.equal(res.body.items[0].content, undefined);
  });

  it('validates pagination params', async () => {
    const res = await api.get('/api/items?limit=0');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.details[0].field, 'query.limit');
  });

  it('returns 404 for unknown ids and 400 for malformed ones', async () => {
    assert.equal((await api.get('/api/items/00000000-0000-4000-8000-000000000000')).status, 404);
    assert.equal((await api.get('/api/items/abc')).status, 400);
  });

  it('deletes an item and removes it from search', async () => {
    const { body } = await api.post('/api/ingest', { type: 'note', content: 'Zebras are striped horses of Africa.' });
    await jobQueue.onIdle();
    assert.equal((await api.delete(`/api/items/${body.item.id}`)).status, 204);
    const q = await api.post('/api/query', { question: 'Tell me about zebras' });
    assert.ok(q.body.sources.every((s) => s.itemId !== body.item.id));
  });
});

describe('POST /api/query', () => {
  const { api, jobQueue } = buildTestApp();
  before(async () => {
    await api.post('/api/ingest', { type: 'note', content: BACKUP_NOTE });
    await api.post('/api/ingest', { type: 'note', content: TEA_NOTE });
    await jobQueue.onIdle();
  });

  it('retrieves the relevant item first and returns a cited answer', async () => {
    const res = await api.post('/api/query', { question: 'When do the database backups run?' });
    assert.equal(res.status, 200);
    assert.match(res.body.answer, /02:00 UTC/);
    assert.match(res.body.answer, /\[1\]/);
    const top = res.body.sources[0];
    assert.equal(top.ref, 1);
    assert.equal(top.cited, true);
    assert.equal(top.title, 'Infrastructure notes.');
    assert.match(top.snippet, /backups/);
    assert.ok(top.score > 0 && top.score <= 1);
    assert.equal(res.body.meta.provider, 'local');
  });

  it('respects topK', async () => {
    const res = await api.post('/api/query', { question: 'what does Bob drink with coffee or tea', topK: 1 });
    assert.equal(res.body.sources.length, 1);
    assert.match(res.body.sources[0].snippet, /Bob/);
  });

  it('says it does not know (and skips the LLM) when nothing is relevant', async () => {
    const res = await api.post('/api/query', { question: 'What is the capital of Peru?' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.sources, []);
    assert.match(res.body.answer, /couldn't find/);
  });

  it('validates the question', async () => {
    for (const body of [{}, { question: 'hi' }, { question: 'ok fine', topK: 50 }]) {
      const res = await api.post('/api/query', body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
  });
});

describe('AI provider failures', () => {
  it('marks the item failed (not the request) when embedding fails during indexing', async () => {
    const failing = {
      name: 'stub', embeddingModel: 'stub', chatModel: 'stub',
      embed: async () => { const e = new Error('AI provider request failed (embeddings).'); e.code = 'UPSTREAM_AI_ERROR'; throw e; },
      answer: async () => ({ text: '' }),
    };
    const { api, jobQueue } = buildTestApp({ ai: failing });
    const res = await api.post('/api/ingest', { type: 'note', content: 'some text worth indexing' });
    assert.equal(res.status, 202);
    await jobQueue.onIdle();
    const { item } = (await api.get(`/api/items/${res.body.item.id}`)).body;
    assert.equal(item.status, 'failed');
    assert.match(item.error, /AI provider request failed/);
  });

  it('returns 502 UPSTREAM_AI_ERROR when the query-time call fails', async () => {
    const { Errors } = await import('../src/errors.js');
    const failing = {
      name: 'stub', embeddingModel: 'stub', chatModel: 'stub',
      embed: async () => { throw Errors.upstream('AI provider request failed (embeddings).'); },
      answer: async () => ({ text: '' }),
    };
    const { api } = buildTestApp({ ai: failing });
    const res = await api.post('/api/query', { question: 'anything at all?' });
    assert.equal(res.status, 502);
    assert.equal(res.body.error.code, 'UPSTREAM_AI_ERROR');
  });
});

describe('serving the built frontend', () => {
  it('serves index.html for app routes but never swallows /api 404s', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-dist-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Knowledge Inbox</title>');
    const { api } = buildTestApp({ configOverrides: { webDistPath: dir } });
    const page = await api.get('/some/client/route');
    assert.equal(page.status, 200);
    assert.match(page.text, /Knowledge Inbox/);
    const missing = await api.get('/api/nope');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'ROUTE_NOT_FOUND');
  });
});

describe('misc', () => {
  const { api } = buildTestApp();
  it('404s unknown routes in the standard error shape', async () => {
    const res = await api.get('/api/nope');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'ROUTE_NOT_FOUND');
  });
  it('echoes a caller-supplied request id', async () => {
    const res = await api.raw().get('/api/health').set('x-request-id', 'abc-123');
    assert.equal(res.headers['x-request-id'], 'abc-123');
    assert.equal(res.body.status, 'ok');
  });
});
