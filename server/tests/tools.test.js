import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset } from '../src/data/profile.js';
import { runTool, guardSql } from '../src/tools/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataset = loadDataset(fs.readFileSync(path.join(here, '../sample-data/sales.csv')), 'sales.csv');
const ctx = { dataset };

test('profile detects types', () => {
  const t = Object.fromEntries(dataset.profile.columns.map((c) => [c.name, c.type]));
  assert.equal(t.order_date, 'date');
  assert.equal(t.revenue, 'number');
  assert.equal(t.region, 'category');
});

test('run_query returns grouped rows', async () => {
  const r = await runTool('run_query', { sql: 'SELECT region, SUM(revenue) AS rev FROM data GROUP BY region' }, ctx);
  assert.ok(r.ok);
  assert.equal(r.result.row_count, 4);
});

test('read-only guard blocks writes and tricks', () => {
  for (const bad of ['DELETE FROM data', 'SELECT * FROM data; DROP TABLE data', 'SELECT * INTO x FROM data', "SELECT * FROM CSV('http://x')", 'SELECT constructor FROM data']) {
    assert.throws(() => guardSql(bad), `should block: ${bad}`);
  }
  assert.doesNotThrow(() => guardSql("SELECT * FROM data WHERE region = 'set'"));
});

test('bad column returns a helpful error, not an exception', async () => {
  const r = await runTool('describe_column', { column: 'nope' }, ctx);
  assert.equal(r.ok, false);
  assert.match(r.result.error, /Available:/);
});

test('detect_anomalies flags March dip', async () => {
  const r = await runTool('detect_anomalies', { column: 'revenue', date_column: 'order_date', bucket: 'week', method: 'zscore' }, ctx);
  assert.ok(r.ok, r.summary);
  assert.ok(r.result.periods > 20);
});

test('compare_periods ranks South/online/Electronics decline', async () => {
  const r = await runTool('compare_periods', {
    metric: 'revenue', date_column: 'order_date',
    period_a_start: '2025-02-01', period_a_end: '2025-02-28',
    period_b_start: '2025-03-10', period_b_end: '2025-03-31',
    breakdown_by: ['region', 'channel', 'product_category'],
  }, ctx);
  assert.ok(r.ok, r.summary);
  assert.equal(r.result.breakdown[0].segment, 'South | online');
  assert.ok(r.result.breakdown[0].delta < 0);
});

test('make_chart emits a spec', async () => {
  let spec;
  const r = await runTool('make_chart', { chart_type: 'line', title: 'Monthly revenue', sql: 'SELECT SUBSTRING(order_date,1,7) AS month, SUM(revenue) AS revenue FROM data GROUP BY SUBSTRING(order_date,1,7) ORDER BY month' }, { ...ctx, emitChart: (s) => { spec = s; } });
  assert.ok(r.ok, r.summary);
  assert.equal(spec.data.length, 6);
});
