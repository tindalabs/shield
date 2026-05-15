import { isBrowser } from './utils/environment.js';
import { DevToolsDetectorManager } from './utils/detectors/devToolsDetectorManager.js';
import type { AssessOptions, ShieldAssessment, ShieldSignals } from './types/assessment.js';
import type { ExtensionConfig } from './types/index.js';

// ── Headless detection ────────────────────────────────────────────────────────

function detectHeadless(): boolean {
  if (!isBrowser()) return false;

  // Headless Chrome/Chromium sets this
  if (/HeadlessChrome|Headless/i.test(navigator.userAgent)) return true;

  // Chrome with zero plugins is a strong headless signal
  // (real browsers always have at least one built-in plugin)
  if (
    'chrome' in window &&
    navigator.plugins.length === 0 &&
    !navigator.userAgent.includes('Mobile')
  ) return true;

  // Permissions API is absent in many headless environments
  if (!('permissions' in navigator)) return true;

  return false;
}

// ── DevTools detection ────────────────────────────────────────────────────────

function detectDevTools(timeoutMs: number): Promise<boolean> {
  // DebuggerDetector defers worker init by 100ms via setTimeout; calling
  // checkDevTools() before that returns immediately (worker null). We wait
  // 150ms so the worker is ready before triggering the actual check.
  const WARMUP_MS = 150;

  return new Promise((resolve) => {
    let settled = false;

    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      manager.dispose();
      resolve(value);
    };

    const manager = new DevToolsDetectorManager({
      delayInitialCheck: false,
      // Only settle true on open — the timeout below handles the closed case.
      onDevToolsChange: (isOpen) => { if (isOpen) settle(true); },
    });

    setTimeout(() => {
      if (settled) return;
      manager.checkDevTools();
      // If DevTools are open, the debugger timeout (50ms) fires the callback.
      // If still no result after the remaining budget, DevTools are closed.
      setTimeout(() => settle(false), timeoutMs - WARMUP_MS);
    }, WARMUP_MS);
  });
}

// ── Extension detection ───────────────────────────────────────────────────────

async function detectExtensions(
  config: ExtensionConfig[] | undefined,
): Promise<{ detected: boolean; names: string[] }> {
  if (!isBrowser() || !config?.length) return { detected: false, names: [] };

  const names: string[] = [];

  for (const ext of config) {
    let found = false;

    // DOM selector checks
    if (ext.detectionMethods?.domSelectors) {
      for (const selector of ext.detectionMethods.domSelectors) {
        try {
          if (document.querySelector(selector)) {
            found = true;
            break;
          }
        } catch {
          // invalid selector — skip
        }
      }
    }

    // JS global signature checks
    if (!found && ext.detectionMethods?.jsSignatures) {
      for (const path of ext.detectionMethods.jsSignatures) {
        try {
          const parts = path.split('.');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let obj: any = window;
          for (const part of parts) {
            if (obj == null || !(part in obj)) { obj = undefined; break; }
            obj = obj[part];
          }
          if (obj !== undefined) { found = true; break; }
        } catch {
          // property access threw — skip
        }
      }
    }

    if (found) names.push(ext.name);
  }

  return { detected: names.length > 0, names };
}

// ── Risk scoring ──────────────────────────────────────────────────────────────

const FLAG_WEIGHTS: Record<string, number> = {
  webdriver:     0.9,
  headless:      0.7,
  devtools_open: 0.4,
  frame_embedded: 0.3,
  extension:     0.2,
};

function computeRisk(flags: string[]): { score: number; flags: string[] } {
  const score = Math.min(
    1,
    flags.reduce((sum, f) => sum + (FLAG_WEIGHTS[f] ?? 0.2), 0),
  );
  return { score: Math.round(score * 1000) / 1000, flags };
}

// ── Default extension signatures ─────────────────────────────────────────────
// A minimal built-in set of high-risk extensions. Consumers can extend this
// by passing extensionConfig to assess().

