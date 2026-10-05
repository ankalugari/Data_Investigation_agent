import Papa from 'papaparse';
import alasql from 'alasql';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { isNum, summarize } from './stats.js';

// Names AlaSQL cannot use as plain identifiers. We suffix them with "_" at load time.
const RESERVED = new Set(
  'value values count sum avg order group key index table select from where by limit offset to as in is not and or like between case when then else end desc asc top column columns row rows set into total target default first last all any exists left right join on using union distinct having temp matrix recordset array'.split(' '),
);

const snake = (s) => {
  let n = String(s ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'col';
  if (/^\d/.test(n)) n = `c_${n}`;
  return RESERVED.has(n) ? `${n}_` : n;
};

const ISO = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const pad = (n) => String(n).padStart(2, '0');

/** Returns "YYYY-MM-DD" or null. Day-first is assumed for ambiguous dd/mm/yyyy values. */
export function toISODate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (ISO.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, a, b, y] = m.map(Number);
    let d = a;
    let mo = b;
    if (b > 12 && a <= 12) [d, mo] = [b, a];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad(mo)}-${pad(d)}`;
  }
  return null;
}

function parseRows(buffer, filename) {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  if (/\.json$/i.test(filename)) {
    const json = JSON.parse(text);
    const arr = Array.isArray(json) ? json : Object.values(json).find(Array.isArray);
    if (!Array.isArray(arr)) throw new Error('JSON must be an array of objects.');
    return arr.filter((r) => r && typeof r === 'object' && !Array.isArray(r));
  }
  const parsed = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: 'greedy' });
  if (!parsed.data.length) throw new Error('No rows found. Check that the file is a CSV with a header row.');
  return parsed.data;
}

function uniqueNames(keys) {
  const seen = new Map();
  return keys.map((k) => {
    const base = snake(k);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
}

function inferType(values, rowCount) {
  const present = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (!present.length) return 'text';
  if (present.filter(isNum).length / present.length >= 0.95) return 'number';
  if (present.filter((v) => toISODate(v)).length / present.length >= 0.95) return 'date';
  const unique = new Set(present.map(String)).size;
  return unique <= Math.max(50, rowCount * 0.05) ? 'category' : 'text';
}

export function loadDataset(buffer, filename) {
  const raw = parseRows(buffer, filename).slice(0, config.maxRows);
  const keys = [...new Set(raw.flatMap((r) => Object.keys(r)))];
  const names = uniqueNames(keys);
  const rows = raw.map((r) => {
    const o = {};
    keys.forEach((k, i) => {
      const v = r[k];
      o[names[i]] = v === '' || v === undefined ? null : v;
    });
    return o;
  });

  const columns = names.map((name) => {
    const values = rows.map((r) => r[name]);
    const type = inferType(values, rows.length);
    const nonNull = values.filter((v) => v !== null);
    const col = { name, type, nulls: values.length - nonNull.length, unique: new Set(nonNull.map(String)).size };
    if (type === 'date') {
      rows.forEach((r) => { r[name] = toISODate(r[name]); });
      const dates = rows.map((r) => r[name]).filter(Boolean).sort();
      col.min = dates[0];
      col.max = dates.at(-1);
    } else if (type === 'number') {
      Object.assign(col, summarize(nonNull) || {});
    } else {
      const counts = new Map();
      nonNull.forEach((v) => counts.set(String(v), (counts.get(String(v)) || 0) + 1));
      col.top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([value, count]) => ({ value, count }));
    }
    return col;
  });

  const db = new alasql.Database();
  db.exec('CREATE TABLE data');
  db.tables.data.data = rows;

  return {
    id: crypto.randomUUID(),
    name: filename,
    rows,
    db,
    profile: { rowCount: rows.length, columns },
  };
}

/** Compact schema text for prompts. */
export function schemaSummary(dataset) {
  const lines = dataset.profile.columns.map((c) => {
    let detail = '';
    if (c.type === 'number') detail = `min ${c.min}, max ${c.max}, mean ${c.mean}`;
    else if (c.type === 'date') detail = `${c.min} to ${c.max}`;
    else if (c.top) detail = `${c.unique} distinct, e.g. ${c.top.slice(0, 4).map((t) => t.value).join(', ')}`;
    return `- ${c.name} (${c.type}${c.nulls ? `, ${c.nulls} nulls` : ''}): ${detail}`;
  });
  return `Table "data" with ${dataset.profile.rowCount} rows:\n${lines.join('\n')}`;
}

export const publicDataset = (d) => ({ id: d.id, name: d.name, profile: d.profile, preview: d.rows.slice(0, 5) });
