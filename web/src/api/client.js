// Thin fetch wrapper. Every failure becomes an ApiError with the server's error code,
// message, field details and requestId (handy to quote when grepping server logs).

export class ApiError extends Error {
  constructor({ status, code, message, details, requestId }) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = Array.isArray(details) ? details : [];
    this.requestId = requestId;
  }

  // { "body.content": "content must not be empty" } -> { content: "..." }
  fieldErrors() {
    return Object.fromEntries(
      this.details.map((d) => [d.field.replace(/^(body|query|params)\.?/, ''), d.message]),
    );
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      signal,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Could not reach the server. Is the API running?' });
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError({
      status: res.status,
      code: data?.error?.code ?? 'HTTP_ERROR',
      message: data?.error?.message ?? `Request failed with HTTP ${res.status}.`,
      details: data?.error?.details,
      requestId: data?.error?.requestId ?? res.headers.get('x-request-id'),
    });
  }
  return data;
}

export const api = {
  listItems: ({ signal } = {}) => request('/items?limit=100', { signal }),
  ingest: (payload) => request('/ingest', { method: 'POST', body: payload }),
  deleteItem: (id) => request(`/items/${id}`, { method: 'DELETE' }),
  query: (payload, { signal } = {}) => request('/query', { method: 'POST', body: payload, signal }),
};
