import { Router } from 'express';
import multer from 'multer';
import * as vectors from '../rag/vectorStore.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
export const knowledgeRouter = Router();

knowledgeRouter.get('/', (_req, res) => res.json({ sources: vectors.listKnowledgeSources() }));

// Accepts a .md/.txt upload (field "file") or JSON { title, text }.
knowledgeRouter.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const source = req.file?.originalname || String(req.body?.title || 'pasted-notes').slice(0, 80);
    const text = req.file ? req.file.buffer.toString('utf8') : String(req.body?.text || '');
    if (!text.trim()) return res.status(400).json({ error: 'Provide a .md/.txt file or some text.' });
    const chunks = await vectors.addKnowledge(source, text);
    res.json({ source, chunks });
  } catch (err) {
    next(err);
  }
});
