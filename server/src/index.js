import { config } from './config.js';
import app from './app.js';

app.listen(config.port, () => {
  console.log(`Data Investigation Agent API on http://localhost:${config.port}`);
  if (!config.groqApiKey) console.warn('GROQ_API_KEY is not set. Add it to server/.env before running investigations.');
});
