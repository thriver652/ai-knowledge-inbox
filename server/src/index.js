import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';

// Optional .env; real environment variables take precedence over it.
try {
  process.loadEnvFile('.env');
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

const config = loadConfig();
const logger = createLogger(config);

const { app, db, jobQueue, ingestService } = createApp({ config, logger });
ingestService.resumePending();

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, `API listening on http://localhost:${config.port}/api`);
});

// Graceful shutdown: stop accepting requests, let in-flight indexing finish, close the DB.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  server.close();
  await Promise.race([jobQueue.onIdle(), new Promise((r) => setTimeout(r, 10_000))]);
  db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
