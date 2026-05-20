import { assess } from './assess.js';
import { ContentProtector } from './core/index.js';
import { attachShieldToSpan } from './otel.js';
import type { AssessOptions, ShieldAssessment, ShieldSignals } from './types/assessment.js';
import type { ContentProtectionOptions, CustomEventHandlers, WatermarkOptions } from './types/index.js';
import type { SpanEmitter } from './otel.js';

/**
 * Boolean strategy keys available in ContentProtectionOptions.
 * Used to declare which strategies a PolicyRule should activate.
 */
export type StrategyKey =
  | 'preventSelection'
  | 'preventContextMenu'
  | 'preventKeyboardShortcuts'
  | 'preventPrinting'
  | 'preventScreenshots'
  | 'enableWatermark'
  | 'preventDevTools'
  | 'preventClipboard'
  | 'preventEmbedding'
  | 'preventExtensions';

/**
 * Conditions that must all be satisfied for a PolicyRule to trigger.
 * An empty condition always matches.
 */
export interface PolicyCondition {
  /** Trigger when the assess() risk score is within the given range. */
  riskScore?: {
    /** Score must be >= this value. */
    gte?: number;
    /** Score must be < this value. */
    lt?: number;
  };
  /** Trigger when all listed signal values match the assessment result. */
  signals?: Partial<Record<keyof ShieldSignals, boolean>>;
}

/**
 * A single policy rule: activate a set of strategies when a condition is met.
 */
export interface PolicyRule {
  when: PolicyCondition;
  /** Strategy keys to activate when the condition matches. */
  enable: StrategyKey[];
  /**
   * Watermark options to apply when 'enableWatermark' is in `enable`.
   * Pass a factory function to embed session-specific data (e.g. the
   * assess() session token) into the watermark text — useful for tracing
   * scraped content back to the session that extracted it.
   */
  watermarkOptions?: WatermarkOptions | ((assessment: ShieldAssessment) => WatermarkOptions);
}

export interface PolicyEngineOptions {
  /** Ordered list of policy rules. All matching rules are merged. */
  policies: PolicyRule[];
  /** Element to protect. Defaults to document.body inside ContentProtector. */
  targetElement?: HTMLElement | null;
  /** Custom event handlers forwarded to ContentProtector. */
  customHandlers?: CustomEventHandlers;
  /**
   * OTel span emitter. When provided, policy trigger events are emitted as
   * span events and ContentProtector callbacks are wired via attachShieldToSpan.
   */
  spanEmitter?: SpanEmitter;
  /** Options forwarded to the internal assess() call. */
  assessOptions?: AssessOptions;
  /**
   * Override the assess function. Primarily useful for testing.
   * Defaults to the built-in assess().
   */
  assessFn?: (options?: AssessOptions) => Promise<ShieldAssessment>;
}

export interface PolicyResult {
  /** The assessment that was used to evaluate policies. */
  assessment: ShieldAssessment;
  /**
   * The active ContentProtector, already started via protect().
   * null when no policy rules matched (no protection was activated).
   */
  protector: ContentProtector | null;
}

function matchesCondition(
  assessment: ShieldAssessment,
  condition: PolicyCondition,
): boolean {
  if (condition.riskScore !== undefined) {
    const { gte, lt } = condition.riskScore;
    if (gte !== undefined && assessment.risk.score < gte) return false;
    if (lt !== undefined && assessment.risk.score >= lt) return false;
  }
  if (condition.signals !== undefined) {
    for (const [key, expected] of Object.entries(condition.signals)) {
      if (assessment.signals[key as keyof ShieldSignals] !== expected) return false;
    }
  }
  return true;
}

/**
 * Runs assess(), evaluates the provided policy rules against the result,
 * and activates a ContentProtector with the union of all matched strategies.
 *
 * Protection is proportional to detected risk — legitimate sessions see no
 * overhead; automation, headless browsers, and high-risk sessions trigger
 * only the strategies that are warranted.
 *
 * @example
 * const { assessment, protector } = await assessAndProtect(contentEl, {
 *   policies: [
 *     // Watermark all medium-risk sessions — embed session token for traceability
 *     {
 *       when: { riskScore: { gte: 0.3 } },
 *       enable: ['enableWatermark'],
 *       watermarkOptions: (a) => ({ text: `PROTECTED-${a.risk.flags.join(',')}` }),
 *     },
 *     // Full protection for confirmed automation
 *     {
 *       when: { signals: { 'shield.automation.headless': true } },
 *       enable: ['preventSelection', 'preventClipboard', 'preventScreenshots'],
 *     },
 *   ],
 *   spanEmitter: (name, attrs) => {
 *     const span = getTracer().startSpan(name, { attributes: attrs }, getRouteContext());
 *     span.end();
 *   },
 * });
 */
export async function assessAndProtect(
  element: HTMLElement | null,
  options: PolicyEngineOptions,
): Promise<PolicyResult> {
  const assessment = await (options.assessFn ?? assess)(options.assessOptions);

  const enabledStrategies = new Set<StrategyKey>();
  let resolvedWatermarkOptions: WatermarkOptions | undefined;
  let matchedRules = 0;

  for (const rule of options.policies) {
    if (!matchesCondition(assessment, rule.when)) continue;
    matchedRules++;
    for (const key of rule.enable) {
      enabledStrategies.add(key);
    }
    // Last matched rule's watermarkOptions wins
    if (rule.watermarkOptions !== undefined && rule.enable.includes('enableWatermark')) {
      resolvedWatermarkOptions = typeof rule.watermarkOptions === 'function'
        ? rule.watermarkOptions(assessment)
        : rule.watermarkOptions;
    }
  }

  if (enabledStrategies.size === 0) {
    options.spanEmitter?.('shield.policy.evaluated', {
      'shield.policy.matched_rules': 0,
      'shield.policy.risk_score': assessment.risk.score,
      'shield.policy.protection_activated': false,
    });
    return { assessment, protector: null };
  }

  const protectionOptions: ContentProtectionOptions = {
    targetElement: element,
    customHandlers: options.customHandlers,
  };
  for (const key of enabledStrategies) {
    (protectionOptions as Record<string, unknown>)[key] = true;
  }
  if (resolvedWatermarkOptions !== undefined) {
    protectionOptions.watermarkOptions = resolvedWatermarkOptions;
  }

  const protector = options.spanEmitter
    ? attachShieldToSpan(protectionOptions, options.spanEmitter)
    : new ContentProtector(protectionOptions);

  options.spanEmitter?.('shield.policy.triggered', {
    'shield.policy.matched_rules': matchedRules,
    'shield.policy.risk_score': assessment.risk.score,
    'shield.policy.enabled_strategies': [...enabledStrategies].join(','),
    'shield.policy.protection_activated': true,
  });

  protector.protect();

  return { assessment, protector };
}
