// popup-ai.js — provider-aware AI panel wiring for the popup.
// Include after ollama-client.js, ai-providers.js and explainer.js in popup.html.
//
// Expected popup markup (ids):
//   #ai-panel, #ai-provider (select), #ai-status, #ai-model-label,
//   #ai-explain-btn, #ai-output, #ai-enabled-toggle,
//   #nvidia-key-row, #nvidia-key (input), #nvidia-save (button),
//   #nvidia-consent (checkbox), #nvidia-key-state
//
// Settings shape (chrome.storage.local, key "bodyguard.ai"):
//   { enabled, provider, model, apiKey, nvidiaConsent }
// Cloud providers stay strictly opt-in: explanations are gated behind the
// explicit consent checkbox, and only the compact findings summary is sent.

const AI_SETTINGS_KEY = 'bodyguard.ai';

function defaultAISettings() {
  return { enabled: false, provider: 'ollama-local', model: null, apiKey: '', nvidiaConsent: false };
}

async function getAISettings() {
  const stored = await chrome.storage.local.get(AI_SETTINGS_KEY);
  const raw = stored[AI_SETTINGS_KEY] || {};
  const s = { ...defaultAISettings(), ...raw };
  // Migrate v0.1 shape {mode: 'local'|'off', model}
  if ('mode' in raw && !('enabled' in raw)) {
    s.enabled = raw.mode === 'local';
    s.provider = 'ollama-local';
  }
  if (!AI_PROVIDERS[s.provider]) s.provider = 'ollama-local';
  return s;
}

async function setAISettings(patch) {
  const next = { ...(await getAISettings()), ...patch };
  await chrome.storage.local.set({ [AI_SETTINGS_KEY]: next });
  return next;
}

function aiEl(id) {
  return document.getElementById(id);
}

function setStatus(text, kind = '') {
  const el = aiEl('ai-status');
  if (!el) return;
  el.textContent = text;
  el.dataset.kind = kind; // styled via CSS: [data-kind="ok"|"warn"|"error"]
}

function renderOutput(text) {
  const el = aiEl('ai-output');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
}

async function refreshAIPanel() {
  const settings = await getAISettings();
  const provider = getProvider(settings.provider);
  const btn = aiEl('ai-explain-btn');

  aiEl('ai-provider').value = provider.id;
  aiEl('ai-enabled-toggle').checked = settings.enabled;
  aiEl('nvidia-key-row').hidden = provider.id !== 'nvidia';
  if (btn) btn.disabled = true;

  if (!settings.enabled) {
    setStatus('AI explanations are off. Enable them to get plain-language reports.', 'warn');
    return;
  }

  if (provider.needsKey) {
    const hasKey = !!settings.apiKey;
    aiEl('nvidia-consent').checked = settings.nvidiaConsent === true;
    aiEl('nvidia-key').value = '';
    aiEl('nvidia-key').placeholder = hasKey
      ? 'Key saved — enter a new one to replace it'
      : 'nvapi-… key from build.nvidia.com';
    aiEl('nvidia-key-state').textContent = hasKey ? 'Key saved ✓' : 'No key saved';
  }

  setStatus(`Checking ${provider.label}…`);
  const check = await provider.check(settings);
  if (!check.ok) {
    setStatus(check.reason || 'Provider unavailable.', 'error');
    return;
  }
  if (check.model && check.model !== settings.model) {
    await setAISettings({ model: check.model });
  }
  aiEl('ai-model-label').textContent = check.model || provider.defaultModel || '—';

  if (provider.needsKey && settings.nvidiaConsent !== true) {
    setStatus('Please tick the consent box to confirm you understand summaries leave your device.', 'warn');
    return;
  }
  setStatus(check.note || 'Ready.', 'ok');
  if (btn) btn.disabled = false;
}

async function onExplainClicked() {
  const btn = aiEl('ai-explain-btn');
  const settings = await getAISettings();
  const provider = getProvider(settings.provider);
  if (provider.needsKey && settings.nvidiaConsent !== true) return;
  if (btn) btn.disabled = true;
  setStatus(`Explaining via ${provider.label}…`);
  try {
    // getCurrentFindings() is implemented by popup.js: it reads the per-tab
    // data the service worker already collected (score, blocked requests,
    // AI endpoints, fingerprint hits).
    const findings = await getCurrentFindings();
    const text = await explainSite(findings, provider, settings);
    renderOutput(text || 'The model returned an empty explanation.');
    setStatus('Done.', 'ok');
  } catch (err) {
    setStatus(`Explanation failed: ${(err && err.message) || err}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function initAIPanel() {
  refreshAIPanel();

  aiEl('ai-enabled-toggle').addEventListener('change', async (e) => {
    await setAISettings({ enabled: e.target.checked });
    refreshAIPanel();
  });

  aiEl('ai-provider').addEventListener('change', async (e) => {
    // Switching provider resets the picked model so it gets re-resolved.
    await setAISettings({ provider: e.target.value, model: null });
    refreshAIPanel();
  });

  aiEl('nvidia-save').addEventListener('click', async () => {
    const input = aiEl('nvidia-key');
    const value = input.value.trim();
    if (value) {
      await setAISettings({ apiKey: value });
      input.value = '';
    }
    refreshAIPanel();
  });

  aiEl('nvidia-consent').addEventListener('change', async (e) => {
    await setAISettings({ nvidiaConsent: e.target.checked });
    refreshAIPanel();
  });

  const btn = aiEl('ai-explain-btn');
  if (btn) btn.addEventListener('click', onExplainClicked);
}

document.addEventListener('DOMContentLoaded', initAIPanel);
