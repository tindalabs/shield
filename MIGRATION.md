# Migrating from `content-security-toolkit` to `@tindalabs/shield`

Shield is the successor to [`content-security-toolkit`](https://www.npmjs.com/package/content-security-toolkit). It keeps the entire `ContentProtector` surface from the toolkit and adds three things on top: structured environment assessment (`assess()`), an OpenTelemetry emission helper (`attachShieldToSpan()`), and a declarative policy engine (`assessAndProtect()`).

**For most consumers, migration is a package rename and an import path swap.** Every option you passed to `ContentProtector` in the toolkit still works in Shield with the same name and same semantics.

---

## TL;DR

```bash
npm uninstall content-security-toolkit
npm install @tindalabs/shield
```

```ts
// Before
import { ContentProtector } from 'content-security-toolkit';

// After
import { ContentProtector } from '@tindalabs/shield';
```

That's the whole migration for the common case. The rest of this document covers the additive new capabilities and one minor type tightening worth knowing about.

---

## What is identical

The toolkit's entire public surface is preserved in Shield with no semantic changes:

- `ContentProtector` class — constructor, `protect()`, `unprotect()`, `dispose()`, `updateOptions()`
- Every existing strategy option in `ContentProtectionOptions`:
  - `preventKeyboardShortcuts`, `preventContextMenu` + `contextMenuOptions`
  - `preventPrinting`, `preventSelection`
  - `enableWatermark` + `watermarkOptions`
  - `preventDevTools` + `devToolsOptions`
  - `preventScreenshots` + `screenshotOptions`
  - `preventExtensions` + `extensionOptions`
  - `preventEmbedding` + `frameEmbeddingOptions`
  - `targetElement`, `customHandlers`, `debugMode`
- All sub-option interfaces: `WatermarkOptions`, `ContextMenuOptions`, `ScreenshotOptions`, `DevToolsOptions`, `ExtensionConfig`, `BrowserExtensionOptions`, `FrameEmbeddingOptions`, `ClipboardOptions`
- All strategy classes exported from `'@tindalabs/shield'` (you can still subclass `AbstractStrategy`, etc.)
- All utility exports (`DOMObserver`, `IntervalManager`, `EventManager`, `SecurityOverlayManager`, …)

If your toolkit code only used `ContentProtector` and its options — which is the common case — the only change is the import string.

---

## What is new in Shield

These are net-new APIs. You can adopt them incrementally; the toolkit code you migrate from continues to work without touching them.

### `assess()` — structured environment signals

The most common reason people reached for the toolkit was active blocking, but most teams later realized they wanted *visibility* into who was visiting, not just hard blocks. `assess()` is that:

```ts
import { assess } from '@tindalabs/shield';

const result = await assess();
console.log(result.signals);       // typed: webdriver, headless, devtools, frame, extension
console.log(result.risk);          // { score: 0–1, flags: ['webdriver', ...] }
console.log(result.spanAttributes); // OTel-compatible Record<string, string|number|boolean>
```

### `attachShieldToSpan()` — one-call OpenTelemetry integration

Wires every protection event (devtools opened, copy attempted, screenshot attempted, …) into an OTel span without per-strategy callback wiring:

```ts
import { attachShieldToSpan } from '@tindalabs/shield';

const protector = attachShieldToSpan(
  { preventClipboard: true, enableWatermark: true },
  (name, attrs) => span.addEvent(name, attrs),
);
protector.protect();
```

Shield does not depend on `@opentelemetry/api` — you provide the emitter callback; Shield calls it.

### `assessAndProtect()` — risk-keyed adaptive protection

Bridges `assess()` and `ContentProtector` with a declarative policy engine. Legitimate sessions get zero overhead; high-risk sessions trigger only the strategies their risk profile warrants:

```ts
import { assessAndProtect } from '@tindalabs/shield';

const { assessment, protector } = await assessAndProtect(contentEl, {
  policies: [
    { when: { riskScore: { gte: 0.6 } },
      enable: ['preventSelection', 'preventClipboard'] },
    { when: { signals: { 'shield.automation.headless': true } },
      enable: ['enableWatermark'],
      watermarkOptions: (a) => ({ text: `RISK-${Math.round(a.risk.score * 100)}` }) },
  ],
});
```

### `preventClipboard` option on `ContentProtector`

New optional `preventClipboard?: boolean` + `clipboardOptions?: ClipboardOptions` on `ContentProtectionOptions`. Intercepts `copy` / `cut` / `paste` events plus the programmatic Clipboard API and `document.execCommand`. Default off — your existing options continue to behave exactly as before.

---

## Minor type tightenings

Two fields in toolkit type definitions were declared with a value-literal (`: true,`) instead of an optional boolean — a bug that prevented consumers from passing the option at all in strict TypeScript. Shield corrects both:

| Field | Toolkit (broken) | Shield (fixed) |
|---|---|---|
| `BrowserExtensionOptions.showOverlay` | `: true,` | `?: boolean;` |
| `FrameEmbeddingOptions.showOverlay` | `: true,` | `?: boolean;` |

If your toolkit code compiled at all, it was not exercising these fields. No action required.

---

## Why migrate

Beyond the new capabilities above:

- **Zero runtime dependencies.** The toolkit accidentally shipped `jest-environment-jsdom` (~10 MB of test infrastructure) as a *runtime* dependency. Shield fixes this — `npm install @tindalabs/shield` adds no transitive packages to your bundle.
- **372 tests at ~78% line coverage** (toolkit shipped 1.0.1 with ~58 tests at ~42% lines).
- **Honest scope.** Shield's README has an explicit risk-weight table and a "what's NOT detected" framing so you can decide before shipping.
- **Composability.** Shield is one of three Tindalabs browser packages — [Blindspot](https://github.com/tindalabs/blindspot) (privacy-first OTel frontend observability) and [Scent](https://github.com/tindalabs/scent) (probabilistic identity continuity) compose with it directly.

---

## Support and timelines

- `content-security-toolkit` will remain installable. The package is **deprecated** as of v1.0.2 (npm install will print a deprecation notice), but is not unpublished and will not be unpublished. Existing builds continue to work.
- Security fixes after the deprecation date land in Shield only. If you need a backported fix for the toolkit, open an issue at the Shield repo.
- Questions or migration help: [Shield issues](https://github.com/tindalabs/shield/issues).
