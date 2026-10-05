# Data Investigation Agent

An autonomous agent that investigates a dataset for you. Upload a CSV or JSON file, ask a question such as "why did revenue drop in March?", and the agent plans an investigation, runs its own queries and statistics, checks its work, and returns a report with the evidence behind every claim.

Built with React (Vite + Tailwind), Node.js (Express) and the Groq API.

## Quick start

You need Node.js 20 or newer and a free Groq API key from https://console.groq.com/keys.

```bash
npm run install:all
cp server/.env.example server/.env     # then paste your key into GROQ_API_KEY
npm run dev
```

Open http://localhost:5173, choose **Use the sample sales data instead**, and ask **Why did revenue drop in March 2025?**

The sample data has a planted cause: South-region online Electronics orders mostly disappear from 10 to 31 March, and the bundled business notes mention a checkout migration on 10 March. A good run finds the segment with `compare_periods` and then connects it to the note with `search_knowledge`.

Production mode: `npm run build && npm start` serves the built app and the API together on http://localhost:3001.

### Deploy to Vercel

Import the repository into Vercel with the project root set to the repository root. The included `vercel.json` builds the Vite client and routes `/api/*` to the Express function. Add `GROQ_API_KEY` in the Vercel project settings under **Settings → Environment Variables**, then redeploy. `GROQ_MODEL` is optional and defaults to `openai/gpt-oss-120b`.

The current dataset and vector stores are in memory, so uploaded data and notes can disappear when Vercel starts a new function instance. The vector file uses `/tmp` on Vercel, which is writable but temporary and not shared between instances. For persistent multi-user deployments, move datasets and knowledge memory to shared durable storage. Vercel Functions also impose a request-body size limit, so large dataset uploads may be rejected before they reach the app.

## How it works

```
React UI  --(upload)-->  Express  --> profile + load into an in-memory SQL table
   ^                         |
   |  server-sent events     v
   +------------------  Agent run
                          1. Recall   similar past investigations (vector memory)
                          2. Plan     hypotheses and steps (JSON mode)
                          3. Loop     think -> call tool -> observe (ReAct, up to 10 calls)
                          4. Report   structured JSON with cited evidence
                          5. Review   a critic checks every claim against the log
                          6. Revise   if the critic objects: more tool calls, new report
                          7. Remember store the finding for future runs
```

### Where each AI concept lives

| Concept                                                                        | File                                                                                                            |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Prompt engineering (planner, analyst, reporter, critic roles)                  | `server/src/agent/prompts.js`                                                                                   |
| Planning                                                                       | `agent.js`, the plan stage                                                                                      |
| Agent loop (ReAct) and function calling                                        | `server/src/agent/agent.js`, `tools/definitions.js`                                                             |
| Tools: SQL, stats, anomaly detection, period comparison, correlation, charts   | `server/src/tools/index.js`                                                                                     |
| Embeddings, vector search, RAG over business notes                             | `server/src/rag/`                                                                                               |
| Long-term memory (past investigations) and short-term memory (session history) | `rag/vectorStore.js`, `agent.js`, `client/src/App.jsx`                                                          |
| Structured output (JSON mode, normalized and validated)                        | `agent.js` (`jsonCall`, `normalizeReport`)                                                                      |
| Reflection and self-critique                                                   | `agent.js`, review and revise stages                                                                            |
| Streaming                                                                      | `routes/investigate.js` (SSE), `client/src/api.js`                                                              |
| Guardrails                                                                     | read-only SQL guard, step budget, row and output caps, tool errors returned to the model so it can self-correct |

### Tools the agent can call

`run_query`, `describe_column`, `detect_anomalies`, `compare_periods`, `correlate`, `make_chart`, `search_knowledge`.

## Configuration (`server/.env`)

| Variable              | Default               | Notes                                                                                                                                                          |
| --------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GROQ_API_KEY`        | none                  | Required                                                                                                                                                       |
| `GROQ_MODEL`          | `openai/gpt-oss-120b` | Any Groq model that supports tool calling                                                                                                                      |
| `MAX_AGENT_STEPS`     | `10`                  | Tool-call budget per investigation                                                                                                                             |
| `EMBEDDINGS_PROVIDER` | `transformers`        | `transformers` runs MiniLM locally (about 25 MB download on first use). It falls back to `hash` automatically if unavailable. Groq has no embeddings endpoint. |
| `PORT`                | `3001`                |                                                                                                                                                                |

## Adding a tool

1. Add its schema to `server/src/tools/definitions.js`.
2. Add a handler with the same name in `server/src/tools/index.js`. Return `{ result, summary }`, and throw `ToolError` with a helpful message for bad input.
3. Add a label in `client/src/components/TracePanel.jsx` (`TOOL_LABEL`).

## Tests

```bash
npm test
```

Covers profiling, every tool, the SQL guard, the full agent loop (plan, tools, critic revision, memory recall, cancellation) using a scripted stand-in for the model, and the streaming HTTP endpoint. They do not call Groq, so no API key is needed.

## Notes and limits

- Datasets live in server memory and are lost on restart. The vector memory is saved to `server/.data/vectors.json`.
- SQL runs on AlaSQL in-process behind a read-only guard (single SELECT, forbidden keywords). That is fine for local use. If you expose this to untrusted users, run queries in a separate sandboxed process.
- Column names are lowercased and snake_cased on upload. Names AlaSQL treats as keywords (for example `value`, `count`) get a trailing underscore.
- Dates are normalized to `YYYY-MM-DD`. Ambiguous `dd/mm/yyyy` values are read day-first.
- Findings are only as good as the data and the notes you provide. Treat the report as a well-evidenced lead, not a verdict, especially where confidence is below high.
- Free Groq tiers have rate limits. If you see a rate-limit message, wait a minute and retry.
