import { Router } from 'express';
import { runInvestigation } from '../agent/agent.js';
import { getDataset } from '../data/store.js';
import { getLLM } from '../groq.js';
import * as vectors from '../rag/vectorStore.js';

function friendlyError(err) {
  if (err.cancelled) return 'Investigation cancelled.';
  if (err.status === 401) return 'Groq rejected the API key. Check GROQ_API_KEY in server/.env.';
  if (err.status === 429) return 'Groq rate limit reached. Wait a minute, then run the investigation again.';
  if (err.status === 404 && err.error?.error?.code === 'model_not_found') {
    return 'The configured Groq model is unavailable to this account. Set GROQ_MODEL in server/.env to a model available in your Groq console, then restart the server.';
  }
  return err.message || 'Something went wrong during the investigation.';
}

/** `resolveLLM` is injectable so tests can supply a fake model. */
export function createInvestigateRouter(resolveLLM = getLLM) {
  const router = Router();

  // Server-sent events over POST so the question can travel in the body.
  router.post('/investigate', async (req, res) => {
    const { datasetId, question, history } = req.body || {};
    const dataset = getDataset(datasetId);
    if (!dataset) return res.status(404).json({ error: 'Dataset not found. Upload it again.' });
    if (typeof question !== 'string' || question.trim().length < 3) {
      return res.status(400).json({ error: 'Ask a question of at least a few words.' });
    }

    let llm;
    try {
      llm = resolveLLM();
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const ac = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ac.abort(); });
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
    const emit = (type, payload = {}) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
    };

    try {
      const safeHistory = Array.isArray(history)
        ? history.slice(-3).map((h) => ({ question: String(h.question || '').slice(0, 300), headline: String(h.headline || '').slice(0, 300) }))
        : [];
      await runInvestigation({ llm, dataset, question: question.trim().slice(0, 500), history: safeHistory, emit, signal: ac.signal });
    } catch (err) {
      if (!err.cancelled) console.error('[investigate]', err);
      emit('error', { message: friendlyError(err) });
    } finally {
      clearInterval(heartbeat);
      emit('done');
      res.end();
    }
  });

  router.get('/history', (_req, res) => res.json({ investigations: vectors.listInvestigations() }));
  return router;
}

export const investigateRouter = createInvestigateRouter();
