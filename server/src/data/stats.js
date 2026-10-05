export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const round = (n, d = 2) => (isNum(n) ? Math.round(n * 10 ** d) / 10 ** d : n);

export function mean(a) {
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
}

export function std(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}

export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function summarize(values) {
  const a = values.filter(isNum).sort((x, y) => x - y);
  if (!a.length) return null;
  return {
    count: a.length,
    mean: round(mean(a)),
    std: round(std(a)),
    min: round(a[0]),
    p25: round(quantile(a, 0.25)),
    median: round(quantile(a, 0.5)),
    p75: round(quantile(a, 0.75)),
    max: round(a[a.length - 1]),
  };
}

export function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : NaN;
}

/** Flags outliers with z-score (|z| >= threshold) or Tukey fences (IQR). */
export function flagOutliers(values, method = 'iqr', threshold = 2) {
  const sorted = [...values].sort((a, b) => a - b);
  if (method === 'zscore') {
    const m = mean(values);
    const s = std(values) || 1;
    return {
      flags: values.map((v) => Math.abs((v - m) / s) >= threshold),
      scores: values.map((v) => (v - m) / s),
      bounds: { low: m - threshold * s, high: m + threshold * s },
    };
  }
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const low = q1 - 1.5 * iqr;
  const high = q3 + 1.5 * iqr;
  const med = quantile(sorted, 0.5);
  return {
    flags: values.map((v) => v < low || v > high),
    scores: values.map((v) => (iqr ? (v - med) / iqr : 0)),
    bounds: { low, high },
  };
}
