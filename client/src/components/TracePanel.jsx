import { useEffect, useRef } from 'react';

const TOOL_LABEL = {
  run_query: 'Queried the data',
  describe_column: 'Profiled a column',
  detect_anomalies: 'Looked for anomalies',
  compare_periods: 'Compared two periods',
  correlate: 'Checked correlations',
  make_chart: 'Drew a chart',
  search_knowledge: 'Searched business notes',
};

const PHASES = [
  { key: 'planning', label: 'Plan' },
  { key: 'investigating', label: 'Investigate' },
  { key: 'reviewing', label: 'Review' },
  { key: 'reporting', label: 'Report' },
];

function PhaseBar({ phase, finished }) {
  const current = PHASES.findIndex((p) => p.key === phase);
  return (
    <ol className="mb-5 grid grid-cols-4 gap-1.5" aria-label="Investigation progress">
      {PHASES.map((p, i) => {
        const state = finished || i < current ? 'done' : i === current ? 'active' : 'todo';
        return (
          <li key={p.key} className="text-xs" aria-current={state === 'active' ? 'step' : undefined}>
            <div className={`h-1.5 rounded-full ${state === 'done' ? 'bg-ultra' : state === 'active' ? 'breathe bg-ultra/60' : 'bg-line'}`} />
            <span className={`mt-1.5 block ${state === 'todo' ? 'text-muted' : 'font-medium'}`}>{p.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function MiniTable({ rows }) {
  const cols = Object.keys(rows[0] || {}).slice(0, 5);
  if (!cols.length) return null;
  return (
    <div className="mt-2 overflow-x-auto rounded-md border border-line">
      <table className="w-full text-left text-xs">
        <thead className="bg-paper text-muted">
          <tr>{cols.map((c) => <th key={c} className="px-2 py-1 font-medium">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {cols.map((c) => <td key={c} className="max-w-48 truncate px-2 py-1">{typeof r[c] === 'object' ? JSON.stringify(r[c]) : String(r[c] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Args({ tool, args }) {
  if (args?.sql) return <pre className="mt-2 overflow-x-auto rounded-md bg-ink p-3 font-mono text-xs leading-relaxed text-white">{args.sql}</pre>;
  const entries = Object.entries(args || {}).filter(([, v]) => v !== undefined && v !== '');
  if (!entries.length) return null;
  return (
    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-1">
          <dt className="text-muted">{k.replaceAll('_', ' ')}</dt>
          <dd className="font-medium">{Array.isArray(v) ? v.join(', ') : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Step({ step, focused }) {
  const ref = useRef(null);
  useEffect(() => { if (focused) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [focused]);
  const dot = step.status === 'running' ? 'breathe bg-ultra' : step.status === 'failed' ? 'bg-warn' : 'bg-good';
  return (
    <li ref={ref} id={`step-${step.id}`} className={`rounded-lg border bg-white p-3 transition-shadow ${focused ? 'border-ultra shadow-[0_0_0_3px_var(--color-mark)]' : 'border-line'}`}>
      <div className="flex items-center gap-2 text-sm">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
        <span className="font-semibold">Step {step.id}</span>
        <span className="text-muted">{TOOL_LABEL[step.tool] || step.tool}</span>
      </div>
      {step.thought && <p className="mt-2 font-serif text-sm italic text-muted">{step.thought}</p>}
      <Args tool={step.tool} args={step.args} />
      {step.summary && (
        <p className={`mt-2 text-xs ${step.status === 'failed' ? 'text-warn' : 'text-ink'}`}>
          {step.status === 'failed' ? 'Failed, the agent will adjust: ' : 'Result: '}{step.summary}
        </p>
      )}
      {step.preview?.length > 0 && <MiniTable rows={step.preview} />}
    </li>
  );
}

export default function TracePanel({ state, focusStep }) {
  const { phase, running, plan, memory, steps, critique, report } = state;
  const started = running || steps.length > 0 || plan;
  return (
    <section aria-labelledby="trace-h" className="min-w-0">
      <h2 id="trace-h" className="mb-3 text-sm font-semibold">Investigation log</h2>
      {!started ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-6 text-sm text-muted">
          Each step the agent takes will appear here as it works: the plan, the queries it runs, and what it finds.
        </p>
      ) : (
        <>
          <PhaseBar phase={phase} finished={Boolean(report) && !running} />
          <div className="flex flex-col gap-3">
            {memory?.length > 0 && (
              <div className="rounded-lg border border-ultra/30 bg-ultra-soft p-3 text-sm">
                <p className="font-semibold">Recalled from earlier investigations</p>
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {memory.map((m, i) => <li key={i}>{m.question}: {m.headline}</li>)}
                </ul>
              </div>
            )}
            {plan && (
              <div className="rounded-lg border border-line bg-white p-3 text-sm">
                <p className="font-semibold">Plan</p>
                <p className="mt-1 text-xs text-muted">{plan.restated_question}</p>
                <ul className="mt-2 flex flex-col gap-1.5 text-xs">
                  {plan.hypotheses.map((h) => (
                    <li key={h.id}><span className="font-semibold">{h.id}</span> {h.statement}</li>
                  ))}
                </ul>
              </div>
            )}
            <ol className="flex flex-col gap-3">
              {steps.map((s) => <Step key={s.id} step={s} focused={focusStep === s.id} />)}
            </ol>
            {critique && (
              <div className={`rounded-lg border p-3 text-sm ${critique.verdict === 'revise' ? 'border-warn/40 bg-warn/5' : 'border-good/30 bg-good/5'}`}>
                <p className="font-semibold">{critique.verdict === 'revise' ? 'Reviewer asked for more evidence' : 'Reviewer approved the draft'}</p>
                {[...critique.issues, ...critique.missing_checks].length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-xs">
                    {[...critique.issues, ...critique.missing_checks].map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
