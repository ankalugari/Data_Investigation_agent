import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT) || 3001,
  groqApiKey: process.env.GROQ_API_KEY || '',
  model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  maxSteps: Number(process.env.MAX_AGENT_STEPS) || 10,
  extraStepsOnRevise: 4,
  // "transformers" = local MiniLM embeddings via Transformers.js (falls back to "hash" if unavailable)
  // "hash"         = zero-download hashed bag-of-words embeddings (lower quality, always works)
  embeddingsProvider: process.env.EMBEDDINGS_PROVIDER || (process.env.VERCEL ? 'hash' : 'transformers'),
  dataDir: process.env.DATA_DIR || (process.env.VERCEL ? '/tmp/data-investigation-agent' : path.resolve(here, '..', '.data')),
  sampleDir: path.resolve(here, '..', 'sample-data'),
  maxUploadBytes: process.env.VERCEL ? 4 * 1024 * 1024 : 25 * 1024 * 1024,
  maxRows: 200_000,
  maxQueryRows: 50,
  maxToolChars: 3500,
};