const DEFAULT_EXTENSION_CONFIG: ExtensionConfig[] = [
  {
    name: 'React DevTools',
    description: 'React component inspector',
    risk: 'low',
    detectionMethods: { jsSignatures: ['__REACT_DEVTOOLS_GLOBAL_HOOK__'] },
  },
  {
    name: 'Redux DevTools',
    description: 'Redux state inspector',
    risk: 'low',
    detectionMethods: { jsSignatures: ['__REDUX_DEVTOOLS_EXTENSION__'] },
  },
  {
    name: 'Tampermonkey',
    description: 'Userscript manager',
    risk: 'medium',
    detectionMethods: {
      jsSignatures: ['GM_info', 'unsafeWindow'],
      domSelectors: ['[class*="tampermonkey"]'],
    },
  },
  {
    name: 'Greasemonkey',
    description: 'Userscript manager',
    risk: 'medium',
    detectionMethods: { jsSignatures: ['GM', 'greasemonkey'] },
  },
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run a one-shot tamper-detection assessment and return structured signals,
 * a risk summary, and OTel-compatible span attributes.
 *
 * @example
 * ```ts
 * import { assess } from '@tindalabs/shield';
 *
 * const result = await assess();
 * if (result.risk.score > 0.5) {
 *   span.setAttributes(result.spanAttributes);
 * }
 * ```
 */
export async function assess(options: AssessOptions = {}): Promise<ShieldAssessment> {
  const {
    devtools: runDevtools = true,
    extensions: runExtensions = true,
    timeout = 400,
    extensionConfig = DEFAULT_EXTENSION_CONFIG,
  } = options;

  // SSR / non-browser environments return a clean result immediately.
  if (!isBrowser()) {
    return {
      signals: {
        'shield.devtools.open': false,
        'shield.automation.webdriver': false,
        'shield.automation.headless': false,
        'shield.frame.embedded': false,
        'shield.extension.detected': false,
        'shield.extension.names': '',
      },
      risk: { score: 0, flags: [] },
      spanAttributes: {},
    };
  }

  // Run all detections concurrently.
  const [devtoolsOpen, extensionResult] = await Promise.all([
    runDevtools ? detectDevTools(timeout) : Promise.resolve(false),
    runExtensions ? detectExtensions(extensionConfig) : Promise.resolve({ detected: false, names: [] }),
  ]);

  const webdriver = Boolean(navigator.webdriver);
  const headless = detectHeadless();
  const frameEmbedded = (() => { try { return window.self !== window.top; } catch { return true; } })();

  const signals: ShieldSignals = {
    'shield.devtools.open': devtoolsOpen,
    'shield.automation.webdriver': webdriver,
    'shield.automation.headless': headless,
    'shield.frame.embedded': frameEmbedded,
    'shield.extension.detected': extensionResult.detected,
    'shield.extension.names': extensionResult.names.join(','),
  };

  const flags: string[] = [
    webdriver ? 'webdriver' : null,
    headless ? 'headless' : null,
    devtoolsOpen ? 'devtools_open' : null,
    frameEmbedded ? 'frame_embedded' : null,
    extensionResult.detected ? 'extension' : null,
  ].filter(Boolean) as string[];

  const risk = computeRisk(flags);

  // Only include non-default values in spanAttributes to keep spans lean.
  const spanAttributes: Record<string, string | boolean | number> = {};
  for (const [key, val] of Object.entries(signals) as [keyof ShieldSignals, ShieldSignals[keyof ShieldSignals]][]) {
    if (val === true) spanAttributes[key] = true;
    if (typeof val === 'string' && val !== '') spanAttributes[key] = val;
  }
  if (risk.score > 0) {
    spanAttributes['shield.risk.score'] = risk.score;
    spanAttributes['shield.risk.flags'] = risk.flags.join(',');
  }

  return { signals, risk, spanAttributes };
}
