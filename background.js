// background.js — MV3 service worker for AI Agent Browser Bodyguard.
//
// What it does:
//  - Observes outgoing requests (webRequest, non-blocking) and records, per tab:
//      * contacts to known AI service endpoints (assets/ai-endpoints.json)
//      * requests matching the NetShield blocklist domains (assets/blocked-domains.json)
//  - Receives fingerprinting-probe hits from the MAIN-world content script.
//  - Scores every page 0-100 with an explainable deductions list.
//  - Hardens WebRTC IP handling + hyperlink auditing via chrome.privacy.
//
// Everything stays in memory + chrome.storage.local. No network calls except
// the optional local-Ollama explanation (user opt-in, localhost only).

'use strict';

const ASSETS = {
  aiEndpoints: 'assets/ai-endpoints.json',
  blockedDomains: 'assets/blocked-domains.json',
};

// Scoring weights. Kept small and explainable on purpose.
const SCORE = {
  aiPerDomain: 10,
  aiCap: 30,
  fpPerApi: 8,
  fpCap: 24,
  trackerEach: 2,
  trackerCap: 20,
};

const rt = {
  aiList: [], // [{domain, name, category}]
  blocked: new Set(), // blocklist domains
  tabs: new Map(), // tabId -> {hostname, aiHits: Map, trackerHits, fpHits: Map}
  hostnames: new Map(), // tabId -> hostname
  enabled: true,
};

function newReport(hostname) {
  return { hostname: hostname || '', aiHits: new Map(), trackerHits: 0, fpHits: new Map() };
}

function reportFor(tabId) {
  let r = rt.tabs.get(tabId);
  if (!r) {
    r = newReport(rt.hostnames.get(tabId));
    rt.tabs.set(tabId, r);
  }
  return r;
}

function domainOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function matchDomain(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}

function findAiEndpoint(host) {
  for (const ep of rt.aiList) {
    if (matchDomain(host, ep.domain)) return ep;
  }
  return null;
}

function isBlocked(host) {
  if (rt.blocked.has(host)) return true;
  const parts = host.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    if (rt.blocked.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

function scoreReport(rep) {
  let score = 100;
  const deductions = [];

  const aiEndpoints = [...rep.aiHits.entries()].map(([domain, requests]) => {
    const ep = rt.aiList.find((e) => e.domain === domain);
    return { domain, name: ep ? ep.name : domain, category: ep ? ep.category : 'ai', requests };
  });
  if (aiEndpoints.length) {
    const d = Math.min(SCORE.aiPerDomain * aiEndpoints.length, SCORE.aiCap);
    score -= d;
    deductions.push(
      `${aiEndpoints.length} AI service endpoint${aiEndpoints.length > 1 ? 's' : ''} contacted (−${d})`
    );
  }

  const fingerprintHits = [...rep.fpHits.entries()].map(([api, count]) => ({ api, count }));
  if (fingerprintHits.length) {
    const d = Math.min(SCORE.fpPerApi * fingerprintHits.length, SCORE.fpCap);
    score -= d;
    deductions.push(`fingerprinting via ${fingerprintHits.map((f) => f.api).join(', ')} (−${d})`);
  }

  if (rep.trackerHits > 0) {
    const d = Math.min(SCORE.trackerEach * rep.trackerHits, SCORE.trackerCap);
    score -= d;
    deductions.push(
      `${rep.trackerHits} tracker/ad request${rep.trackerHits > 1 ? 's' : ''} matched blocklist (−${d})`
    );
  }

  return {
    hostname: rep.hostname,
    score: Math.max(0, score),
    deductions,
    aiEndpoints,
    trackersBlocked: rep.trackerHits,
    fingerprintHits,
    enabled: rt.enabled,
  };
}

async function init() {
  const [ai, blocked, stored] = await Promise.all([
    fetch(chrome.runtime.getURL(ASSETS.aiEndpoints)).then((r) => r.json()),
    fetch(chrome.runtime.getURL(ASSETS.blockedDomains)).then((r) => r.json()),
    chrome.storage.local.get('bbg.enabled'),
  ]);
  rt.aiList = ai.endpoints || [];
  for (const d of blocked.domains || []) rt.blocked.add(d);
  rt.enabled = stored['bbg.enabled'] !== false;

  // Best-effort privacy hardening (needs the "privacy" permission).
  try {
    await chrome.privacy.network.webRTCIPHandlingPolicy.set({
      value: 'default_public_interface_only',
    });
    await chrome.privacy.network.hyperlinkAuditingEnabled.set({ value: false });
    await chrome.privacy.network.networkPredictionEnabled.set({ value: false });
  } catch (e) {
    console.warn('[bbg] privacy hardening failed:', e);
  }

  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.status === 'loading' && tab.url) {
      const host = domainOf(tab.url);
      rt.hostnames.set(tabId, host);
      rt.tabs.set(tabId, newReport(host)); // fresh report per navigation
    }
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    rt.tabs.delete(tabId);
    rt.hostnames.delete(tabId);
  });

  // Passive observation only — blocking is handled by declarativeNetRequest.
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (!rt.enabled || details.tabId < 0) return;
      const host = domainOf(details.url);
      if (!host) return;
      const rep = reportFor(details.tabId);
      if (!rep.hostname) rep.hostname = rt.hostnames.get(details.tabId) || host;
      const ep = findAiEndpoint(host);
      if (ep) {
        rep.aiHits.set(ep.domain, (rep.aiHits.get(ep.domain) || 0) + 1);
      } else if (isBlocked(host)) {
        rep.trackerHits += 1;
      }
    },
    { urls: ['<all_urls>'] }
  );

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
      if (msg.type === 'bbg-fp' && sender.tab && sender.tab.id >= 0) {
        const rep = reportFor(sender.tab.id);
        for (const [api, n] of Object.entries(msg.hits || {})) {
          rep.fpHits.set(api, (rep.fpHits.get(api) || 0) + Number(n));
        }
        sendResponse({ ok: true });
      } else if (msg.type === 'bbg-report') {
        sendResponse(scoreReport(reportFor(msg.tabId)));
      } else if (msg.type === 'bbg-toggle') {
        rt.enabled = !!msg.enabled;
        await chrome.storage.local.set({ 'bbg.enabled': rt.enabled });
        sendResponse({ ok: true, enabled: rt.enabled });
      } else if (msg.type === 'bbg-enabled') {
        sendResponse({ enabled: rt.enabled });
      }
    })();
    return true; // async response
  });
}

init().catch((e) => console.error('[bbg] init failed:', e));
