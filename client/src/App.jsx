import { useEffect, useState } from 'react';
import DatasetPanel from './components/DatasetPanel.jsx';
import QuestionBar from './components/QuestionBar.jsx';
import ReportPanel from './components/ReportPanel.jsx';
import TracePanel from './components/TracePanel.jsx';
import { useInvestigation } from './useInvestigation.js';

export default function App() {
  const [dataset, setDataset] = useState(null);
  const [history, setHistory] = useState([]);
  const [focusStep, setFocusStep] = useState(null);
  const { state, run, cancel, reset } = useInvestigation();

  // Each finished report becomes short-term memory for follow-up questions.
  useEffect(() => {
    if (state.report) setHistory((h) => [...h, { question: state.question, headline: state.report.headline }]);
  }, [state.report]); // eslint-disable-line react-hooks/exhaustive-deps

  const ask = (question) => {
    if (!dataset) return;
    setFocusStep(null);
    run(dataset.id, question, history);
  };

  const onDataset = (ds) => {
    reset();
    setHistory([]);
    setFocusStep(null);
    setDataset(ds);
  };

  const focus = (id) => {
    setFocusStep(null);
    requestAnimationFrame(() => setFocusStep(id));
  };

  const hasRun = state.running || state.steps.length > 0 || Boolean(state.report) || Boolean(state.error);

  return (
    <div className="min-h-screen min-w-0 lg:grid lg:grid-cols-[18.5rem_minmax(0,1fr)]">
      <aside className="border-b border-line bg-paper p-4 sm:p-5 lg:min-h-screen lg:border-b-0 lg:border-r lg:p-6">
        <h1 className="mb-5 text-xl font-bold leading-tight tracking-tight sm:mb-8">Data Investigation Agent</h1>
        <DatasetPanel dataset={dataset} onDataset={onDataset} disabled={state.running} />
      </aside>

      <main className="flex min-w-0 flex-col gap-6 p-4 sm:gap-8 sm:p-8">
        <div className="max-w-3xl">
          <QuestionBar dataset={dataset} running={state.running} onAsk={ask} onStop={cancel} showSuggestions={!hasRun} />
        </div>
        <div className="grid min-w-0 items-start gap-6 sm:gap-8 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <TracePanel state={state} focusStep={focusStep} />
          <ReportPanel state={state} onFollowUp={ask} onFocusStep={focus} />
        </div>
      </main>
    </div>
  );
}
