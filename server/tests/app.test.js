import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.VERCEL = '1';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dia-vercel-'));

const { default: app } = await import('../src/app.js');

test('exported app serves health and dataset API routes', async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.ok, true);
    assert.equal(health.embeddings, 'hash');

    const dataset = await (await fetch(`${base}/api/datasets/sample`, { method: 'POST' })).json();
    assert.equal(dataset.name, 'sample-sales.csv');
    const fetched = await (await fetch(`${base}/api/datasets/${dataset.id}`)).json();
    assert.equal(fetched.id, dataset.id);
  } finally {
    server.close();
  }
});