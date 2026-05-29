# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

These changes don't ship in `dist/` — they affect the dev tree, CI infra, and
internal architecture only. No version bump warranted until a consumer-visible
change lands; rolled up into the next release notes when it does.

### Changed
- **`engines.node` pinned to `>=20.0.0`** in `package.json`. Matches what CI tests against; pre-empts the `EBADENGINE` warning that dev-dep updates have started emitting on Node 18 and below. Mild consumer-facing change (npm warns at install time on older Node) — wouldn't justify a version bump on its own, but worth flagging in the next release notes.

### Internal
- **LoggableComponent consolidation** ([54306c8], [67a3e7c], [584840a]): folded 7 utility classes (`TimeoutManager`, `IntervalManager`, `EventManager`, `SecurityOverlayManager`, `ProtectedContentManager`, `DevToolsDetectorManager`, `ContentProtector`) into the `LoggableComponent` base. ~80 lines of duplicated logger plumbing removed; behavioral parity preserved.
- **Pruned aspirational `ProtectionEventType` enum** ([af9f270]): dropped 19 unused event types and matching `EventDataMap` entries that nothing publishes. Enum is now 10 entries — exactly what flows through the mediator today. Header doc explains the detect-and-react vs direct-blocking architectural asymmetry.
- **Test coverage uplift**: 40.42% → 78.18% line coverage; 58 → 372 tests across 10 incremental slices. Two real bugs surfaced and fixed along the way: `SecurityOverlayManager` overlay re-queue ([4d14467]) and `ProtectedContentManager` priority-supersession orphan ([5d5a607]).
- **Bonus README section**: `attachShieldToSpan()` promoted to its own top-level section after `ContentProtector`, with quick-start, Blindspot integration, and full table of emitted span events.

### Chore
- `actions/checkout` v4 → v6 (#2)
- `actions/setup-node` v4 → v6 (#3)
- Dev-dependencies group: `eslint-config-prettier` 10.1.1 → 10.1.8, `prettier`, `ts-jest`, `typescript-eslint` patches (#4)
- `@types/node` 22.13.10 → 25.9.1 (#8) — type-only, no runtime impact
- `npm audit fix`: resolved 11 dev-only advisories (1 critical, 3 high, 4 moderate, 3 low). Zero runtime dependencies meant end-users were never exposed; this was hygiene for the dev/CI tree only.
- Distribution polish: README badges (npm version, CI status, MIT, zero runtime deps), `.github/PULL_REQUEST_TEMPLATE.md`, `.github/dependabot.yml` (monthly npm + github-actions, minor/patch grouped).

[54306c8]: https://github.com/tindalabs/shield/commit/54306c8
[67a3e7c]: https://github.com/tindalabs/shield/commit/67a3e7c
[584840a]: https://github.com/tindalabs/shield/commit/584840a
[af9f270]: https://github.com/tindalabs/shield/commit/af9f270
[4d14467]: https://github.com/tindalabs/shield/commit/4d14467
[5d5a607]: https://github.com/tindalabs/shield/commit/5d5a607

## [0.1.0] - 2026-05-29

Initial public release. Published to npm as [`@tindalabs/shield`](https://www.npmjs.com/package/@tindalabs/shield).

### Added
- **`assess()`** — primary tamper-detection API. Returns structured signals (`shield.devtools.open`, `shield.automation.webdriver`, `shield.automation.headless`, `shield.frame.embedded`, `shield.extension.detected`, `shield.extension.names`), a risk summary with normalized 0–1 score and contributing flags, and OTel-compatible span attributes.
- **`attachShieldToSpan(options, emitter)`** — framework-agnostic OTel wrapper around `ContentProtector`. Every protection event (DevTools open, blocked copy/keypress/screenshot, extension detected, frame embedding, etc.) becomes a span event in the consumer's tracing pipeline. Composable with Blindspot.
- **`assessAndProtect(element, options)`** — risk-gated adaptive protection. Runs `assess()`, evaluates a declarative `PolicyRule[]` (with `riskScore.gte`/`riskScore.lt` and signal conditions), and activates only the strategies the session warrants. Watermark factory receives the full assessment for forensic traceability.
- **`ContentProtector`** — manual control surface for the full protection suite: DevTools, keyboard shortcuts, printing, selection, screenshots, watermarking, context menu, clipboard, browser extensions, frame embedding.
- **ClipboardStrategy** wired into `ContentProtector` via new `preventClipboard` option (default `false`). Intercepts both DOM clipboard events (`copy`, `cut`, `paste`) and the programmatic Clipboard API (`navigator.clipboard.writeText/readText`, `document.execCommand`).
- **CI workflow** (`.github/workflows/ci.yml`): lint → test → build on every push to `main` and PR.
- **Publish workflow** (`.github/workflows/publish.yml`): publishes to npm on `v*` tag push.

### Fixed
- `jest-environment-jsdom` moved from `dependencies` to `devDependencies`. Previously shipped as a runtime dependency, adding ~10 MB of test infrastructure to every consumer install.
- `IFrameStrategy.test.ts`: pre-existing cross-test window property pollution causing `does not publish when parent domain is allowed` to fail. Root cause was `window.parent`/`window.top` state from test 1 leaking into test 2 under jsdom. Fixed with getter-based `Object.defineProperty` resets in `beforeEach`, `jest.useFakeTimers()` to suppress the `intervalManager` singleton's real 500 ms interval, and `jest.mock('../../utils/intervalManager', ...)` to prevent the singleton from scheduling tasks between tests.

### Changed
- `src/types/index.ts`: added `preventClipboard?: boolean` and `clipboardOptions?: ClipboardOptions` to `ContentProtectionOptions`.
- `src/strategies/index.ts`: `ClipboardStrategy` added to the barrel export.
