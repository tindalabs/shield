# @tindalabs/shield-e2e

Cross-browser smoke verification of `assess()` in **real** engines.

The unit suite (`src/tests`) runs in jsdom, which has no `Worker` — so the
DevTools debugger detector and the engine-specific timing/navigator behaviour
are never exercised there. This package runs the detection pipeline in
Chromium, Firefox and WebKit so a browser update can't silently turn a detector
into a false negative without CI noticing.

## How it works

- `fixture/` — a minimal page built by Vite that imports Shield's source (same
  alias the `demo/` app uses) and exposes `assess()` on `window.Shield`.
- `serve.mjs` — a zero-dependency static server for the built fixture. (Used
  instead of `vite preview` because Playwright's WebKit on Linux cannot reach
  Vite's server.)
- `tests/assess.spec.ts` — drives `assess()` via `page.evaluate` and asserts:
  result shape, the `shield.automation.webdriver` signal mirrors the live
  `navigator.webdriver`, a forced extension signature composes risk →
  `spanAttributes` end-to-end, and a clean session stays lean.

## Run locally

```bash
cd e2e
npm install
npm run install-browsers   # chromium firefox webkit
npm test                   # Chromium + Firefox (WebKit auto-runs on macOS)
```

WebKit is omitted automatically on Linux (Playwright's WebKit throws an
"internal error" there). On macOS `npm test` includes it; in CI it runs on a
dedicated `macos-latest` job.

## CI

`.github/workflows/ci.yml` runs the `e2e` job (Chromium + Firefox on
`ubuntu-latest`) and the `e2e-webkit` job (WebKit on `macos-latest`) on every
push and PR to `main`.
