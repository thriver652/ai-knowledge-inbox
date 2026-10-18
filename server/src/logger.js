import pino from 'pino';

// Structured JSON logs in production; pretty-printed in a dev terminal.
export function createLogger({ logLevel, env }) {
  const pretty = env === 'development' && process.stdout.isTTY;
  return pino({
    level: logLevel,
    base: { service: 'knowledge-inbox' },
    redact: ['req.headers.authorization', 'openai.apiKey'],
    ...(pretty ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
  });
}
