import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { pinoHttp } from 'pino-http';
import { createAIProvider } from './ai/index.js';
import { createChunksRepository } from './db/chunksRepository.js';
import { openDatabase } from './db/database.js';
import { createItemsRepository } from './db/itemsRepository.js';
import { errorHandler, notFoundHandler } from './http/errorHandler.js';
import { createRouter } from './http/routes.js';
import { buildSchemas } from './http/schemas.js';
import { createJobQueue } from './ingest/jobQueue.js';
import { createVectorStore } from './rag/vectorStore.js';
import { createIngestService } from './services/ingestService.js';
import { createQueryService } from './services/queryService.js';

// Composition root: the only place that knows how the pieces fit together.
// Tests call this with an in-memory DB and a stub/local AI provider.
export function createApp({ config, logger, ai = createAIProvider(config, logger) }) {
  const db = openDatabase(config.dbPath);
  const itemsRepository = createItemsRepository(db);
  const chunksRepository = createChunksRepository(db);
  const vectorStore = createVectorStore({ chunksRepository, model: ai.embeddingModel });
  const jobQueue = createJobQueue({ concurrency: 2, logger });

  const deps = { config, logger, ai, db, itemsRepository, vectorStore, jobQueue };
  const ingestService = createIngestService(deps);
  const queryService = createQueryService(deps);

  const app = express();
  app.disable('x-powered-by');
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = req.headers['x-request-id'] || crypto.randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      serializers: { req: (r) => ({ id: r.id, method: r.method, url: r.url }), res: (r) => ({ statusCode: r.statusCode }) },
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(
    '/api',
    createRouter({
      schemas: buildSchemas(config),
      ingestService,
      queryService,
      itemsRepository,
      vectorStore,
      jobQueue,
      ai,
    }),
  );
  // Production: serve the built React app from the same origin (one port, no CORS).
  const webDist = config.webDistPath && path.resolve(config.webDistPath);
  if (webDist && fs.existsSync(path.join(webDist, 'index.html'))) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api(\/|$)).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
    logger.info({ webDist }, 'serving built frontend');
  }
  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.info(
    { provider: ai.name, embeddingModel: ai.embeddingModel, chatModel: ai.chatModel, indexedChunks: vectorStore.size() },
    'app initialised',
  );

  return { app, db, jobQueue, ingestService };
}
