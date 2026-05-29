# Shield - Roadmap

## Current Status

Shield covers the full environment and tamper-detection surface: DevTools detection, WebDriver/Playwright/CDP automation flags, headless browser heuristics, patched-API detection, canvas entropy spoofing, extension detection, and active content protection (selection blocking, print prevention, screenshot prevention, watermarking). A cross-suite gap analysis found no new detection categories needed at this time — the pending items below are the right next work.

---

## Planned Work

### 1. Type Safety Improvements

**Priority**: High | **Effort**: 1-2 hours | **Status**: Done ✅

Event handlers use unsafe `as` type assertions instead of leveraging the existing `EventDataMap`:

```typescript
// Current (unsafe):
const data = event.data as { isOpen: boolean };

// Recommended (type-safe):
type DevToolsData = EventDataMap[ProtectionEventType.DEVTOOLS_STATE_CHANGE];
```

Implemented via the `isEventType()` type guard in `src/core/mediator/eventDataTypes.ts`, used across all event handlers.

#### Tasks
- [x] Create type guard helpers for event data validation
- [x] Update `devToolsEventHandler.ts` to use typed event data
- [x] Update `extensionEventHandlers.ts` to use typed event data
- [x] Update `protectedContentManager.ts` to use typed event data
- [x] Update `securityOverlayManager.ts` to use typed event data

---

### 2. ScreenshotDetector Consistency

**Priority**: Medium | **Effort**: 30 mins | **Status**: Done ✅ (resolved by deletion)

`screenshotDetector.ts` added event listeners directly to `window` instead of using `eventManager`. Investigation found the file was **dead code**: zero references anywhere, not exported (the `utils` barrel only exports `environment` and `dom`), and its heuristics were already duplicated by `ScreenshotStrategy`, which correctly uses `eventManager` via `registerEvent`. The leak concern was therefore moot (the class was never instantiated), so the orphan was deleted rather than refactored.

If screenshot detection later grows more independent heuristics, adopt the DevTools `Strategy → DetectorManager → [detectors]` pattern starting from `ScreenshotStrategy`'s real logic.

#### Tasks
- [x] ~~Refactor `screenshotDetector.ts` to use `eventManager`~~ → deleted dead duplicate; `ScreenshotStrategy` already uses `eventManager`

---

### 3. ClipboardStrategy Integration

**Priority**: High | **Effort**: 1-2 hours | **Status**: Done ✅

`ClipboardStrategy` is now integrated into `ContentProtector` (see `src/core/ContentProtector.ts`, gated on `options.preventClipboard`).

**Current Status**: The strategy is mature with:
- ✅ Copy/cut/paste event handling
- ✅ Clipboard API interception
- ✅ document.execCommand interception
- ✅ Proper cleanup/restore methods

#### Tasks
- [x] Add `preventClipboard` option to `ContentProtectionOptions`
- [x] Add `clipboardOptions` to `ContentProtectionOptions`
- [x] Integrate ClipboardStrategy initialization in `ContentProtector.initializeStrategies()`
- [x] Add unit tests for clipboard protection (`src/tests/strategies/ClipboardStrategy.test.ts`)
- [x] Update documentation (README `ContentProtector` example + new complete "ContentProtector Options" table in REFERENCE.md covering `clipboardOptions` and all other strategy options)

---

### 4. Architecture - Shared LoggableComponent Base Class

**Priority**: Low | **Effort**: 2-3 hours | **Status**: Done ✅

Three abstract classes duplicate logging/error-handling functionality:

| Class | Duplicated Features |
|-------|---------------------|
| `AbstractStrategy` | safeExecute, handleError, log/warn/error |
| `AbstractDevToolsDetector` | safeExecute, handleError |
| `AbstractEventHandler` | log/warn/error |

`LoggableComponent` now owns `COMPONENT_NAME` + `debugMode` + `logger` + `setDebugMode`/`isDebugEnabled`/`log`/`warn`/`error`. The three abstracts extend it and keep only their own concerns. `safeExecute`/`handleError` stayed on the strategy/detector bases because their error-type enums diverge (`StrategyErrorType` vs `DetectorErrorType`) — sharing them would require generics that obscure the call sites. `AbstractEventHandler`'s prior `log`/`warn` overrides were redundant (they re-implemented gates that `SimpleLoggingService` already does) and were removed.

#### Tasks
- [x] Create `src/utils/base/LoggableComponent.ts`
- [x] Refactor `AbstractStrategy` to extend it
- [x] Refactor `AbstractDevToolsDetector` to extend it
- [x] Refactor `AbstractEventHandler` to extend it
- [x] Update tests, verify build passes (tsc clean, build green, 46/46 tests pass)

