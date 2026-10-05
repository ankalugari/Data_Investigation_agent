import { config } from '../config.js';
import { flagOutliers, isNum, mean, pearson, round, summarize } from '../data/stats.js';
import * as vectors from '../rag/vectorStore.js';

class ToolError extends Error {}

// ---------- guards ----------
const FORBIDDEN = /\b(insert|update|delete|drop|create|alter|attach|detach|into|require|fetch|assert|declare|set|use|show|source|call|exec|execute|merge|replace|truncate|grant|revoke|import|export|load)\b|__proto__|constructor|prototype|process|\bthis\b|`/i;
const EXTERNAL_SOURCE = /\bfrom\s+(csv|xlsx|xls|txt|tab|tsv|json|file|html|xml|ods)\s*\(/i;

export function guardSql(sql) {
  if (typeof sql !== 'string' || !sql.trim()) throw new ToolError('sql must be a non-empty string.');
  const s = sql.trim().replace(/;+\s*$/, '');
  const stripped = s.replace(/'(?:[^']|'')*'/g, "''");
  if (stripped.includes(';')) throw new ToolError('Only a single statement is allowed.');
  if (!/^(select|with)\b/i.test(stripped)) throw new ToolError('Only SELECT queries are allowed.');
  if (FORBIDDEN.test(stripped) || EXTERNAL_SOURCE.test(stripped)) throw new ToolError('Query uses a keyword that is not allowed in read-only mode.');
  return s;
}

function execSql(ctx, sql) {
  const q = guardSql(sql);
  try {
    const out = ctx.dataset.db.exec(q);
    if (!Array.isArray(out)) throw new ToolError('Query did not return rows.');
    return out;
  } catch (err) {
    if (err instanceof ToolError) throw err;
    const cols = ctx.dataset.profile.columns.map((c) => c.name).join(', ');
    throw new ToolError(`SQL error: ${String(err.message).split('\n')[0]}. Table is "data"; columns: ${cols}.`);
  }
}

const roundRow = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, isNum(v) ? round(v) : v]));

function col(ctx, name, type) {
  const c = ctx.dataset.profile.columns.find((x) => x.name === name);
  if (!c) throw new ToolError(`Unknown column "${name}". Available: ${ctx.dataset.profile.columns.map((x) => x.name).join(', ')}.`);
  if (type && c.type !== type) throw new ToolError(`Column "${name}" is ${c.type}, expected ${type}.`);
  return c;
}

const dayIndex = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

function bucketKey(iso, bucket) {
  if (bucket === 'month') return iso.slice(0, 7);
  if (bucket === 'week') {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }
  return iso;
}

function aggregate(values, agg) {
  if (agg === 'count') return values.length;
  if (!values.length) return 0;
  const total = values.reduce((s, v) => s + v, 0);
  return agg === 'avg' ? total / values.length : total;
}

// ---------- tools ----------
const impl = {
  run_query(ctx, { sql }) {
    const rows = execSql(ctx, sql);
    const shown = rows.slice(0, config.maxQueryRows).map(roundRow);
    return {
      result: { row_count: rows.length, truncated: rows.length > shown.length, rows: shown },
      summary: `${rows.length} row${rows.length === 1 ? '' : 's'} returned`,
    };
  },

  describe_column(ctx, { column }) {
    const c = col(ctx, column);
    return { result: c, summary: `${c.type} column, ${c.unique} distinct values, ${c.nulls} nulls` };
  },

  detect_anomalies(ctx, { column, method = 'iqr', date_column, bucket = 'day', aggregation = 'sum' }) {
    col(ctx, column, 'number');
    const threshold = 2;
    if (!date_column) {
      const idx = [];
      const vals = [];
      ctx.dataset.rows.forEach((r, i) => { if (isNum(r[column])) { idx.push(i); vals.push(r[column]); } });
      const { flags, bounds } = flagOutliers(vals, method, threshold);
      const hits = idx.filter((_, k) => flags[k]);
      const top = hits.map((i) => ctx.dataset.rows[i]).sort((a, b) => Math.abs(b[column]) - Math.abs(a[column])).slice(0, 8);
      return {
        result: { method, bounds: { low: round(bounds.low), high: round(bounds.high) }, outlier_rows: hits.length, of: vals.length, examples: top },
        summary: `${hits.length} outlier rows of ${vals.length}`,
      };
    }
    col(ctx, date_column, 'date');
    const groups = new Map();
    for (const r of ctx.dataset.rows) {
      if (!r[date_column] || !isNum(r[column])) continue;
      const k = bucketKey(r[date_column], bucket);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r[column]);
    }
    const keys = [...groups.keys()].sort();
    if (keys.length < 4) throw new ToolError(`Only ${keys.length} ${bucket} buckets; need at least 4. Try a smaller bucket.`);
    const series = keys.map((k) => aggregate(groups.get(k), aggregation));
    const { flags, scores, bounds } = flagOutliers(series, method, threshold);
    const rows = keys.map((k, i) => ({
      period: k,
      value: round(series[i]),
      change_vs_prev_pct: i && series[i - 1] ? round(((series[i] - series[i - 1]) / Math.abs(series[i - 1])) * 100, 1) : null,
      anomaly: flags[i] ? (series[i] < mean(series) ? 'low' : 'high') : null,
      score: round(scores[i]),
    }));
    const flagged = rows.filter((r) => r.anomaly);
    return {
      result: {
        method, bucket, aggregation, periods: keys.length,
        bounds: { low: round(bounds.low), high: round(bounds.high) },
        flagged,
        series: keys.length <= 40 ? rows : undefined,
      },
      summary: `${flagged.length} unusual ${bucket}${flagged.length === 1 ? '' : 's'} of ${keys.length}`,
    };
  },

  compare_periods(ctx, a) {
    const { metric, date_column, aggregation = 'sum' } = a;
    col(ctx, metric, 'number');
    col(ctx, date_column, 'date');
    const dims = (a.breakdown_by || []).slice(0, 2);
    dims.forEach((d) => col(ctx, d));
    const range = (s, e) => {
      if (!s || !e || Number.isNaN(Date.parse(s)) || Number.isNaN(Date.parse(e)) || s > e) throw new ToolError('Period dates must be YYYY-MM-DD with start <= end.');
      return [s, e];
    };
    const [as, ae] = range(a.period_a_start, a.period_a_end);
    const [bs, be] = range(a.period_b_start, a.period_b_end);
    const buckets = new Map(); // key -> { A: [], B: [] }
    const totals = { A: [], B: [] };
    for (const r of ctx.dataset.rows) {
      const d = r[date_column];
      if (!d) continue;
      const side = d >= as && d <= ae ? 'A' : d >= bs && d <= be ? 'B' : null;
      if (!side) continue;
      const v = aggregation === 'count' ? 1 : r[metric];
      if (!isNum(v)) continue;
      totals[side].push(v);
      if (dims.length) {
        const key = dims.map((k) => r[k] ?? 'null').join(' | ');
        if (!buckets.has(key)) buckets.set(key, { A: [], B: [] });
        buckets.get(key)[side].push(v);
      }
    }
    const daysA = dayIndex(ae) - dayIndex(as) + 1;
    const daysB = dayIndex(be) - dayIndex(bs) + 1;
    // Compare per-day rates so periods of different length are fair.
    const rate = (vals, days) => aggregate(vals, aggregation) / (aggregation === 'avg' ? 1 : days);
    const totA = rate(totals.A, daysA);
    const totB = rate(totals.B, daysB);
    const totalDelta = totB - totA;
    const pct = (x, y) => (x ? round(((y - x) / Math.abs(x)) * 100, 1) : null);
    const breakdown = [...buckets.entries()]
      .map(([key, v]) => {
        const ra = rate(v.A, daysA);
        const rb = rate(v.B, daysB);
        return {
          segment: key,
          a: round(ra),
          b: round(rb),
          delta: round(rb - ra),
          change_pct: pct(ra, rb),
          share_of_total_change_pct: totalDelta ? round(((rb - ra) / totalDelta) * 100, 1) : null,
          rows_a: v.A.length,
          rows_b: v.B.length,
        };
      })
      .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
      .slice(0, 12);
    const unit = aggregation === 'avg' ? '' : ' per day';
    return {
      result: {
        metric, aggregation,
        note: `Values are ${aggregation}${unit}; period A has ${daysA} days, period B has ${daysB} days.`,
        total: { a: round(totA), b: round(totB), delta: round(totalDelta), change_pct: pct(totA, totB), rows_a: totals.A.length, rows_b: totals.B.length },
        breakdown,
      },
      summary: `${metric} ${pct(totA, totB) ?? 'n/a'}% (${aggregation}${unit}); ${breakdown.length} segments ranked`,
    };
  },

  correlate(ctx, { target, columns }) {
    col(ctx, target, 'number');
    const others = (columns?.length ? columns : ctx.dataset.profile.columns.filter((c) => c.type === 'number' && c.name !== target).map((c) => c.name));
    others.forEach((c) => col(ctx, c, 'number'));
    const out = others
      .map((c) => {
        const xs = [];
        const ys = [];
        for (const r of ctx.dataset.rows) if (isNum(r[c]) && isNum(r[target])) { xs.push(r[c]); ys.push(r[target]); }
        return { column: c, r: round(pearson(xs, ys), 3), n: xs.length };
      })
      .filter((x) => Number.isFinite(x.r))
      .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
      .slice(0, 8);
    return { result: { target, correlations: out, note: 'Correlation is not causation.' }, summary: out.length ? `strongest: ${out[0].column} (r=${out[0].r})` : 'no numeric columns to compare' };
  },

  make_chart(ctx, { chart_type, title, sql }) {
    if (!['line', 'bar'].includes(chart_type)) throw new ToolError('chart_type must be "line" or "bar".');
    const rows = execSql(ctx, sql).slice(0, 60);
    if (!rows.length) throw new ToolError('Query returned no rows to plot.');
    const keys = Object.keys(rows[0]);
    if (keys.length < 2) throw new ToolError('Query must return an x column plus at least one numeric series.');
    const series = keys.slice(1).filter((k) => rows.some((r) => isNum(r[k])));
    if (!series.length) throw new ToolError('No numeric series found in the query result.');
    const spec = { type: chart_type, title: String(title).slice(0, 120), x: keys[0], series, data: rows.map(roundRow) };
    ctx.emitChart?.(spec);
    return { result: { ok: true, points: rows.length, x: keys[0], series }, summary: `${chart_type} chart with ${rows.length} points` };
  },

  async search_knowledge(ctx, { query }) {
    if (typeof query !== 'string' || !query.trim()) throw new ToolError('query must be a non-empty string.');
    const hits = await vectors.search(query, { k: 4, minScore: 0.2 });
    return {
      result: hits.length
        ? { matches: hits.map((h) => ({ source: h.meta.source || 'past investigation', kind: h.kind, score: round(h.score, 2), text: h.text.slice(0, 700) })) }
        : { matches: [], note: 'No relevant documents found.' },
      summary: hits.length ? `${hits.length} passage${hits.length === 1 ? '' : 's'} found` : 'nothing relevant found',
    };
  },
};

/** Runs a tool and always returns { ok, result, summary } (never throws for bad model input). */
export async function runTool(name, args, ctx) {
  const handler = impl[name];
  if (!handler) return { ok: false, result: { error: `Unknown tool "${name}".` }, summary: 'unknown tool' };
  try {
    const out = await handler(ctx, args || {});
    return { ok: true, ...out };
  } catch (err) {
    const msg = err instanceof ToolError ? err.message : `Tool failed: ${err.message}`;
    return { ok: false, result: { error: msg }, summary: msg.slice(0, 140) };
  }
}

export function toolResultText(result, max = config.maxToolChars) {
  const text = JSON.stringify(result);
  return text.length > max ? `${text.slice(0, max)}…[truncated; narrow the query]` : text;
}

export { summarize };
