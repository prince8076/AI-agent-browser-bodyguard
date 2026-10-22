# AI Agent Browser Bodyguard

**Privacy Badger for the AI-agent era.** A Chrome/Edge MV3 extension that shows,
per site: which AI services it contacts, how many tracker/ad requests were
blocked, and whether it attempts browser fingerprinting — rolled into one
explainable 0–100 privacy score. Optional plain-language explanations run on a
**local** Ollama model by default, with NVIDIA's free cloud tier available as
an explicit opt-in. Local by default, no account, no telemetry.

## What it does

- **AI endpoint detection** — the service worker watches outgoing requests and
  flags contacts to ~50 known AI endpoints (`assets/ai-endpoints.json`):
  OpenAI, Anthropic, Gemini, Copilot, Grok, Mistral, DeepSeek, Perplexity,
  Hugging Face, ElevenLabs, Intercom Fin, Drift, Otter.ai, Adobe Firefly…
- **Tracker blocking** — declarativeNetRequest rulesets ported from the
  NetShield blocklists: 91 ad/tracker rules + 12 malware rules
  (`rules/rules_ads.json`, `rules/rules_malware.json`).
- **Fingerprinting detection** — a MAIN-world probe (`fp-main.js`) counts
  canvas, WebGL, and audio fingerprinting calls without altering page behavior;
  an isolated relay (`relay.js`) forwards the counts to the service worker.
- **Explainable scoring** — every deduction is listed ("2 AI service endpoints
  contacted (−20)"). No black-box score.
- **Privacy hardening** — WebRTC IP-handling policy locked to
  `default_public_interface_only`, hyperlink auditing and network prediction
  disabled via `chrome.privacy`.
- **AI explanations (opt-in)** — the popup can explain the report in plain
  language via a provider you choose:
  - **Local — Ollama** (default): with Ollama running, nothing leaves the device.
  - **NVIDIA free tier** (opt-in): paste a free key from build.nvidia.com; the
    popup shows a consent checkbox first, and only a short summary (site name,
    score, counts — never raw history) is sent to NVIDIA's servers.

## Install (developer mode)

1. Clone this repo.
2. Generate the toolbar icons (the repo is text-only; PNGs are built locally):
   ```
   pip install pillow
   python icons/make-icons.py
   ```
3. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**,
   and select this folder.
4. (Optional, for AI explanations)
   - **Local (recommended):** install [Ollama](https://ollama.com), then
     `ollama pull llama3.1:8b`. In the popup, tick "Enable AI explanations"
     and pick the "Local — Ollama" provider.
   - **NVIDIA free tier:** get a free key at build.nvidia.com. In the popup,
     pick the "NVIDIA free tier" provider, paste the key, tick the consent
     box, then enable AI explanations.

## Project layout

```
manifest.json            MV3 manifest
background.js            service worker: request observation, scoring, privacy hardening
fp-main.js               MAIN-world fingerprinting probe (detection only)
relay.js                 isolated-world relay for probe messages
popup.html / popup.css / popup.js
                         popup UI + report rendering
ollama-client.js         localhost Ollama client (no cloud, no keys)
ai-providers.js          provider abstraction: ollama-local (default) + nvidia (opt-in)
explainer.js             prompt builders: explainSite(), classifyEndpoint() — provider-agnostic
popup-ai.js              popup wiring for the AI panel: provider select, key entry, consent gate
assets/ai-endpoints.json curated AI/agent endpoint list
assets/blocked-domains.json
                         blocklist domains extracted from the DNR rulesets
rules/rules_ads.json     91 ad/tracker block rules (DNR)
rules/rules_malware.json 12 malware block rules (DNR)
icons/make-icons.py      Pillow icon generator (run once after cloning)
```

## Permissions — and why

| Permission | Why |
|---|---|
| `declarativeNetRequest` | Block ads/trackers/malware from the rulesets |
| `webRequest` | **Observe** (never block) requests to score AI-endpoint contacts |
| `privacy` | WebRTC leak prevention, disable hyperlink auditing |
| `storage` | On/off toggle + AI settings, local only |
| `<all_urls>` | The monitor has to see requests on every site |
| `http://localhost:11434/*` | Talk to local Ollama only when you opt in |
| `https://integrate.api.nvidia.com/*` | Talk to NVIDIA's API only when you pick that provider, save a key, and tick consent |

## Roadmap

- v0.3: sensitive-paste warning (warn before pasting passwords into AI chatboxes)
- v0.4: historical per-site timeline, exportable report
- v0.5: community-maintained AI-endpoint feed with signed updates

## License

MIT — do what you want, keep the copyright notice.
