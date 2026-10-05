import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dia-'));
process.env.EMBEDDINGS_PROVIDER = 'hash';

const here = path.dirname(fileURLToPath(import.meta.url));
const { loadDataset } = await import('../src/data/profile.js');
const { runInvestigation } = await import('../src/agent/agent.js');
const vectors = await import('../src/rag/vectorStore.js');

const dataset = loadDataset(fs.readFileSync(path.join(here, '../sample-data/sales.csv')), 'sales.csv');

const toolCall = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });

/** Scripted stand-in for Groq: planner, tool loop, reporter and critic. */
function fakeLLM({ criticVerdicts }) {
  const toolScript = [
    toolCall('c1', 'compare_periods', {
      metric: 'revenue', date_column: 'order_date',
      period_a_start: '2025-02-01', period_a_end: '2025-02-28',
      period_b_start: '2025-03-10', period_b_end: '2025-03-31',
      breakdown_by: ['region', 'channel'],
    }),
    toolCall('c2', 'search_knowledge', { query: 'south region online checkout March' }),
    toolCall('c3', 'make_chart', { chart_type: 'line', title: 'Monthly revenue', sql: 'SELECT SUBSTRING(order_date,1,7) AS month, SUM(revenue) AS revenue FROM data GROUP BY SUBSTRING(order_date,1,7) ORDER BY month' }),
    toolCall('c4', 'run_query', { sql: 'DROP TABLE data' }), // must be refused, not crash
  ];
  let toolIdx = 0;
  let critiques = 0;
  const calls = { planner: 0, reporter: 0, critic: 0, loop: 0 };
  return {
    calls,
    async chat(p) {
      const sys = p.messages[0].content;
      if (p.response_format) {
        const body = (content) => ({ choices: [{ message: { content: JSON.stringify(content) } }] });
        if (sys.includes('planning stage')) { calls.planner++; return body({ restated_question: 'Why did March revenue drop?', hypotheses: [{ id: 'H1', statement: 'One segment collapsed', test: 'compare_periods by region and channel' }], steps: ['compare periods'] }); }
        if (sys.includes('final report')) { calls.reporter++; return body({ headline: 'South online orders collapsed from 10 March', summary: 'Revenue fell.', findings: [{ claim: 'South online fell', evidence: 'see step 1', steps: [1], confidence: 0.9, impact: 'high' }], ruled_out: [], recommendations: ['Check checkout'], follow_up_questions: ['Did orders fail?'], overall_confidence: 0.85 }); }
        if (sys.includes('skeptical reviewer')) { calls.critic++; const v = criticVerdicts[critiques++] || 'approve'; return body(v === 'revise' ? { verdict: 'revise', issues: ['Check Electronics split'], missing_checks: ['breakdown by product_category'] } : { verdict: 'approve', issues: [], missing_checks: [] }); }
      }
      calls.loop++;
      if (toolIdx < toolScript.length) {
        const call = toolScript[toolIdx++];
        return { choices: [{ message: { content: 'Checking the next thing.', tool_calls: [call] } }] };
      }
      return { choices: [{ message: { content: 'Ready to report.' } }] };
    },
  };
}

function collect() {
  const events = [];
  return { events, emit: (type, payload) => events.push({ type, ...payload }) };
}

test('full run streams plan, steps, observations, chart and a report', async () => {
  await vectors.addKnowledge('notes.md', 'South region online checkout was migrated on 2025-03-10.\n\nPromotions ran for Apparel in February.');
  const llm = fakeLLM({ criticVerdicts: ['approve'] });
  const { events, emit } = collect();
  const { report } = await runInvestigation({ llm, dataset, question: 'Why did revenue drop in March?', emit });
  const types = events.map((e) => e.type);
  assert.deepEqual(types.filter((t) => t === 'plan').length, 1);
  assert.equal(types.filter((t) => t === 'step').length, 4);
  assert.equal(types.filter((t) => t === 'chart').length, 1);
  assert.equal(events.find((e) => e.type === 'critique').verdict, 'approve');
  assert.match(report.headline, /South online/);
  const obs = events.filter((e) => e.type === 'observation');
  assert.equal(obs[0].ok, true);
  assert.equal(obs[3].ok, false, 'DROP TABLE must be refused');
  assert.ok(obs[1].preview?.length, 'knowledge search should find the note');
  assert.equal(llm.calls.reporter, 1);
});

test('critic can force a revision that adds steps and re-reports', async () => {
  const llm = fakeLLM({ criticVerdicts: ['revise'] });
  const { events, emit } = collect();
  const { report } = await runInvestigation({ llm, dataset, question: 'What caused the March dip?', emit });
  assert.equal(events.find((e) => e.type === 'critique').verdict, 'revise');
  assert.equal(report.revised, true);
  assert.equal(llm.calls.reporter, 2);
});

test('long-term memory recalls earlier investigations', async () => {
  const llm = fakeLLM({ criticVerdicts: ['approve'] });
  const { events, emit } = collect();
  await runInvestigation({ llm, dataset, question: 'Why did revenue drop in March?', emit });
  const mem = events.find((e) => e.type === 'memory');
  assert.ok(mem, 'expected a memory event');
  assert.match(mem.matches[0].headline, /South online/);
});

test('abort signal cancels the run', async () => {
  const ac = new AbortController();
  ac.abort();
  const { emit } = collect();
  await assert.rejects(runInvestigation({ llm: fakeLLM({ criticVerdicts: [] }), dataset, question: 'x', emit, signal: ac.signal }), /cancelled/);
});
