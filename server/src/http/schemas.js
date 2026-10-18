import { z } from 'zod';

const requiredString = (field) =>
  z.string({ error: (iss) => (iss.input === undefined ? `${field} is required` : `${field} must be a string`) });

export function buildSchemas(config) {
  const title = requiredString('title').trim().max(300, 'title must be at most 300 characters').optional();

  const noteBody = z.strictObject({
    type: z.literal('note'),
    content: requiredString('content')
      .trim()
      .min(1, 'content must not be empty')
      .max(config.limits.maxNoteChars, `content must be at most ${config.limits.maxNoteChars} characters`),
    title,
  });

  const urlBody = z.strictObject({
    type: z.literal('url'),
    url: requiredString('url')
      .trim()
      .max(2048, 'url must be at most 2048 characters')
      .pipe(z.url({ protocol: /^https?$/, error: 'url must be a valid http(s) URL' })),
    title,
  });

  const ingestBody = z.discriminatedUnion('type', [noteBody, urlBody], {
    error: (iss) => (iss.code === 'invalid_union' ? 'type must be "note" or "url"' : undefined),
  });

  const listItemsQuery = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });

  const queryBody = z.strictObject({
    question: requiredString('question')
      .trim()
      .min(3, 'question must be at least 3 characters')
      .max(config.limits.maxQuestionChars, `question must be at most ${config.limits.maxQuestionChars} characters`),
    topK: z.number().int().min(1).max(config.retrieval.maxTopK).optional(),
  });

  const idParam = z.object({ id: z.uuid('id must be a UUID') });

  return { ingestBody, listItemsQuery, queryBody, idParam };
}
