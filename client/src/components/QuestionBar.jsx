import { useState } from 'react';

const GENERIC = [
  'What changed the most over time, and why?',
  'Which segments drive the biggest differences?',
  'Are there anomalies I should look at?',
];
const SAMPLE = [
  'Why did revenue drop in March 2025?',
  'Which region and channel combination changed the most between February and April?',
  'Is discounting related to revenue per order?',
];

export default function QuestionBar({ dataset, running, onAsk, onStop, showSuggestions }) {
  const [text, setText] = useState('');
  const suggestions = dataset?.name === 'sample-sales.csv' ? SAMPLE : GENERIC;

  const submit = (e) => {
    e.preventDefault();
    if (text.trim().length >= 3 && !running) onAsk(text.trim());
  };

  return (
    <div>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="question" className="sr-only">Your question</label>
        <input id="question" value={text} onChange={(e) => setText(e.target.value)} disabled={!dataset}
          placeholder={dataset ? 'Ask what you want to understand about this data' : 'Load a dataset to begin'}
          className="min-h-12 min-w-0 flex-1 rounded-lg border border-line bg-white px-4 py-3 text-base placeholder:text-muted/70 disabled:bg-white/60" />
        {running ? (
          <button type="button" onClick={onStop} className="min-h-12 rounded-lg border border-ink px-5 py-3 text-sm font-semibold sm:min-h-0">Stop</button>
        ) : (
          <button type="submit" disabled={!dataset || text.trim().length < 3} className="min-h-12 rounded-lg bg-ultra px-5 py-3 text-sm font-semibold text-white disabled:opacity-40 sm:min-h-0">Investigate</button>
        )}
      </form>
      {dataset && showSuggestions && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <li key={s}>
              <button type="button" onClick={() => { setText(s); onAsk(s); }} className="rounded-full border border-line bg-white px-3 py-1.5 text-left text-xs text-muted transition hover:border-ultra hover:text-ultra">{s}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
