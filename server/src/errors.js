// A single error type that carries an HTTP status and a stable machine-readable code.
// Anything thrown that is NOT an AppError is treated as an unexpected 500.

// `details` is reserved for validation: always an array of { field, message }.
// Other diagnostic context belongs in the logs, not the response.
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const Errors = {
  validation: (details) =>
    new AppError(400, 'VALIDATION_ERROR', 'Request body is invalid.', details),
  notFound: (what) => new AppError(404, 'NOT_FOUND', `${what} not found.`),
  urlFetchFailed: (message) => new AppError(422, 'URL_FETCH_FAILED', message),
  urlNotAllowed: (message) => new AppError(422, 'URL_NOT_ALLOWED', message),
  emptyContent: (message) => new AppError(422, 'EMPTY_CONTENT', message),
  upstream: (message) => new AppError(502, 'UPSTREAM_AI_ERROR', message),
};
