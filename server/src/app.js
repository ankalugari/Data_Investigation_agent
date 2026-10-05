import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { datasetsRouter } from './routes/datasets.js';
import { investigateRouter } from './routes/investigate.js';
import { knowledgeRouter } from './routes/knowledge.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, model: config.model, groqKeyConfigured: Boolean(config.groqApiKey), embeddings: config.embeddingsProvider }));
app.use('/api/datasets', datasetsRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api', investigateRouter);

// Keep local production mode self-contained; Vercel serves client/dist separately.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api') ? res.sendFile(path.join(dist, 'index.html')) : next()));
}

app.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `File is too large (${Math.floor(config.maxUploadBytes / 1024 / 1024)} MB max).` });
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

export default app;