import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { embed } from './embeddings.js';

const FILE = path.join(config.dataDir, 'vectors.json');
let items = [];
let saveTimer;

function load() {
  try {
    items = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    items = [];
  }
}
load();

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(items));
  }, 300);
}

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/** Split text into ~600 character chunks on paragraph boundaries. */
export function chunkText(text, max = 600) {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let cur = '';
  for (const p of paras) {
    if (cur && cur.length + p.length > max) {
      chunks.push(cur);
      cur = p;
    } else {
      cur = cur ? `${cur}\n\n${p}` : p;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export async function addItem({ kind, text, meta = {} }) {
  const vector = await embed(text);
  const item = { id: crypto.randomUUID(), kind, text, meta, vector, createdAt: Date.now() };
  items.push(item);
  scheduleSave();
  return item.id;
}

export async function addKnowledge(source, text) {
  // Re-uploading a document replaces its earlier chunks.
  items = items.filter((i) => !(i.kind === 'knowledge' && i.meta.source === source));
  const chunks = chunkText(text);
  for (const chunk of chunks) await addItem({ kind: 'knowledge', text: chunk, meta: { source } });
  return chunks.length;
}

export async function search(query, { kind, k = 4, minScore = 0.25, filter } = {}) {
  const q = await embed(query);
  return items
    .filter((i) => (!kind || i.kind === kind) && i.vector.length === q.length && (!filter || filter(i)))
    .map((i) => ({ text: i.text, meta: i.meta, kind: i.kind, score: dot(q, i.vector) }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export function listKnowledgeSources() {
  const counts = new Map();
  items.filter((i) => i.kind === 'knowledge').forEach((i) => counts.set(i.meta.source, (counts.get(i.meta.source) || 0) + 1));
  return [...counts.entries()].map(([source, chunks]) => ({ source, chunks }));
}

export function listInvestigations(limit = 20) {
  return items
    .filter((i) => i.kind === 'investigation')
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map((i) => ({ id: i.id, text: i.text, ...i.meta, createdAt: i.createdAt }));
}