---

### 5. Risk-Gated Adaptive Protection (`assessAndProtect`)

**Priority**: High | **Effort**: 3-5 hours | **Status**: Done ✅ (implemented in `src/policy.ts`, exported from `src/index.ts`, tested in `src/tests/policy.test.ts`)

`assess()` and `ContentProtector` are currently independent APIs — users must manually read the assessment result and activate strategies. A declarative policy bridge closes this gap: run `assess()` once, then activate only the strategies that are warranted by the detected signals. Legitimate users see no protection overhead; automation and scrapers trigger it automatically.

**Proposed API:**

```typescript
import { assessAndProtect } from '@tindalabs/shield';

const protector = await assessAndProtect(element, {
  policies: [
    // Watermark all medium-risk sessions (headless, automation)
    {
      when: { riskScore: { gte: 0.3 } },
      enable: ['enableWatermark'],
      watermarkOptions: { text: (assessment) => `PROTECTED-${assessment.sessionId}` },
    },
    // Add clipboard + selection protection for high-risk sessions
    {
      when: { riskScore: { gte: 0.6 } },
      enable: ['preventSelection', 'preventClipboard'],
    },
    // Screenshot prevention specifically for headless automation
    {
      when: { signals: { 'shield.automation.headless': true } },
      enable: ['preventScreenshots'],
    },
  ],
  // OTel span emitter — policy triggers emit span events
  spanEmitter: (name, attrs) => span.addEvent(name, attrs),
});
```

**Why this matters:**

- **No legitimate user friction** — protection is proportional to detected risk, not always-on
- **Traceable watermarks** — watermark text can embed the assess() session token, so scraped content carries a forensic trace back to the session that extracted it
- **OTel-native policy observability** — every policy trigger emits a span event (`shield.policy.triggered`, `shield.strategy.activated`) visible in Grafana; operators can see in real time how often and by what signal their content is being targeted
- **Composable with Scent** — pair with `scent.observe({ extraSignals: assessment.signals })` for identity-aware policies ("this device has triggered protection 12 times this week")

**Use cases / marketing angles:**

- *Adaptive content protection* — the primary positioning; broader than any single use case
- *Anti-AI scraping* — headless + automation signals map directly to scraper profiles; watermark embeds a forensic trace into any scraped content
- *Risk-proportional DRM* — financial, legal, and media documents get protection only when the session warrants it

#### Tasks
- [x] Design `PolicyEngine` type: `PolicyRule[]` with `when` (signal conditions + risk threshold) and `enable` (strategy keys)
- [x] Implement `assessAndProtect(element, options)` — runs `assess()`, evaluates policies in order, initialises `ContentProtector` with the union of matched strategies
- [x] Support dynamic watermark text via `watermarkOptions.text: string | ((assessment: ShieldAssessment) => string)`
- [x] Emit OTel span events for each triggered policy rule (name: `shield.policy.triggered`, attrs: matched signals + enabled strategies)
- [x] Export `assessAndProtect` and `PolicyRule` from `src/index.ts`
- [x] Add unit tests: no-match policy (no protector created), single-match, multi-match, watermark text factory, OTel emit
- [x] Add example to README and `REFERENCE.md` under "Adaptive Protection"
- [x] Add use-case section to README: "Anti-AI scraping / adaptive content protection" — new "Use cases — adaptive content protection" section covering anti-AI scraping (with forensic-trace watermark factory example), risk-proportional DRM, and a "when *not* to reach for it" note pointing back to plain `ContentProtector`

---

## Advisory Backlog — 2026-05-19

Findings from a full C-level assessment (CTO / CPO / COO / CMO / CFO + competitive research).
Overall score: **6.3/10** — technically superior to the incumbent; held back entirely by distribution.
Full report: `c-level/reports/shield_2026-05-19.md`

### Immediate (this week)

- [x] Fix `BrowserExtensionOptions.showOverlay: true` → `showOverlay?: boolean` in `src/types/index.ts:203` — compile-breaking for any consumer of extension detection
- [x] Add `coverage/` to `.gitignore` — generated output should not be in version control
- [x] Add `SECURITY.md` with maintainer contact and responsible disclosure path (90-day timeline)
- [ ] Tag `v0.1.0` and push — triggers `publish.yml`; makes `npm install @tindalabs/shield` work

### Next Sprint (1–4 weeks)

