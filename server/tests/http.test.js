import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dia-http-'));
process.env.EMBEDDINGS_PROVIDER = 'hash';

const express = (await import('express')).default;
const { createInvestigateRouter } = await import('../src/routes/investigate.js');
const { datasetsRouter } = await import('../src/routes/datasets.js');

function fakeLLM() {
  let n = 0;
  return {
    async chat(p) {
      const sys = p.messages[0].content;
      const json = (o) => ({ choices: [{ message: { content: JSON.stringify(o) } }] });
      if (p.response_format) {
        if (sys.includes('planning stage')) return json({ restated_question: 'q', hypotheses: [{ id: 'H1', statement: 's', test: 't' }], steps: ['a'] });
        if (sys.includes('final report')) return json({ headline: 'Done', summary: 'ok', findings: [], overall_confidence: 0.7 });
        return json({ verdict: 'approve', issues: [] });
      }
      if (n++ === 0) return { choices: [{ message: { content: '', tool_calls: [{ id: 't1', type: 'function', function: { name: 'describe_column', arguments: '{"column":"revenue"}' } }] } }] };
      return { choices: [{ message: { content: 'Ready.' } }] };
    },
  };
}

test('POST /api/investigate streams SSE events ending in done', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/datasets', datasetsRouter);
  app.use('/api', createInvestigateRouter(() => fakeLLM()));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const ds = await (await fetch(`${base}/api/datasets/sample`, { method: 'POST' })).json();
    const res = await fetch(`${base}/api/investigate`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ datasetId: ds.id, question: 'Why did revenue drop?' }),
    });
    assert.equal(res.headers.get('content-type'), 'text/event-stream');
    const text = await res.text();
    const events = text.split('\n\n').filter((b) => b.startsWith('data: ')).map((b) => JSON.parse(b.slice(6)));
    const types = events.map((e) => e.type);
    assert.ok(types.includes('plan') && types.includes('step') && types.includes('report'));
    assert.equal(types.at(-1), 'done');
  } finally {
    server.close();
  }
});

test('missing dataset returns 404 JSON', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', createInvestigateRouter(() => fakeLLM()));
  const server = app.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/investigate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ datasetId: 'nope', question: 'hello there' }) });
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test('model_not_found explains how to configure an available Groq model', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/datasets', datasetsRouter);
  app.use('/api', createInvestigateRouter(() => ({
    async chat() {
      throw Object.assign(new Error('model not found'), {
        status: 404,
        error: { error: { code: 'model_not_found' } },
      });
    },
  })));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const ds = await (await fetch(`${base}/api/datasets/sample`, { method: 'POST' })).json();
    const res = await fetch(`${base}/api/investigate`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ datasetId: ds.id, question: 'Why did revenue drop?' }),
    });
    const text = await res.text();
    assert.match(text, /Set GROQ_MODEL in server\/\.env/);
    assert.match(text, /available in your Groq console/);
  } finally {
    server.close();
  }
});
