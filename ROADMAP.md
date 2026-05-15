# Shield - Roadmap

## Current Status

The Shield is a comprehensive library for protecting web content from copying, screenshotting, and other extraction methods.

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