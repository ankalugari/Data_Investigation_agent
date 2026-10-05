import ChartCard from './ChartCard.jsx';

const IMPACT = { high: 'High impact', medium: 'Medium impact', low: 'Low impact' };
const confidenceWord = (c) => (c >= 0.75 ? 'High' : c >= 0.45 ? 'Medium' : 'Low');

function Confidence({ value }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2 text-xs text-muted" title={`${pct}% confidence`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-line" role="presentation">
        <div className="h-full rounded-full bg-ultra" style={{ width: `${pct}%` }} />
      </div>
      <span>{confidenceWord(value)} confidence</span>
    </div>
  );
}

export default function ReportPanel({ state, onFollowUp, onFocusStep }) {
  const { report, running, error, charts, question, steps } = state;
  const stepIds = new Set(steps.map((s) => s.id));

  return (
    <section aria-labelledby="report-h" className="min-w-0">
      <h2 id="report-h" className="mb-3 text-sm font-semibold">Findings</h2>

      {error && (
        <p className="mb-4 rounded-lg border border-warn/40 bg-warn/5 px-4 py-3 text-sm text-warn" role="alert">{error}</p>
      )}

      {!report && !error && (
        <p className="rounded-lg border border-dashed border-line px-4 py-6 text-sm text-muted">
          {running ? 'The agent is still gathering evidence. The report appears here when it finishes.' : 'Your report will appear here, with the evidence behind every claim.'}
        </p>
      )}

      {report && (
        <article className="min-w-0 rounded-xl border border-line bg-white p-4 sm:p-8">
          <p className="text-xs text-muted">{question}</p>
          <h3 className="mt-2 break-words text-xl font-bold leading-tight tracking-tight sm:text-3xl">{report.headline}</h3>
          <p className="mt-4 max-w-prose break-words font-serif text-base leading-relaxed sm:text-lg">{report.summary}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Confidence value={report.overall_confidence} />
            {report.revised && <span className="rounded-full bg-ultra-soft px-2.5 py-0.5 text-xs text-ultra">Re-checked after review</span>}
          </div>

          {report.findings.length > 0 && (
            <ol className="mt-8 flex flex-col gap-6">
              {report.findings.map((f, i) => (
                <li key={i} className="border-t border-line pt-5">
                  <p className="max-w-prose font-serif text-lg font-semibold leading-snug"><span className="marker">{f.claim}</span></p>
                  {f.evidence && <p className="mt-2 max-w-prose font-serif text-base leading-relaxed text-ink/85">{f.evidence}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Confidence value={f.confidence} />
                    <span className="text-xs text-muted">{IMPACT[f.impact]}</span>
                    {f.steps.filter((n) => stepIds.has(n)).map((n) => (
                      <button key={n} type="button" onClick={() => onFocusStep(n)} className="rounded-md border border-line px-2 py-0.5 text-xs font-medium hover:border-ultra hover:text-ultra">Step {n}</button>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          )}

          {report.ruled_out.length > 0 && (
            <div className="mt-8">
              <h4 className="text-sm font-semibold">Ruled out</h4>
              <ul className="mt-2 list-disc pl-5 font-serif text-base leading-relaxed">{report.ruled_out.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          )}
          {report.recommendations.length > 0 && (
            <div className="mt-8">
              <h4 className="text-sm font-semibold">What to do next</h4>
              <ul className="mt-2 list-disc pl-5 font-serif text-base leading-relaxed">{report.recommendations.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          )}
          {report.follow_up_questions.length > 0 && (
            <div className="mt-8">
              <h4 className="text-sm font-semibold">Keep investigating</h4>
              <ul className="mt-2 flex flex-wrap gap-2">
                {report.follow_up_questions.map((q, i) => (
                  <li key={i}><button type="button" disabled={running} onClick={() => onFollowUp(q)} className="rounded-full border border-line px-3 py-1.5 text-left text-xs hover:border-ultra hover:text-ultra disabled:opacity-50">{q}</button></li>
                ))}
              </ul>
            </div>
          )}
        </article>
      )}

      {charts.length > 0 && (
        <div className="mt-4 flex flex-col gap-4">
          {charts.map((c, i) => <ChartCard key={i} spec={c} />)}
        </div>
      )}
    </section>
  );
}
