import { useCallback, useReducer, useRef } from 'react';
import { streamInvestigation } from './api.js';

const initial = { running: false, phase: null, question: '', memory: null, plan: null, steps: [], charts: [], critique: null, report: null, error: null };

function reducer(state, ev) {
  switch (ev.type) {
    case 'start': return { ...initial, running: true, question: ev.question };
    case 'status': return { ...state, phase: ev.phase };
    case 'memory': return { ...state, memory: ev.matches };
    case 'plan': return { ...state, plan: ev };
    case 'step': return { ...state, steps: [...state.steps, { id: ev.id, tool: ev.tool, args: ev.args, thought: ev.thought, status: 'running' }] };
    case 'observation':
      return { ...state, steps: state.steps.map((s) => (s.id === ev.id ? { ...s, status: ev.ok ? 'done' : 'failed', summary: ev.summary, preview: ev.preview } : s)) };
    case 'chart': return { ...state, charts: [...state.charts, ev.spec] };
    case 'critique': return { ...state, critique: ev };
    case 'report': return { ...state, report: ev.report };
    case 'error': return { ...state, error: ev.message };
    case 'finish': return { ...state, running: false, phase: null };
    case 'reset': return initial;
    default: return state;
  }
}

export function useInvestigation() {
  const [state, dispatch] = useReducer(reducer, initial);
  const controller = useRef(null);

  const run = useCallback(async (datasetId, question, history) => {
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    dispatch({ type: 'start', question });
    try {
      await streamInvestigation({ datasetId, question, history }, (ev) => dispatch(ev), ac.signal);
    } catch (err) {
      if (err.name !== 'AbortError') dispatch({ type: 'error', message: err.message });
    } finally {
      // A newer run may have replaced this one; only the current run may mark itself finished.
      if (controller.current === ac) dispatch({ type: 'finish' });
    }
  }, []);

  const cancel = useCallback(() => controller.current?.abort(), []);
  const reset = useCallback(() => { controller.current?.abort(); dispatch({ type: 'reset' }); }, []);
  return { state, run, cancel, reset };
}
