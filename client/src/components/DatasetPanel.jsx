import { useEffect, useRef, useState } from 'react';
import { addKnowledgeFile, addKnowledgeText, listKnowledge, loadSample, uploadDataset } from '../api.js';

const TYPE_LABEL = { number: 'number', date: 'date', category: 'category', text: 'text' };

export default function DatasetPanel({ dataset, onDataset, disabled }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sources, setSources] = useState([]);
  const [note, setNote] = useState('');
  const fileRef = useRef(null);
  const knowRef = useRef(null);

  const refreshSources = () => listKnowledge().then((d) => setSources(d.sources)).catch(() => {});
  useEffect(() => { refreshSources(); }, [dataset?.id]);

  async function guard(fn) {
    setBusy(true);
    setError('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const handleFile = (event, upload, onSuccess) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) guard(async () => onSuccess(await upload(file)));
  };
  const onFile = (event) => handleFile(event, uploadDataset, onDataset);
  const onKnowFile = (event) => handleFile(event, addKnowledgeFile, refreshSources);
  const saveNote = () => guard(async () => {
    await addKnowledgeText('pasted-notes', note);
    setNote('');
    await refreshSources();
  });

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="data-h">
        <h2 id="data-h" className="mb-3 text-sm font-semibold">Dataset</h2>
        <div className="flex flex-col gap-2">
          <input ref={fileRef} type="file" accept=".csv,.tsv,.json" className="sr-only" onChange={onFile} />
          <button type="button" disabled={busy || disabled} onClick={() => fileRef.current.click()}
            className="rounded-lg border border-dashed border-ultra/50 bg-white px-4 py-4 text-left text-sm font-medium text-ultra transition hover:bg-ultra-soft disabled:opacity-50">
            Upload a CSV or JSON file
            <span className="mt-0.5 block text-xs font-normal text-muted">Up to 4 MB on Vercel, 25 MB locally</span>
          </button>
          <button type="button" disabled={busy || disabled} onClick={() => guard(async () => onDataset(await loadSample()))}
            className="rounded-lg px-4 py-2 text-left text-sm text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50">
            Use the sample sales data instead
          </button>
        </div>
        {busy && <p className="breathe mt-3 text-xs text-muted" role="status">Working…</p>}
        {error && <p className="mt-3 rounded-md bg-warn/10 px-3 py-2 text-xs text-warn" role="alert">{error}</p>}
      </section>

      {dataset && (
        <details open={typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches} className="group">
          <summary className="cursor-pointer list-none">
            <h2 className="text-sm font-semibold">{dataset.name}</h2>
            <p className="text-xs text-muted">
              {dataset.profile.rowCount.toLocaleString()} rows, {dataset.profile.columns.length} columns
              <span className="ml-2 underline underline-offset-2 group-open:hidden">Show columns</span>
              <span className="ml-2 hidden underline underline-offset-2 group-open:inline">Hide columns</span>
            </p>
          </summary>
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-white text-sm">
            {dataset.profile.columns.map((c) => (
              <li key={c.name} className="flex items-baseline justify-between gap-3 px-3 py-2">
                <span className="truncate font-medium">{c.name}</span>
                <span className="shrink-0 text-xs text-muted">{TYPE_LABEL[c.type]}{c.nulls ? `, ${c.nulls} empty` : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <section aria-labelledby="know-h">
        <h2 id="know-h" className="text-sm font-semibold">Business notes</h2>
        <p className="mb-3 text-xs text-muted">Launch dates, outages, data dictionaries. The agent searches these for context.</p>
        {sources.length > 0 && (
          <ul className="mb-3 flex flex-col gap-1 text-xs">
            {sources.map((s) => (
              <li key={s.source} className="flex items-baseline justify-between gap-3 rounded-md border border-line bg-white px-3 py-1.5">
                <span className="min-w-0 truncate">{s.source}</span><span className="shrink-0 whitespace-nowrap text-muted">{s.chunks} passages</span>
              </li>
            ))}
          </ul>
        )}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Paste a note, for example: Checkout was redesigned on 12 May."
          className="w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-sm placeholder:text-muted/70" aria-label="Business note" />
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={busy || !note.trim()} onClick={saveNote} className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Save note</button>
          <input ref={knowRef} type="file" accept=".md,.txt" className="sr-only" onChange={onKnowFile} />
          <button type="button" disabled={busy} onClick={() => knowRef.current.click()} className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-medium">Upload .md or .txt</button>
        </div>
      </section>
    </div>
  );
}
