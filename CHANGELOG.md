# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **ClipboardStrategy** wired into `ContentProtector` via new `preventClipboard` option (default `false`). Intercepts both DOM clipboard events (`copy`, `cut`, `paste`) and the programmatic Clipboard API (`navigator.clipboard.writeText/readText`, `document.execCommand`). Configure via `clipboardOptions`.
- **CI workflow** (`.github/workflows/ci.yml`): runs lint → test → build on every push to `main` and on every pull request targeting `main`.

### Fixed
- `jest-environment-jsdom` moved from `dependencies` to `devDependencies`. Previously it was shipped as a runtime dependency, adding ~10 MB of test infrastructure to every consumer install.
- `IFrameStrategy.test.ts`: pre-existing cross-test window property pollution causing `does not publish when parent domain is allowed` to fail. Root cause was `window.parent`/`window.top` state from test 1 leaking into test 2 under jsdom. Fixed with getter-based `Object.defineProperty` resets in `beforeEach`, `jest.useFakeTimers()` to suppress the `intervalManager` singleton's real 500 ms interval, and `jest.mock('../../utils/intervalManager', ...)` to prevent the singleton from scheduling tasks between tests.

### Changed
- `src/types/index.ts`: added `preventClipboard?: boolean` and `clipboardOptions?: ClipboardOptions` to `ContentProtectionOptions`.
- `src/strategies/index.ts`: `ClipboardStrategy` added to the barrel export.
