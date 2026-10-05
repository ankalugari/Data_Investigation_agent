import { config } from '../config.js';
import { toolDefinitions } from '../tools/definitions.js';
import { runTool, toolResultText } from '../tools/index.js';
import { schemaSummary } from '../data/profile.js';
import * as vectors from '../rag/vectorStore.js';
import { analystPrompt, criticPrompt, plannerPrompt, reporterPrompt } from './prompts.js';

const clamp01 = (n) => (Number.isFinite(Number(n)) ? Math.min(1, Math.max(0, Number(n))) : 0.5);
const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []);

function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = String(text).match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { /* fall through */ }
    }
    return null;
  }
}

async function jsonCall(llm, system, user, maxTokens = 1800) {
  const resp = await llm.chat({
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: maxTokens,
  });
  return parseJSON(resp.choices[0].message.content);
}

export function normalizeReport(raw, fallbackQuestion) {
  const r = raw || {};
  return {
    headline: String(r.headline || `Investigation of: ${fallbackQuestion}`),
    summary: String(r.summary || 'The agent could not produce a structured summary.'),
    findings: (Array.isArray(r.findings) ? r.findings : []).slice(0, 8).map((f) => ({
      claim: String(f.claim || ''),
      evidence: String(f.evidence || ''),
      steps: (Array.isArray(f.steps) ? f.steps : []).map(Number).filter(Number.isInteger),
      confidence: clamp01(f.confidence),
      impact: ['high', 'medium', 'low'].includes(f.impact) ? f.impact : 'medium',
    })).filter((f) => f.claim),
    ruled_out: arr(r.ruled_out),
    recommendations: arr(r.recommendations),
    follow_up_questions: arr(r.follow_up_questions).slice(0, 4),
    overall_confidence: clamp01(r.overall_confidence),
  };
}

const isToolUseFailed = (e) => e?.status === 400 && /tool_use_failed|failed to call a function|failed_generation/i.test(JSON.stringify(e?.error ?? e?.message ?? ''));

const logText = (log) =>
  log.map((o) => `[step ${o.id}] ${o.tool}(${JSON.stringify(o.args)}) -> ${o.ok ? '' : 'ERROR: '}${toolResultText(o.result, 1600)}`).join('\n\n') || '(no observations)';

/**
 * Plan -> investigate (ReAct tool loop) -> report -> critique -> optional revision.
 * `emit(type, payload)` streams progress to the client.
 */
