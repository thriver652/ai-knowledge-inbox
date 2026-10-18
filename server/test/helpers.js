import pino from 'pino';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

// Fresh in-memory app per test file. Uses the offline provider so tests are deterministic
// and need no network or API key.
export function buildTestApp({ configOverrides = {}, ai } = {}) {
  const config = loadConfig({ dbPath: ':memory:', aiProvider: 'local', webDistPath: null, ...configOverrides });
  const ctx = createApp({ config, logger: pino({ level: 'silent' }), ...(ai ? { ai } : {}) });
  const api = {
    post: (path, body) => request(ctx.app).post(path).send(body),
    get: (path) => request(ctx.app).get(path),
    delete: (path) => request(ctx.app).delete(path),
    raw: () => request(ctx.app),
  };
  return { ...ctx, api, config };
}
