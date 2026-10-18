import { Router } from 'express';
import { Errors } from '../errors.js';
import { validate } from './validate.js';

const PREVIEW_CHARS = 280;

// List view: never ship whole page bodies just to render a list.
const toSummary = ({ content, ...item }) => ({
  ...item,
  preview: content.length > PREVIEW_CHARS ? `${content.slice(0, PREVIEW_CHARS)}…` : content,
  contentLength: content.length,
});

// Express 5 forwards rejected promises to the error handler, so handlers can just be async.
export function createRouter({ schemas, ingestService, queryService, itemsRepository, vectorStore, jobQueue, ai }) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', provider: ai.name, indexedChunks: vectorStore.size(), jobs: jobQueue.stats() });
  });

  router.post('/ingest', validate({ body: schemas.ingestBody }), async (req, res) => {
    const item = await ingestService.ingest(req.valid.body, { log: req.log });
    // 202: stored, but chunking/embedding continues in the background.
    res.status(202).location(`/api/items/${item.id}`).json({ item: toSummary(item) });
  });

  router.get('/items', validate({ query: schemas.listItemsQuery }), (req, res) => {
    const { limit, offset } = req.valid.query;
    const { items, total } = itemsRepository.list({ limit, offset });
    res.json({ items: items.map(toSummary), total, limit, offset });
  });

  router.get('/items/:id', validate({ params: schemas.idParam }), (req, res) => {
    const item = itemsRepository.get(req.valid.params.id);
    if (!item) throw Errors.notFound('Item');
    res.json({ item });
  });

  router.delete('/items/:id', validate({ params: schemas.idParam }), (req, res) => {
    ingestService.remove(req.valid.params.id, { log: req.log });
    res.status(204).end();
  });

  router.post('/query', validate({ body: schemas.queryBody }), async (req, res) => {
    res.json(await queryService.query(req.valid.body, { log: req.log }));
  });

  return router;
}
