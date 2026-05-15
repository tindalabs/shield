# @tindalabs/shield

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

Shield's risk flags compose with Scent's risk engine:

```ts
import { assess } from '@tindalabs/shield';
import { init as initScent } from '@tindalabs/scent-sdk';

const scent = initScent({ apiKey: '...', endpoint: '...' });
const shield = await assess();

const obs = await scent.observe({
  extraSignals: {
    'shield.webdriver': shield.signals['shield.automation.webdriver'],
    'shield.headless': shield.signals['shield.automation.headless'],
    'shield.devtools': shield.signals['shield.devtools.open'],
  },
});
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

## Active protection — `ContentProtector`

Shield also exports the full protection suite for active content defense: blocks DevTools, prevents copy/print/selection, adds watermarks, detects extension injection and iframe embedding.

```ts
import { ContentProtector } from '@tindalabs/shield';

const protector = new ContentProtector({
  preventDevTools: true,
  preventKeyboardShortcuts: true,
  preventPrinting: true,
  enableWatermark: true,
  watermarkOptions: { text: 'Confidential', userId: 'user-123' },
});

protector.protect();

// Later:
protector.unprotect();
protector.dispose();
```

See [REFERENCE.md](./REFERENCE.md) for the full `ContentProtector` API and all strategy options.

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