export async function runInvestigation({ llm, dataset, question, history = [], emit, signal }) {
  const aborted = () => { if (signal?.aborted) throw Object.assign(new Error('Investigation cancelled.'), { cancelled: true }); };

  // ---- Long-term memory: recall similar past investigations ----
  emit('status', { phase: 'planning' });
  const recalled = await vectors.search(question, {
    kind: 'investigation', k: 3, minScore: 0.3, filter: (i) => i.meta.dataset === dataset.name,
  });
  if (recalled.length) {
    emit('memory', { matches: recalled.map((r) => ({ question: r.meta.question, headline: r.meta.headline, score: Math.round(r.score * 100) / 100 })) });
  }
  const memoryText = recalled.length
    ? `Earlier investigations of this dataset:\n${recalled.map((r) => `- Q: ${r.meta.question}\n  A: ${r.meta.headline}`).join('\n')}`
    : '';
  const historyText = history.length
    ? `Earlier in this session:\n${history.slice(-3).map((h) => `- Q: ${h.question}\n  A: ${h.headline}`).join('\n')}`
    : '';

  // ---- Planning ----
  const planRaw = await jsonCall(
    llm,
    plannerPrompt(),
    `${schemaSummary(dataset)}\n\n${memoryText}\n${historyText}\n\nQuestion: ${question}`,
  );
  const plan = {
    restated_question: String(planRaw?.restated_question || question),
    hypotheses: (Array.isArray(planRaw?.hypotheses) ? planRaw.hypotheses : []).slice(0, 4).map((h, i) => ({ id: String(h.id || `H${i + 1}`), statement: String(h.statement || ''), test: String(h.test || '') })).filter((h) => h.statement),
    steps: arr(planRaw?.steps).slice(0, 6),
  };
  emit('plan', plan);
  aborted();

  // ---- Investigation loop (ReAct with function calling) ----
  emit('status', { phase: 'investigating' });
  const messages = [
    { role: 'system', content: analystPrompt(dataset, config.maxSteps) },
    {
      role: 'user',
      content: `Question: ${question}\n\nPlan:\n${plan.hypotheses.map((h) => `${h.id}: ${h.statement} (test: ${h.test})`).join('\n')}\n\n${memoryText}\n${historyText}\n\nBegin the investigation.`,
    },
  ];
  const log = [];
  let stepNo = 0;
  let forcedToolUse = false;
  const toolCtx = { dataset, emitChart: (spec) => emit('chart', { id: stepNo, spec }) };

  async function work(limit) {
    let malformed = 0;
    while (stepNo < limit) {
      aborted();
      let resp;
      try {
        resp = await llm.chat({ messages, tools: toolDefinitions, tool_choice: 'auto', temperature: 0.2, max_tokens: 1500 });
      } catch (err) {
        if (isToolUseFailed(err) && malformed++ < 2) {
          messages.push({ role: 'user', content: 'Your last tool call was malformed. Call the tool again with valid JSON arguments.' });
          continue;
        }
        throw err;
      }
      const msg = resp.choices[0].message;
      const calls = msg.tool_calls || [];
      messages.push({ role: 'assistant', content: msg.content ?? '', ...(calls.length ? { tool_calls: calls } : {}) });

      if (!calls.length) {
        if (!log.length && !forcedToolUse) {
          forcedToolUse = true;
          messages.push({ role: 'user', content: 'Gather evidence with the tools before concluding.' });
          continue;
        }
        return;
      }

      for (const call of calls) {
        if (stepNo >= limit) {
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'Step budget exhausted. Stop and report.' }) });
          continue;
        }
        stepNo += 1;
        const id = stepNo;
        let args = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { args = {}; }
        emit('step', { id, tool: call.function.name, args, thought: (msg.content || '').trim() || undefined });
        const out = await runTool(call.function.name, args, toolCtx);
        log.push({ id, tool: call.function.name, args, ok: out.ok, result: out.result });
        const preview = out.ok && out.result?.rows ? out.result.rows.slice(0, 5)
          : out.ok && out.result?.breakdown ? out.result.breakdown.slice(0, 5)
          : out.ok && out.result?.flagged ? out.result.flagged.slice(0, 5)
          : out.ok && out.result?.correlations ? out.result.correlations.slice(0, 5)
          : out.ok && out.result?.matches ? out.result.matches.map((m) => ({ source: m.source, text: m.text.slice(0, 160) }))
          : undefined;
        emit('observation', { id, tool: call.function.name, ok: out.ok, summary: out.summary, preview });
        messages.push({ role: 'tool', tool_call_id: call.id, content: toolResultText(out.result) });
      }
    }
  }

  await work(config.maxSteps);
  aborted();

  // ---- Report, critique, optional revision ----
  const writeReport = async () => {
    emit('status', { phase: 'reporting' });
    const raw = await jsonCall(llm, reporterPrompt, `Question: ${question}\n\nPlan hypotheses:\n${plan.hypotheses.map((h) => `${h.id}: ${h.statement}`).join('\n')}\n\nObservation log:\n${logText(log)}`, 2200);
    return normalizeReport(raw, question);
  };

  let report = await writeReport();
  aborted();

  emit('status', { phase: 'reviewing' });
  const review = await jsonCall(llm, criticPrompt, `Report:\n${JSON.stringify(report)}\n\nObservation log:\n${logText(log)}`, 900);
  const issues = arr(review?.issues);
  const missing = arr(review?.missing_checks);
  const verdict = review?.verdict === 'revise' && (issues.length || missing.length) ? 'revise' : 'approve';
  emit('critique', { verdict, issues, missing_checks: missing });

  if (verdict === 'revise') {
    emit('status', { phase: 'investigating' });
    messages.push({
      role: 'user',
      content: `A reviewer found problems with the draft report.\nIssues:\n${issues.map((i) => `- ${i}`).join('\n')}\nMissing checks:\n${missing.map((i) => `- ${i}`).join('\n')}\nUse up to ${config.extraStepsOnRevise} more tool calls to address these, then say you are ready to report.`,
    });
    await work(stepNo + config.extraStepsOnRevise);
    aborted();
    report = { ...(await writeReport()), revised: true };
  }

  emit('report', { report });

  // ---- Long-term memory: remember this investigation ----
  try {
    await vectors.addItem({
      kind: 'investigation',
      text: `${question}\n${report.headline}\n${report.summary}`,
      meta: { dataset: dataset.name, question, headline: report.headline },
    });
  } catch (err) {
    console.warn('[memory] could not store investigation:', err.message);
  }

  return { report, steps: stepNo };
}
