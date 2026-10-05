import { config } from '../config.js';

const DIM = 384;
let extractor; // Transformers.js pipeline, or false if unavailable
let warned = false;

function hashEmbed(text) {
  const vec = new Float32Array(DIM);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  const grams = [...tokens, ...tokens.slice(1).map((t, i) => `${tokens[i]}_${t}`)];
  for (const g of grams) {
    let h = 2166136261;
    for (let i = 0; i < g.length; i++) {
      h ^= g.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    vec[Math.abs(h) % DIM] += h & 1 ? 1 : -1;
  }
  return normalize(vec);
}

function normalize(vec) {
  let n = 0;
  for (const x of vec) n += x * x;
  n = Math.sqrt(n) || 1;
  return Array.from(vec, (x) => x / n);
}

async function loadExtractor() {
  if (extractor !== undefined) return extractor;
  try {
    const { pipeline } = await import('@huggingface/transformers');
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  } catch (err) {
    extractor = false;
    if (!warned) {
      warned = true;
      console.warn(`[embeddings] Transformers.js unavailable (${err.message}). Using hashed embeddings instead.`);
    }
  }
  return extractor;
}

/** Returns a unit-length embedding for the text. */
export async function embed(text) {
  if (config.embeddingsProvider === 'transformers') {
    const ex = await loadExtractor();
    if (ex) {
      const out = await ex(text, { pooling: 'mean', normalize: true });
      return Array.from(out.data);
    }
  }
  return hashEmbed(text);
}
