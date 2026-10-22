// ai-providers.js — AI provider abstraction for explanations.
//
// Every provider implements:
//   {
//     id, label, needsKey, isLocal, defaultModel, keyUrl,
//     check(settings) -> Promise<{ok, reason?, model?, note?}>,
//     chat(settings, messages, opts) -> Promise<string>
//   }
//
// Design rule: local providers are default and need no consent.
// Cloud providers are strictly opt-in: the popup gates them behind an
// explicit "I understand summaries leave my device" checkbox, and only a
// short findings summary (hostname + counts, never raw history) is sent.

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
// Verified working end-to-end on the free tier (2026-10-23).
const NVIDIA_DEFAULT_MODEL = 'openai/gpt-oss-20b';

/**
 * OpenAI-compatible /v1/chat/completions call (NVIDIA NIM, Groq, etc.).
 */
async function openaiCompatibleChat(
  baseUrl,
  apiKey,
  model,
  messages,
  { timeoutMs = 60000, maxTokens = 350 } = {}
) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${body ? ': ' + body.slice(0, 140) : ''}`);
    }
    const data = await res.json();
    const content =
      data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : '';
    return (content || '').trim();
  } finally {
    clearTimeout(timer);
  }
}

const AI_PROVIDERS = {
  'ollama-local': {
    id: 'ollama-local',
    label: 'Local — Ollama',
    needsKey: false,
    isLocal: true,
    defaultModel: null,
    async check(settings) {
      const s = await ollamaStatus();
      if (!s.available) {
        return { ok: false, reason: 'Ollama not running. Install it, then run: ollama pull llama3.1:8b' };
      }
      const model =
        settings.model && s.models.includes(settings.model)
          ? settings.model
          : pickModel(s.models);
      if (!model) {
        return { ok: false, reason: 'Ollama is running but no models are installed. Run: ollama pull llama3.1:8b' };
      }
      return { ok: true, model, note: 'Private — nothing leaves this device.' };
    },
    chat(settings, messages, opts) {
      return ollamaChat(settings.model, messages, opts);
    },
  },

  nvidia: {
    id: 'nvidia',
    label: 'NVIDIA free tier',
    needsKey: true,
    isLocal: false,
    defaultModel: NVIDIA_DEFAULT_MODEL,
    keyUrl: 'https://build.nvidia.com',
    async check(settings) {
      if (!settings.apiKey) {
        return { ok: false, reason: 'No API key set. Get a free one at build.nvidia.com' };
      }
      try {
        const res = await fetch(`${NVIDIA_BASE_URL}/models`, {
          headers: { Authorization: `Bearer ${settings.apiKey}` },
        });
        if (res.status === 401 || res.status === 403) {
          return { ok: false, reason: 'Key rejected (HTTP ' + res.status + '). Check it at build.nvidia.com' };
        }
        if (!res.ok) {
          return { ok: false, reason: `NVIDIA API returned HTTP ${res.status}` };
        }
        return {
          ok: true,
          model: settings.model || NVIDIA_DEFAULT_MODEL,
          note: 'Cloud — short summaries leave this device. Free tier, rate-limited.',
        };
      } catch (e) {
        return { ok: false, reason: 'Could not reach the NVIDIA API: ' + ((e && e.message) || e) };
      }
    },
    chat(settings, messages, opts) {
      return openaiCompatibleChat(
        NVIDIA_BASE_URL,
        settings.apiKey,
        settings.model || NVIDIA_DEFAULT_MODEL,
        messages,
        opts
      );
    },
  },
};

function getProvider(id) {
  return AI_PROVIDERS[id] || AI_PROVIDERS['ollama-local'];
}
