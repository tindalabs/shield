# Shield - Roadmap

## Current Status

Shield covers the full environment and tamper-detection surface: DevTools detection, WebDriver/Playwright/CDP automation flags, headless browser heuristics, patched-API detection, canvas entropy spoofing, extension detection, and active content protection (selection blocking, print prevention, screenshot prevention, watermarking). A cross-suite gap analysis found no new detection categories needed at this time — the pending items below are the right next work.

---

## Planned Work

### 1. Type Safety Improvements

**Priority**: High | **Effort**: 1-2 hours | **Status**: Done

Event handlers use unsafe `as` type assertions instead of leveraging the existing `EventDataMap`:

```typescript
// Current (unsafe):
const data = event.data as { isOpen: boolean };

// Recommended (type-safe):
type DevToolsData = EventDataMap[ProtectionEventType.DEVTOOLS_STATE_CHANGE];
```

#### Tasks
- [ ] Create type guard helpers for event data validation
- [ ] Update `devToolsEventHandler.ts` to use typed event data
- [ ] Update `extensionEventHandlers.ts` to use typed event data
- [ ] Update `protectedContentManager.ts` to use typed event data
- [ ] Update `securityOverlayManager.ts` to use typed event data

---

### 2. ScreenshotDetector Consistency

**Priority**: Medium | **Effort**: 30 mins | **Status**: To do

`screenshotDetector.ts` adds event listeners directly to `window` instead of using `eventManager`, which could cause memory leaks.

#### Tasks
- [ ] Refactor `screenshotDetector.ts` to use `eventManager`
- [ ] Ensure proper cleanup in `stopMonitoring()`

---

### 3. ClipboardStrategy Integration

**Priority**: High | **Effort**: 1-2 hours | **Status**: To do

`ClipboardStrategy` is fully implemented but **NOT integrated** into `ContentProtector`.

**Current Status**: The strategy is mature with:
- ✅ Copy/cut/paste event handling
- ✅ Clipboard API interception
- ✅ document.execCommand interception
- ✅ Proper cleanup/restore methods

#### Tasks
- [ ] Add `preventClipboard` option to `ContentProtectionOptions`
- [ ] Add `clipboardOptions` to `ContentProtectionOptions`
- [ ] Integrate ClipboardStrategy initialization in `ContentProtector.initializeStrategies()`
- [ ] Add unit tests for clipboard protection
- [ ] Update documentation

---

### 4. Architecture - Shared LoggableComponent Base Class

**Priority**: Low | **Effort**: 2-3 hours | **Status**: To do

Three abstract classes duplicate logging/error-handling functionality:

| Class | Duplicated Features |
|-------|---------------------|
| `AbstractStrategy` | safeExecute, handleError, log/warn/error |
| `AbstractDevToolsDetector` | safeExecute, handleError |
| `AbstractEventHandler` | log/warn/error |

#### Tasks
- [ ] Create `src/utils/base/LoggableComponent.ts`
- [ ] Refactor `AbstractStrategy` to extend it
- [ ] Refactor `AbstractDevToolsDetector` to extend it
- [ ] Refactor `AbstractEventHandler` to extend it
- [ ] Update tests, verify build passes

---

### 5. Risk-Gated Adaptive Protection (`assessAndProtect`)

**Priority**: High | **Effort**: 3-5 hours | **Status**: To do

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
- [ ] Design `PolicyEngine` type: `PolicyRule[]` with `when` (signal conditions + risk threshold) and `enable` (strategy keys)
- [ ] Implement `assessAndProtect(element, options)` — runs `assess()`, evaluates policies in order, initialises `ContentProtector` with the union of matched strategies
- [ ] Support dynamic watermark text via `watermarkOptions.text: string | ((assessment: ShieldAssessment) => string)`
- [ ] Emit OTel span events for each triggered policy rule (name: `shield.policy.triggered`, attrs: matched signals + enabled strategies)
- [ ] Export `assessAndProtect` and `PolicyRule` from `src/index.ts`
- [ ] Add unit tests: no-match policy (no protector created), single-match, multi-match, watermark text factory, OTel emit
- [ ] Add example to README and `REFERENCE.md` under "Adaptive Protection"
- [ ] Add use-case section to README: "Anti-AI scraping / adaptive content protection"

---

## Advisory Backlog — 2026-05-19

Findings from a full C-level assessment (CTO / CPO / COO / CMO / CFO + competitive research).
Overall score: **6.3/10** — technically superior to the incumbent; held back entirely by distribution.
Full report: `c-level/reports/shield_2026-05-19.md`

### Immediate (this week)

- [ ] Fix `BrowserExtensionOptions.showOverlay: true` → `showOverlay?: boolean` in `src/types/index.ts:203` — compile-breaking for any consumer of extension detection
- [ ] Add `coverage/` to `.gitignore` — generated output should not be in version control
- [ ] Add `SECURITY.md` with maintainer contact and responsible disclosure path (90-day timeline)
- [ ] Tag `v0.1.0` and push — triggers `publish.yml`; makes `npm install @tindalabs/shield` work

### Next Sprint (1–4 weeks)

- [ ] Move `attachShieldToSpan()` example to main README with "Zero runtime dependencies" as first badge — OTel composability is Shield's strongest differentiator and is currently buried in `REFERENCE.md`
- [ ] Add README badges (npm version, CI status, coverage, MIT license)
- [ ] Add CONTRIBUTING.md + PR template (`.github/PULL_REQUEST_TEMPLATE.md`)
- [ ] Refactor `screenshotDetector.ts` to use `eventManager` (ROADMAP item #2) — current direct `window.addEventListener` calls bypass cleanup tracking and leak in SPAs
- [ ] Add `.github/dependabot.yml` for monthly dev-dep updates
- [ ] Increase test coverage to 60%+ on `ContentProtector`, `ClipboardStrategy`, and all `AbstractStrategy.remove()` / cleanup paths
- [ ] Write "migrating from disable-devtool" guide — captures incumbent's user base via search; name the gap: structured output, OTel, no boolean-only API

### Strategic (1–3 months)

- [ ] Coordinate simultaneous Show HN with scent + blindspot-ux launches as "The Tindalabs browser stack" — three composable libraries are a stronger story than three separate posts
- [ ] Feature `attachShieldToSpan()` in OTel community channels (CNCF Slack, OTel SIG discussions) — OTel community is the highest-conversion distribution channel for this unique capability
- [ ] Build community extension signature database (PR-contributed, similar to uBlock filter lists) — each new signature increases Shield's value and creates a contribution flywheel
- [ ] Fix event-handler type assertions (ROADMAP item #1) using `EventDataMap` — improves type safety and reduces contributor friction

### Watch List

- **Chrome/Safari DevTools heuristics** — major browser updates break timing-based detection; monitor `disable-devtool` GitHub issues for breakage reports as a leading indicator (same heuristics apply to Shield)
- **Clipboard API permission changes** — Chrome has been restricting programmatic clipboard access; monitor Web Capabilities Working Group for changes affecting `ClipboardStrategy`
- **`@fingerprintjs/botd` feature expansion** — if Fingerprint adds active content protection features, Shield's positioning narrows; monitor their changelog