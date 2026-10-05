async function parse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function uploadDataset(file) {
  return upload('/api/datasets', file);
}

function upload(url, file) {
  const form = new FormData();
  form.append('file', file);
  return fetch(url, { method: 'POST', body: form }).then(parse);
}

export const loadSample = () => fetch('/api/datasets/sample', { method: 'POST' }).then(parse);

export const listKnowledge = () => fetch('/api/knowledge').then(parse);

export const addKnowledgeFile = (file) => upload('/api/knowledge', file);

export const addKnowledgeText = (title, text) =>
  fetch('/api/knowledge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, text }) }).then(parse);

/** Reads the server-sent event stream from POST /api/investigate. */
export async function streamInvestigation(body, onEvent, signal) {
  const res = await fetch('/api/investigate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) await parse(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop();
    for (const block of blocks) {
      const line = block.split('\n').find((l) => l.startsWith('data: '));
      if (line) onEvent(JSON.parse(line.slice(6)));
    }
  }
}
