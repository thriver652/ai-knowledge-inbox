// Central place for every tunable. Read once at startup; nothing else touches process.env.

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) throw new Error(`Config ${name} must be an integer, got "${raw}"`);
  return n;
}

function float(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseFloat(raw);
  if (Number.isNaN(n)) throw new Error(`Config ${name} must be a number, got "${raw}"`);
  return n;
}

export function loadConfig(overrides = {}) {
  const openaiKey = process.env.OPENAI_API_KEY || '';
  const base = {
    env: process.env.NODE_ENV || 'development',
    port: int('PORT', 3001),
    logLevel: process.env.LOG_LEVEL || 'info',
    dbPath: process.env.DB_PATH || './data/inbox.db',
    // Built frontend to serve in production (`npm start` at the repo root builds it).
    webDistPath: process.env.WEB_DIST_PATH ?? '../web/dist',

    // AI provider: "openai" when a key is present, otherwise the offline "local" provider
    // so the app is fully runnable (and testable) without network or credentials.
    aiProvider: process.env.AI_PROVIDER || (openaiKey ? 'openai' : 'local'),
    openai: {
      apiKey: openaiKey,
      // Any OpenAI-compatible endpoint works (Azure, Ollama, LM Studio, vLLM...).
      baseURL: process.env.OPENAI_BASE_URL || undefined,
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      chatModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
      timeoutMs: int('OPENAI_TIMEOUT_MS', 30_000),
      // Output budget for answers. Reasoning ("thinking") models spend part of it before
      // answering, so keep headroom.
      maxTokens: int('OPENAI_MAX_TOKENS', 2_000),
      // Optional: e.g. "none"/"low" to cap thinking on reasoning models (Gemini 2.5, o-series).
      reasoningEffort: process.env.OPENAI_REASONING_EFFORT || undefined,
    },

    chunking: {
      targetChars: int('CHUNK_TARGET_CHARS', 800),
      overlapChars: int('CHUNK_OVERLAP_CHARS', 150),
    },

    retrieval: {
      defaultTopK: int('RETRIEVAL_TOP_K', 5),
      maxTopK: 10,
      // Below this cosine similarity a chunk is treated as irrelevant.
      minScore: float('RETRIEVAL_MIN_SCORE', 0.2),
    },

    limits: {
      maxNoteChars: int('MAX_NOTE_CHARS', 50_000),
      maxQuestionChars: 1_000,
      maxFetchBytes: int('MAX_FETCH_BYTES', 2_000_000),
      fetchTimeoutMs: int('FETCH_TIMEOUT_MS', 10_000),
      maxStoredUrlChars: int('MAX_URL_TEXT_CHARS', 200_000),
    },

    // SSRF guard: block fetching private/loopback addresses unless explicitly allowed (tests).
    allowPrivateUrls: process.env.ALLOW_PRIVATE_URLS === 'true',
  };
  return deepMerge(base, overrides);
}

function deepMerge(target, source) {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      target[k] = deepMerge({ ...(target[k] || {}) }, v);
    } else {
      target[k] = v;
    }
  }
  return target;
}