- [ ] Move `attachShieldToSpan()` example to main README with "Zero runtime dependencies" as first badge — OTel composability is Shield's strongest differentiator and is currently buried in `REFERENCE.md`
- [ ] Add README badges (npm version, CI status, coverage, MIT license)
- [ ] Add CONTRIBUTING.md (done ✅) + PR template (`.github/PULL_REQUEST_TEMPLATE.md` — still missing)
- [ ] Refactor `screenshotDetector.ts` to use `eventManager` (ROADMAP item #2) — current direct `window.addEventListener` calls bypass cleanup tracking and leak in SPAs
- [ ] Add `.github/dependabot.yml` for monthly dev-dep updates
- [x] ~~Increase test coverage to 60%+ on `ContentProtector`, `ClipboardStrategy`, and all `AbstractStrategy.remove()` / cleanup paths~~ — verified met. Baseline as of last audit: `ContentProtector.ts` 88%, `ClipboardStrategy.ts` 61%, `AbstractStrategy.ts` 71%. Remaining gaps in those files (`ContentProtector` lines 74-78/98/107/229/326-329; `ClipboardStrategy` lines 125-143/180-220; `AbstractStrategy` `remove()` paths at 89-90/205-210) are minor and can be picked up opportunistically.
- [ ] **Broader coverage uplift — in progress.** Overall coverage now at **76% stmts / 60% branch / 83% funcs / 78% lines** (352 tests, up from 40%/28%/37%/42% with 58 tests). Highest-leverage gaps to attack next, ordered by impact-per-test:
  1. ~~**`assess.ts` — 2.43%**~~ → **92.68%** ✅ (16 tests; SSR baseline, signal flags, extension detection, risk clamp/rounding, lean spanAttributes)
  2. ~~**`otel.ts` — 0%**~~ → **100%** ✅ (13 tests; every `attachShieldToSpan` handler + emitter-throw isolation)
  3. ~~**`eventManager.ts` 46%**~~ → **91.62% lines** ✅ (31 tests; document/window/element targets, owner/selector/type queries, conflicts, isolation). ~~`intervalManager.ts` 37%~~ → **100% lines** ✅, ~~`timeoutManager.ts` 59%~~ → **100% lines** ✅ (28 tests across both).
  4. ~~**`ContentProtectionMediator.ts` — 19%**~~ → **92.04% lines** ✅ and the 5 event handlers: ~~devToolsEventHandler 11%~~ → **100%**, ~~extensionEventHandlers 7%~~ → **86.2%**, ~~iFrameEventHandlers 17%~~ → **94.4%**, ~~screenShotEventHandlers 21%~~ → **100%**, ~~abstractEventHandler 63%~~ → **87.5%**. Registry: **92.85%**. (40 tests across two new suites.)
  5. ~~**`protectedContentManager.ts` — 11%**~~ → **90.47% lines** ✅, ~~`keyboardShortcutManager.ts` — 11%~~ → **90.56% lines** ✅ (38 tests across two suites; supersession bug surfaced — see follow-up above).
  6. ~~**Individual DevTools detectors — 0% each**~~ → all 7 detectors + manager covered ✅: `sizeDetector` 81%, `timingDetector` 90%, `dateToStringDetector` 95%, `funcToStringDetector` 97%, `regToStringDetector` 55% (Firefox/QQ-specific branches not reachable in jsdom), `defineGetterDetector` 81%, `debugLibDetector` 89%, `debuggerDetector` 23% (Worker not supported in jsdom — limited to constructor/dispose/isSupported paths), `devToolsDetectorManager` 91%. 41 tests across two new suites.
  7. ~~**`LoggableComponent.ts` — 40%**~~ → **100%** ✅ (9 tests; log gating, warn brief/verbose, debug-mode toggle)
  8. ~~**`dom.ts`, `orientation.ts`, `LoggingDelegate.ts` — 0%**~~ → `dom.ts` **88%**, `orientation.ts` **100%**, `LoggingDelegate.ts` **100%** ✅ (18 tests in one combined suite).
  9. Bonus consolidation while testing: the 7 utility classes that still construct their own `SimpleLoggingService` (`securityOverlayManager`, `protectedContentManager`, `eventManager`, `intervalManager`, `timeoutManager`, `devToolsDetectorManager`, `ContentProtector`) could be folded into `LoggableComponent`. `securityOverlayManager` is the most obvious — it already has its own `COMPONENT_NAME` + logger setup.

  Recent slice ✅: heavy strategies — `DevToolsStrategy` 25% → **80.95%**, `ScreenshotStrategy` 35% → **83.33%** (31 net new tests; both existing single-test stubs replaced with comprehensive suites covering lifecycle, event handlers, mediator publish paths, updateOptions branches).

  Recent slice ✅: long-tail strategy polish — `ContextMenuStrategy` 44% → **59.8%**, `ExtensionStrategy` 48% → **65.93%**, `IFrameStrategy` 58% → **82.52%** (27 net new tests across the three suites). Lower per-file leverage than past slices but solid polish — overall now at **77.86% lines**.

  Suggested next: targeted long-tail coverage on the remaining gaps — DOM-observer + selector-based removal paths in `ContextMenuStrategy`, configPath fetch + fallback in `ExtensionStrategy`, fallback `setInterval` paths. Marginal cost-per-pp is now high; consider whether ~78% is the right "done" point.
- [ ] Write "migrating from disable-devtool" guide — captures incumbent's user base via search; name the gap: structured output, OTel, no boolean-only API
- [ ] **`ProtectedContentManager` priority-supersession orphan bug.** When a higher-priority state supersedes the active one in `registerContentState()`, the displaced lower-priority state is left in `contentStates` but is **neither active nor queued** — so dismissing the high-priority state restores the original content rather than falling back to the displaced state. Same shape as the `SecurityOverlayManager` re-queue fix in commit 4d14467: add the active `stateId` to the queue *before* applying the new one. Test `priority and queueing › higher-priority state supersedes a lower-priority active one` documents the current (broken) behaviour and should be inverted once fixed.
- [ ] **Prune the aspirational `ProtectionEventType` enum** to match what's actually wired. Today only 4 of 10 strategies use the mediator (DevTools, Extension, IFrame, Screenshot — the "detect → coordinated UI reaction" group). The other 6 (Clipboard, Selection, ContextMenu, Keyboard, Print, Watermark) are direct-blocking strategies where the action handler **is** the strategy — routing through the mediator would add ceremony for no decoupling benefit. **That asymmetry is principled, not accidental.** But the enum currently declares ~15 event types nothing publishes (`STRATEGY_APPLIED/UPDATED`, `SELECTION_ATTEMPT`, `CONTEXT_MENU_ATTEMPT`, `KEYBOARD_SHORTCUT_BLOCKED`, `PRINT_ATTEMPT`, `DRAG_ATTEMPT`, `WATERMARK_TAMPERED/CREATED/REMOVED`, `FULLSCREEN_CHANGE`, `MEDIATOR_INITIALIZED/DISPOSED`, `ERROR_OCCURRED`, `DEBUG_MESSAGE`, `CONFIG_UPDATED`, `KEYBOARD_SHORTCUTS_REQUESTED/PROVIDED/UPDATED`), which misleads contributors into thinking the architecture is broader than it is. Either delete the unused entries **or** wire one as a proof-of-concept (e.g. `WATERMARK_TAMPERED` → handler republishes `OVERLAY_SHOWN`) and leave the rest as a clear "future events go here" list.
- [ ] **Decide if blocking strategies should adopt the mediator** (deferred — defensible no). Pros: single subscribe point for OTel telemetry (today wired via `attachShieldToSpan` callbacks — a parallel path); pluggability for consumers who want to react to blocked events without subclassing; future cross-component reactions (e.g. throttled toasts on repeated clipboard attempts). Cons: ceremony with no current decoupling benefit. Don't refactor until a concrete need surfaces; revisit if/when item above gets a real second consumer.

### Strategic (1–3 months)

- [ ] Coordinate simultaneous Show HN with scent + blindspot-ux launches as "The Tindalabs browser stack" — three composable libraries are a stronger story than three separate posts
- [ ] Feature `attachShieldToSpan()` in OTel community channels (CNCF Slack, OTel SIG discussions) — OTel community is the highest-conversion distribution channel for this unique capability
- [ ] Build community extension signature database (PR-contributed, similar to uBlock filter lists) — each new signature increases Shield's value and creates a contribution flywheel
- [ ] Fix event-handler type assertions (ROADMAP item #1) using `EventDataMap` — improves type safety and reduces contributor friction

### Watch List

- **Chrome/Safari DevTools heuristics** — major browser updates break timing-based detection; monitor `disable-devtool` GitHub issues for breakage reports as a leading indicator (same heuristics apply to Shield)
- **Clipboard API permission changes** — Chrome has been restricting programmatic clipboard access; monitor Web Capabilities Working Group for changes affecting `ClipboardStrategy`
- **`@fingerprintjs/botd` feature expansion** — if Fingerprint adds active content protection features, Shield's positioning narrows; monitor their changelog