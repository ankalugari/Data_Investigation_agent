import Groq from 'groq-sdk';
import { config } from './config.js';

let client;

/**
 * Thin wrapper so the agent only depends on `llm.chat(params)`.
 * Tests inject a fake with the same shape.
 */
export function getLLM() {
  if (!config.groqApiKey) {
    const err = new Error('GROQ_API_KEY is missing. Add it to server/.env and restart the server.');
    err.status = 500;
    throw err;
  }
  client ??= new Groq({ apiKey: config.groqApiKey });
  return {
    chat: (params) => client.chat.completions.create({ model: config.model, ...params }),
  };
}
