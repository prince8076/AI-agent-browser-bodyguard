// explainer.js — turns the extension's deterministic findings into human-readable
// explanations via whichever AI provider the user selected (see ai-providers.js).
//
// The provider only ever receives a compact, per-site summary the extension
// already computed locally — never raw browsing history.
//
// Expected findings shape:
// {
//   hostname: "example.com",
//   score: 62,
//   aiEndpoints: [{ domain: "chat.example.ai", requests: 14 }],
//   trackersBlocked: 23,
//   fingerprintHits: [{ api: "canvas", count: 5 }, { api: "audio", count: 2 }]
// }
//
// provider: one of AI_PROVIDERS (see ai-providers.js)
// settings: the stored bodyguard.ai settings ({model, apiKey, ...})

const EXPLAINER_SYSTEM = [
  'You are the explainer inside a privacy-focused browser extension.',
  'You receive a short factual summary of what a website did (AI endpoints',
  'contacted, trackers blocked, fingerprinting attempts).',
  'Rules:',
  '- Reply with at most 3 short bullet points, plain language, no jargon.',
  '- Say what the site did, why it matters, and one concrete action.',
  '- Never invent facts not present in the summary.',
  '- Never ask follow-up questions.',
].join('\n');

const CLASSIFIER_SYSTEM = [
  'You classify third-party network endpoints for a privacy extension.',
  'Given a domain and the page context, reply with exactly one word:',
  'AI, TRACKER, ANALYTICS, CDN, or UNKNOWN.',
  'No explanation, no punctuation, just the word.',
].join('\n');

function summarizeFindings(f) {
  const lines = [`Site: ${f.hostname}`, `Privacy score: ${f.score}/100`];
  if (f.aiEndpoints && f.aiEndpoints.length) {
    const eps = f.aiEndpoints.map((e) => `${e.domain} (${e.requests} requests)`).join(', ');
    lines.push(`AI endpoints contacted: ${eps}`);
  } else {
    lines.push('AI endpoints contacted: none detected');
  }
  lines.push(`Trackers/ad requests blocked: ${f.trackersBlocked || 0}`);
  if (f.fingerprintHits && f.fingerprintHits.length) {
    const fp = f.fingerprintHits.map((h) => `${h.api} x${h.count}`).join(', ');
    lines.push(`Fingerprinting attempts: ${fp}`);
  } else {
    lines.push('Fingerprinting attempts: none detected');
  }
  return lines.join('\n');
}

/**
 * Explain a site's privacy findings in plain language.
 * @returns {Promise<string>} bullet-point explanation
 */
async function explainSite(findings, provider, settings) {
  const user = `Explain this privacy report for a non-technical user:\n\n${summarizeFindings(findings)}`;
  return provider.chat(
    settings,
    [
      { role: 'system', content: EXPLAINER_SYSTEM },
      { role: 'user', content: user },
    ],
    { maxTokens: 350 }
  );
}

/**
 * Classify an unknown third-party domain seen on a page.
 * @returns {Promise<string>} one of AI, TRACKER, ANALYTICS, CDN, UNKNOWN
 */
async function classifyEndpoint(domain, pageHostname, provider, settings) {
  const user = `Domain: ${domain}\nSeen on page: ${pageHostname}`;
  const raw = await provider.chat(
    settings,
    [
      { role: 'system', content: CLASSIFIER_SYSTEM },
      { role: 'user', content: user },
    ],
    { maxTokens: 20 }
  );
  const word = raw.toUpperCase().replace(/[^A-Z]/g, '');
  return ['AI', 'TRACKER', 'ANALYTICS', 'CDN'].includes(word) ? word : 'UNKNOWN';
}
