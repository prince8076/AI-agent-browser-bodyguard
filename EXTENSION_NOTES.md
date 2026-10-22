# EXTENSION_NOTES.md — AI Agent Browser Bodyguard

## Manual testing checklist (Chrome)

1. `pip install pillow && python icons/make-icons.py`, then load unpacked.
2. Visit a news site → popup should show trackers blocked > 0 and a score < 100
   with deductions listed.
3. Visit `chatgpt.com` or `claude.ai` → "AI services contacted" should list it.
4. Open DevTools console on any page and run
   `document.createElement('canvas').toDataURL()` → fingerprint attempts
   counter should increment within ~3 seconds.
5. Toggle the master switch off → counters freeze; on → fresh report per navigation.
6. With Ollama running (`ollama pull llama3.1:8b`), tick "Enable AI
   explanations" with the "Local — Ollama" provider → "Explain this site"
   returns 3 plain-language bullets.
7. NVIDIA provider: pick "NVIDIA free tier", paste a key from build.nvidia.com,
   save → status shows "Key saved ✓". "Explain this site" stays disabled until
   the consent box is ticked. With consent, explanation works via
   `meta/llama-3.1-8b-instruct`. A bad key shows "Key rejected (HTTP 401/403)".
8. Reload the extension with old v0.1 settings (`{mode:'local'}`) present →
   settings migrate to `{enabled:true, provider:'ollama-local'}`.

## Known limitations

- **Scores are heuristic.** The AI-endpoint list is curated and will miss new
  services; fingerprinting detection covers canvas/WebGL/audio probes only.
- **MV3 service workers sleep.** Per-tab reports live in memory; if Chrome
  suspends the worker, the current page's counters reset on next navigation.
- **webRequest sees what DNR blocks too.** A request blocked by the rulesets
  still fires `onBeforeRequest`, so "trackers blocked" counts matched requests,
  not confirmed network blocks. This is labeled honestly in the popup.
- **localhost permission warning.** Chrome shows a host-permission warning for
  `http://localhost:11434/*` on install. It is only ever used when the user
  explicitly enables local AI.
- **No Firefox support yet.** `world: "MAIN"` content scripts and
  `chrome.privacy.network` details differ outside Chromium.

## Updating the AI-endpoint list

Edit `assets/ai-endpoints.json` (keep `domain`/`name`/`category`), reload the
extension. Domains match on exact or subdomain suffix.
