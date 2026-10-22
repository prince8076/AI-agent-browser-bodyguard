// ollama-client.js
// Talks to a local Ollama instance (default http://localhost:11434).
// Nothing leaves the user's machine: no API keys, no cloud, no telemetry.
//
// Manifest requirement (MV3):
//   "host_permissions": ["http://localhost:11434/*"]

const OLLAMA_BASE_URL = 'http://localhost:11434';

// Preferred small models, in order. Any installed model works as a fallback.
const PREFERRED_MODELS = [
  'llama3.1:8b',
  'qwen2.5:7b',
  'gemma2:9b',
  'llama3.1',
  'qwen2.5',
  'gemma2',
];

/**
 * Check whether Ollama is reachable and which models are installed.
 * @returns {Promise<{available: boolean, models: string[], reason?: string}>}
 */
async function ollamaStatus() {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!res.ok) return { available: false, models: [], reason: `HTTP ${res.status}` };
    const data = await res.json();
    const models = (data.models || []).map((m) => m.name).filter(Boolean);
    return { available: true, models };
  } catch (err) {
    return { available: false, models: [], reason: String((err && err.message) || err) };
  }
}

/**
 * Pick the best installed model: first preferred match, else first available.
 * @returns {string|null}
 */
function pickModel(models) {
  for (const pref of PREFERRED_MODELS) {
    const hit = models.find((m) => m === pref || m.startsWith(pref + ':'));
    if (hit) return hit;
  }
  return models.length ? models[0] : null;
}

/**
 * Non-streaming chat completion against the local model.
 */
async function ollamaChat(model, messages, { timeoutMs = 60000, maxTokens = 350 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { temperature: 0.2, num_predict: maxTokens },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Ollama responded with HTTP ${res.status}`);
    const data = await res.json();
    return ((data.message && data.message.content) || '').trim();
  } finally {
    clearTimeout(timer);
  }
}
