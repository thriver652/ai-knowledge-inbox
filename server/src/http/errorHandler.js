import { AppError } from '../errors.js';

// Every error leaves the API in one shape:
//   { "error": { "code", "message", "details"?, "requestId" } }
// Clients branch on `code`; humans read `message`; `requestId` ties a report to the logs.

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.path}.`));
}

export function errorHandler(err, req, res, _next) {
  let appErr = err;
  if (err?.type === 'entity.parse.failed') {
    appErr = new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
  } else if (err?.type === 'entity.too.large') {
    appErr = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  } else if (!(err instanceof AppError)) {
    appErr = new AppError(500, 'INTERNAL_ERROR', 'Something went wrong on our side.');
  }

  const level = appErr.status >= 500 ? 'error' : 'warn';
  req.log[level](
    { code: appErr.code, status: appErr.status, ...(appErr === err ? {} : { err }) },
    appErr.message,
  );

  if (appErr.retryAfterS) res.setHeader('retry-after', String(appErr.retryAfterS));
  res.status(appErr.status).json({
    error: {
      code: appErr.code,
      message: appErr.message,
      ...(appErr.details ? { details: appErr.details } : {}),
      requestId: req.id,
    },
  });
}
