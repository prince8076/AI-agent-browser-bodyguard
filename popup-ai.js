// popup-ai.js
// Wires the "Explain with local AI" panel into the extension popup.
// Include after ollama-client.js and explainer.js in popup.html.
//
// Expected popup markup (ids):
//   #ai-panel, #ai-status, #ai-explain-btn, #ai-output, #ai-model-label
//
// Settings are stored locally: { mode: 'off' | 'local', model: string | null }
// Cloud AI is intentionally NOT implemented here — it stays opt-in by design
// and needs its own explicit consent screen before any key is stored.

const AI_SETTINGS_KEY = 'bodyguard.ai';

async function getAISettings() {
  const stored = await chrome.storage.local.get(AI_SETTINGS_KEY);
  return stored[AI_SETTINGS_KEY] || { mode: 'off', model: null };
}

async function setAISettings(patch) {
  const current = await getAISettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [AI_SETTINGS_KEY]: next });
  return next;
}

function setStatus(text, kind = '') {
  const el = document.getElementById('ai-status');
  if (!el) return;
  el.textContent = text;
  el.dataset.kind = kind; // style via CSS: [data-kind="ok"|"warn"|"error"]
}

function renderOutput(text) {
  const el = document.getElementById('ai-output');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
}

async function refreshAIPanel() {
  const settings = await getAISettings();
  const btn = document.getElementById('ai-explain-btn');
  if (settings.mode !== 'local') {
    setStatus('Local AI is off. Enable it in settings to get plain-language explanations.', 'warn');
    if (btn) btn.disabled = true;
    return;
  }
  setStatus('Checking for local AI…');
  if (btn) btn.disabled = true;
  const status = await ollamaStatus();
  if (!status.available) {
    setStatus('Ollama not found. Install it and run: ollama pull llama3.1:8b', 'error');
    return;
  }
  const model = settings.model && status.models.includes(settings.model)
    ? settings.model
    : pickModel(status.models);
  if (!model) {
    setStatus('Ollama is running but no models are installed. Run: ollama pull llama3.1:8b', 'error');
    return;
  }
  await setAISettings({ model });
  const label = document.getElementById('ai-model-label');
  if (label) label.textContent = model;
  setStatus('Local AI ready. Nothing leaves this device.', 'ok');
  if (btn) btn.disabled = false;
}

async function onExplainClicked() {
  const btn = document.getElementById('ai-explain-btn');
  const settings = await getAISettings();
  if (!settings.model) return;
  if (btn) btn.disabled = true;
  setStatus('Explaining…');
  try {
    // getCurrentFindings() is implemented by the popup: it reads the
    // per-tab data the service worker already collected (score, blocked
    // requests, AI endpoints, fingerprint hits).
    const findings = await getCurrentFindings();
    const text = await explainSite(findings, settings.model);
    renderOutput(text || 'The local model returned an empty explanation.');
    setStatus('Done.', 'ok');
  } catch (err) {
    setStatus(`Explanation failed: ${(err && err.message) || err}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  refreshAIPanel();
  const btn = document.getElementById('ai-explain-btn');
  if (btn) btn.addEventListener('click', onExplainClicked);
});
