import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { loadDataset, publicDataset } from '../data/profile.js';
import { getDataset, saveDataset } from '../data/store.js';
import * as vectors from '../rag/vectorStore.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes } });
export const datasetsRouter = Router();

datasetsRouter.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Attach a CSV or JSON file in the "file" field.' });
  if (!/\.(csv|tsv|json)$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Only .csv and .json files are supported.' });
  try {
    const ds = saveDataset(loadDataset(req.file.buffer, req.file.originalname));
    res.json(publicDataset(ds));
  } catch (err) {
    res.status(400).json({ error: `Could not read the file: ${err.message}` });
  }
});

// Loads the bundled demo data plus its business notes so RAG has something to find.
datasetsRouter.post('/sample', async (_req, res, next) => {
  try {
    const ds = saveDataset(loadDataset(fs.readFileSync(path.join(config.sampleDir, 'sales.csv')), 'sample-sales.csv'));
    const notes = 'sample-business-notes.md';
    if (!vectors.listKnowledgeSources().some((s) => s.source === notes)) {
      await vectors.addKnowledge(notes, fs.readFileSync(path.join(config.sampleDir, 'business-notes.md'), 'utf8'));
    }
    res.json(publicDataset(ds));
  } catch (err) {
    next(err);
  }
});

datasetsRouter.get('/:id', (req, res) => {
  const ds = getDataset(req.params.id);
  if (!ds) return res.status(404).json({ error: 'Dataset not found. It may have expired after a server restart; upload it again.' });
  res.json(publicDataset(ds));
});
