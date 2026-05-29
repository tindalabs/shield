# @tindalabs/shield

[![npm version](https://img.shields.io/npm/v/@tindalabs/shield.svg)](https://www.npmjs.com/package/@tindalabs/shield)
[![CI](https://github.com/tindalabs/shield/actions/workflows/ci.yml/badge.svg)](https://github.com/tindalabs/shield/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Zero runtime dependencies](https://img.shields.io/badge/runtime%20deps-0-brightgreen.svg)](./package.json)

**Browser tamper detection for hostile environments.**

Shield detects DevTools, automation drivers, extension injection, and environment spoofing — surfaces findings as structured risk signals composable with [Blindspot](https://github.com/tindalabs/blindspot) spans and [Scent](https://github.com/tindalabs/scent) identity risk scoring.

---

## Install

```bash
npm install @tindalabs/shield
```

---

## Quick start — `assess()`

The primary API is a single async call that returns structured signals, a risk summary, and OTel-compatible span attributes:

```ts
import { assess } from '@tindalabs/shield';

const result = await assess();

console.log(result.signals);
// {
//   'shield.devtools.open': false,
//   'shield.automation.webdriver': false,
//   'shield.automation.headless': false,
//   'shield.frame.embedded': false,
//   'shield.extension.detected': false,
//   'shield.extension.names': '',
// }

console.log(result.risk);
// { score: 0, flags: [] }

// Attach to a Blindspot / OpenTelemetry span
span.setAttributes(result.spanAttributes);
```

### With Blindspot

```ts
import { assess } from '@tindalabs/shield';
import { useSpan } from '@tindalabs/blindspot-react';

const { setAttribute } = useSpan();
const shield = await assess();
Object.entries(shield.spanAttributes).forEach(([k, v]) => setAttribute(k, v));
```

### With Scent

Shield's signals compose directly with Scent's identity and risk engine:

```ts
import { assess } from '@tindalabs/shield';
import { init as initScent } from '@tindalabs/scent-sdk';

const scent = initScent({ apiKey: '...', endpoint: '...' });
const shield = await assess();

// shield.signals merges into the snapshot alongside browser fingerprint signals
const obs = await scent.observe({ extraSignals: shield.signals });
await scent.flush();
// The server risk engine now sees webdriver/headless/devtools signals
// alongside canvas, fonts, hardware and all other collected signals.
```

---

## `assess(options?)` reference

| Option | Type | Default | Description |
|---|---|---|---|
| `devtools` | `boolean` | `true` | Run DevTools detection (async, timing-based) |
| `extensions` | `boolean` | `true` | Run browser extension DOM/JS scan |
| `timeout` | `number` | `400` | Max ms before async detections resolve with `false` |
| `extensionConfig` | `ExtensionConfig[]` | built-in | Extension signatures to check against |

### `ShieldAssessment`

```ts
interface ShieldAssessment {
  signals: {
    'shield.devtools.open': boolean;
    'shield.automation.webdriver': boolean;
    'shield.automation.headless': boolean;
    'shield.frame.embedded': boolean;
    'shield.extension.detected': boolean;
    'shield.extension.names': string; // comma-separated
  };
  risk: {
    score: number;   // 0–1 normalised threat score
    flags: string[]; // ['webdriver', 'devtools_open', ...]
  };
  spanAttributes: Record<string, string | boolean | number>;
}
```

### Risk flags and weights

| Flag | Score contribution | Triggered by |
|---|---|---|
| `webdriver` | 0.9 | `navigator.webdriver === true` |
| `headless` | 0.7 | Headless UA string, zero plugins, missing Permissions API |
| `devtools_open` | 0.4 | Timing/debugger/size detectors |
| `frame_embedded` | 0.3 | `window.self !== window.top` (cross-origin) |
| `extension` | 0.2 | DOM selector or JS global signature match |

---

## Risk-gated protection — `assessAndProtect()`

`assessAndProtect()` bridges both APIs with a declarative policy engine. It runs `assess()`, evaluates a set of rules against the result, and activates a `ContentProtector` with exactly the strategies each session warrants — zero overhead for legitimate users, full defence for automation and high-risk sessions.

```ts
import { assessAndProtect } from '@tindalabs/shield';

const { assessment, protector } = await assessAndProtect(contentEl, {
  policies: [
    // Watermark any session with measurable risk — embed score for traceability
    {
      when: { riskScore: { gte: 0.2 } },
      enable: ['enableWatermark'],
      watermarkOptions: (a) => ({ text: `RISK-${Math.round(a.risk.score * 100)}` }),
    },
    // Selection + clipboard lockdown for high-risk sessions
    {
      when: { riskScore: { gte: 0.6 } },
      enable: ['preventSelection', 'preventClipboard', 'preventKeyboardShortcuts'],
    },
    // Always block headless browsers regardless of score
    {
      when: { signals: { 'shield.automation.headless': true } },
      enable: ['preventScreenshots', 'preventContextMenu'],
    },
  ],
});

// protector is null when no rules matched (legitimate session — no overhead)
if (protector) {
  console.log('Protection active — score:', assessment.risk.score);
}
```

All matched rules are merged: a session with score `0.8` triggers watermark + selection + clipboard + keyboard in one pass.

### With OTel / Blindspot

Pass a `spanEmitter` to emit `shield.policy.triggered` events and wire `ContentProtector` callbacks to child spans:

```ts
import { assessAndProtect } from '@tindalabs/shield';
import { getTracer, getRouteContext } from '@tindalabs/blindspot';

await assessAndProtect(contentEl, {
  policies: [/* ... */],
  spanEmitter: (name, attrs) => {
    const span = getTracer().startSpan(name, { attributes: attrs }, getRouteContext());
    span.end();
  },
});
```

### `PolicyEngineOptions`

| Option | Type | Description |
|---|---|---|
| `policies` | `PolicyRule[]` | Ordered list of rules. All matching rules are merged. |
| `targetElement` | `HTMLElement \| null` | Element to protect. Defaults to `document.body`. |
| `customHandlers` | `CustomEventHandlers` | Forwarded to `ContentProtector`. |
| `spanEmitter` | `SpanEmitter` | Uses `attachShieldToSpan` and emits policy OTel events. |
| `assessOptions` | `AssessOptions` | Forwarded to the internal `assess()` call. |

### `PolicyRule`

| Field | Type | Description |
|---|---|---|
| `when` | `PolicyCondition` | Conditions that must all match. An empty `{}` always matches. |
| `enable` | `StrategyKey[]` | Strategies to activate when the condition matches. |
| `watermarkOptions` | `WatermarkOptions \| (a: ShieldAssessment) => WatermarkOptions` | Static or factory watermark config. Last matched rule wins. |

### `PolicyCondition`

| Field | Type | Description |
|---|---|---|
| `riskScore.gte` | `number` | Score must be ≥ this value. |
| `riskScore.lt` | `number` | Score must be < this value. |
| `signals` | `Partial<ShieldSignals>` | All listed signal values must match. |

### OTel events emitted

| Event | When |
|---|---|
| `shield.policy.triggered` | At least one rule matched — includes `shield.policy.risk_score`, `shield.policy.matched_rules`, `shield.policy.enabled_strategies` |
| `shield.policy.evaluated` | No rules matched — includes `shield.policy.matched_rules: 0`, `shield.policy.protection_activated: false` |

---

## Use cases — adaptive content protection

`assessAndProtect()` exists for the awkward middle ground: blanket protection breaks the experience for legitimate users, but no protection lets scrapers walk away with everything. The policy engine activates only the strategies the session's risk profile warrants — humans see nothing, automation hits a wall.

### Anti-AI scraping

LLM training crawlers, prompt-based scrapers, and headless research agents share the same signal profile as conventional automation: `shield.automation.webdriver`, `shield.automation.headless`, patched-API heuristics, missing plugin metadata. A single policy rule flips watermarking and selection/clipboard lockdown on those sessions while human visitors get the unmodified page.

The `watermarkOptions` factory receives the full assessment, so anything that *does* get scraped carries a forensic trace back to the session that extracted it:

```ts
{
  when: { signals: { 'shield.automation.headless': true } },
  enable: ['enableWatermark', 'preventSelection', 'preventClipboard'],
  watermarkOptions: (a) => ({
    text: `SHIELD-${Math.round(a.risk.score * 100)}-${Date.now().toString(36)}`,
  }),
}
```

Pair with `spanEmitter` and every triggered rule emits `shield.policy.triggered` to your OTel pipeline — operators can see in real time *how often, and by what signal,* their content is being targeted, without instrumenting strategies by hand.

### Risk-proportional DRM

Financial, legal, and media documents need strong protection — but blanket DRM breaks screen readers, accessibility tooling, and developers debugging their own portal. Risk-keyed policy rules flip protection on only when warranted (high risk, automation signals, specific extensions) and leave the long tail of normal sessions completely untouched. The same engine handles both ends of the risk spectrum with one config.

### When *not* to reach for it

If every session needs the same protection (e.g. a known-private internal tool where any visitor is high-trust by definition), skip the engine and use `ContentProtector` directly (next section). `assessAndProtect()` adds an `assess()` round trip and is only worth it when protection should vary per session.

---

## Active protection — `ContentProtector`

Shield also exports the full protection suite for active content defense: blocks DevTools, prevents copy/print/selection, adds watermarks, detects extension injection and iframe embedding.

```ts
import { ContentProtector } from '@tindalabs/shield';

const protector = new ContentProtector({
  preventDevTools: true,
  preventKeyboardShortcuts: true,
  preventPrinting: true,
  preventClipboard: true,
  clipboardOptions: { preventCopy: true, preventCut: true, preventPaste: false },
  enableWatermark: true,
  watermarkOptions: { text: 'Confidential', userId: 'user-123' },
  // …and more (selection, context menu, screenshots, extensions, iframe embedding)
  // — see REFERENCE.md for the complete options table.
});

protector.protect();

// Later:
protector.unprotect();
protector.dispose();
```

See [REFERENCE.md](./REFERENCE.md) for the full `ContentProtector` API and all strategy options.

---

## Demo

A local demo app is included at [`demo/`](./demo). It exercises both APIs in a dark-themed single-page app:

- **Environment Assessment** — runs `assess()` and displays each signal, the risk score bar, and the raw OTel span attributes ready to copy.
- **Active Content Protection** — full `ContentProtector` controls: every strategy toggle, watermark options, live events log.

```bash
cd demo
npm install
npm run dev   # http://localhost:5175 (or next available port)
```

---

## The Tindalabs stack

Shield is one of three composable browser-layer packages:

| Package | What it does |
|---|---|
| **[@tindalabs/blindspot](https://github.com/tindalabs/blindspot)** | Privacy-first OTel frontend observability |
| **[@tindalabs/shield](https://github.com/tindalabs/shield)** | Tamper detection & active content protection |
| **[@tindalabs/scent](https://github.com/tindalabs/scent)** | Probabilistic identity continuity |

---

## License

MIT © [Tindalabs](https://github.com/tindalabs)
