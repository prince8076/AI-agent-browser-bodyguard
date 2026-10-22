// popup.js — renders the per-tab privacy report.
// Provides getCurrentFindings() used by popup-ai.js for local-AI explanations.

function el(id) {
  return document.getElementById(id);
}

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ? tab.id : -1;
}

/** Findings shape consumed by explainer.js */
async function getCurrentFindings() {
  const tabId = await activeTabId();
  const r = await chrome.runtime.sendMessage({ type: 'bbg-report', tabId });
  return {
    hostname: r.hostname,
    score: r.score,
    aiEndpoints: r.aiEndpoints,
    trackersBlocked: r.trackersBlocked,
    fingerprintHits: r.fingerprintHits,
  };
}

function verdictFor(score) {
  if (score >= 80) return 'Clean — no AI or tracking surprises here.';
  if (score >= 50) return 'Worth a look — something is phoning home.';
  return 'Heavy surveillance — AI/tracking activity detected.';
}

function render(report) {
  el('site-host').textContent = report.hostname || '(unknown tab)';
  el('score-num').textContent = report.score;
  const ring = el('score-ring-fg');
  const C = 2 * Math.PI * 44;
  ring.style.strokeDasharray = String(C);
  ring.style.strokeDashoffset = String(C * (1 - report.score / 100));
  ring.style.stroke = report.score >= 80 ? '#00e5ff' : report.score >= 50 ? '#8b5cf6' : '#ff5470';
  el('verdict').textContent = verdictFor(report.score);

  // AI endpoints
  const list = el('ai-list');
  list.innerHTML = '';
  el('ai-count').textContent = String(report.aiEndpoints.length);
  el('ai-empty').hidden = report.aiEndpoints.length > 0;
  for (const ep of report.aiEndpoints) {
    const li = document.createElement('li');
    const left = document.createElement('span');
    left.textContent = ep.name;
    const cat = document.createElement('span');
    cat.className = 'cat';
    cat.textContent = ep.category.toUpperCase();
    left.appendChild(cat);
    const req = document.createElement('span');
    req.className = 'req';
    req.textContent = `${ep.requests} req`;
    li.appendChild(left);
    li.appendChild(req);
    list.appendChild(li);
  }

  // Stats
  el('stat-trackers').textContent = String(report.trackersBlocked);
  const fpTotal = report.fingerprintHits.reduce((n, f) => n + f.count, 0);
  el('stat-fp').textContent = String(fpTotal);

  // Deductions
  const why = el('why-card');
  const dl = el('deduct-list');
  dl.innerHTML = '';
  why.hidden = report.deductions.length === 0;
  for (const d of report.deductions) {
    const li = document.createElement('li');
    li.textContent = d;
    dl.appendChild(li);
  }

  // Master toggle
  el('enabled-toggle').checked = report.enabled;
}

async function initPopup() {
  try {
    render(await getCurrentFindings());
  } catch (e) {
    el('site-host').textContent = 'Could not load report';
  }

  el('enabled-toggle').addEventListener('change', async (e) => {
    await chrome.runtime.sendMessage({ type: 'bbg-toggle', enabled: e.target.checked });
    render(await getCurrentFindings());
  });

  // AI panel (provider select, key entry, consent) is fully owned by popup-ai.js.
}

document.addEventListener('DOMContentLoaded', initPopup);
