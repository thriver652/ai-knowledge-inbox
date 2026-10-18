import { createLocalProvider } from './localProvider.js';
import { createOpenAIProvider } from './openaiProvider.js';

// Provider contract:
//   name, embeddingModel, chatModel
//   embed(texts: string[]) => Promise<number[][]>
//   answer({ question, sources }) => Promise<{ text, usage }>
export function createAIProvider(config, logger) {
  switch (config.aiProvider) {
    case 'openai':
      if (!config.openai.apiKey) throw new Error('AI_PROVIDER=openai requires OPENAI_API_KEY');
      return createOpenAIProvider(config.openai, logger);
    case 'local':
      return createLocalProvider();
    default:
      throw new Error(`Unknown AI_PROVIDER "${config.aiProvider}" (expected "openai" or "local")`);
  }
}
