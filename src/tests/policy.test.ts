import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { ShieldAssessment } from '../types/assessment';
import type { ContentProtectionOptions } from '../types/index';

// NOTE: this suite runs under ts-jest's ESM preset (useESM). Static jest.mock()
// is unreliable in ESM — Jest's per-file module isolation is weaker, so once any
// other test file links the real ../core/index or ../otel into the worker's
// module registry, a static jest.mock() here silently no-ops and the real
// ContentProtector leaks in ("mockImplementation is not a function" in the full
// suite, but passing in isolation). jest.unstable_mockModule + dynamic import()
// is the supported ESM mocking path and is immune to that ordering. See
// https://jestjs.io/docs/ecmascript-modules#module-mocking-in-esm

// Minimal ContentProtector stub — avoids real DOM strategy initialisation.
// Declared as a function so it is hoisted above the mock factories below.
function makeProtectorStub() {
  return {
    protect:       jest.fn<() => void>(),
    dispose:       jest.fn<() => void>(),
    updateOptions: jest.fn<(o: Partial<ContentProtectionOptions>) => void>(),
    unprotect:     jest.fn<() => void>(),
    isProtected:   jest.fn<() => boolean>().mockReturnValue(false),
    getStrategy:   jest.fn(),
    hasStrategy:   jest.fn<() => boolean>().mockReturnValue(false),
  };
}

// Capture the options ContentProtector was constructed with
let capturedOptions: ContentProtectionOptions | null = null;
let protectorStub = makeProtectorStub();

jest.unstable_mockModule('../core/index', () => ({
  ContentProtector: jest.fn((...args: unknown[]) => {
    capturedOptions = args[0] as ContentProtectionOptions;
    return protectorStub;
  }),
}));

jest.unstable_mockModule('../otel', () => ({
  attachShieldToSpan: jest.fn((...args: unknown[]) => {
    capturedOptions = args[0] as ContentProtectionOptions;
    return protectorStub;
  }),
}));

// Dynamic imports AFTER the mock registrations so the mocked modules are used.
const { assessAndProtect } = await import('../policy');
const { ContentProtector } = await import('../core/index');
const { attachShieldToSpan } = await import('../otel');

const MockContentProtector  = ContentProtector  as jest.MockedClass<typeof ContentProtector>;
const mockAttachShieldToSpan = attachShieldToSpan as jest.MockedFunction<typeof attachShieldToSpan>;

function makeAssessment(
  riskScore: number,
  signalOverrides: Partial<ShieldAssessment['signals']> = {},
): ShieldAssessment {
  return {
    signals: {
      'shield.devtools.open':         false,
      'shield.automation.webdriver':  false,
      'shield.automation.headless':   false,
      'shield.frame.embedded':        false,
      'shield.extension.detected':    false,
      'shield.extension.names':       '',
      ...signalOverrides,
    },
    risk: { score: riskScore, flags: riskScore > 0.5 ? ['high_risk'] : [] },
    spanAttributes: { 'shield.risk.score': riskScore },
  };
}

const mockAssessFn = jest.fn<(opts?: unknown) => Promise<ShieldAssessment>>();

beforeEach(() => {
  jest.clearAllMocks();
  capturedOptions = null;
  protectorStub = makeProtectorStub();
  // Re-wire mocks to return the fresh stub after clearAllMocks
  (MockContentProtector as jest.MockedClass<typeof ContentProtector>).mockImplementation(
    ((opts?: ContentProtectionOptions) => {
      capturedOptions = opts ?? null;
      return protectorStub;
    }) as never,
  );
  mockAttachShieldToSpan.mockImplementation((opts: ContentProtectionOptions) => {
    capturedOptions = opts;
    return protectorStub as unknown as InstanceType<typeof ContentProtector>;
  });
});

describe('assessAndProtect', () => {

  describe('no matching policies', () => {
    it('returns null protector when no rules match', async () => {
      mockAssessFn.mockResolvedValue(makeAssessment(0.1));

      const { assessment, protector } = await assessAndProtect(null, {
        policies: [{ when: { riskScore: { gte: 0.5 } }, enable: ['enableWatermark'] }],
        assessFn: mockAssessFn as never,
      });

      expect(protector).toBeNull();
      expect(assessment.risk.score).toBe(0.1);
      expect(MockContentProtector).not.toHaveBeenCalled();
      expect(protectorStub.protect).not.toHaveBeenCalled();
    });

    it('emits shield.policy.evaluated when no rules match', async () => {
      mockAssessFn.mockResolvedValue(makeAssessment(0.2));
      const emitter = jest.fn();

      await assessAndProtect(null, {
        policies: [{ when: { riskScore: { gte: 0.8 } }, enable: ['preventSelection'] }],
        spanEmitter: emitter,
        assessFn: mockAssessFn as never,
      });

      expect(emitter).toHaveBeenCalledWith('shield.policy.evaluated', expect.objectContaining({
        'shield.policy.matched_rules': 0,
        'shield.policy.protection_activated': false,
      }));
    });
  });

  describe('single matching rule', () => {
    it('activates strategy when riskScore.gte matches', async () => {
      mockAssessFn.mockResolvedValue(makeAssessment(0.7));

      const { protector } = await assessAndProtect(null, {
        policies: [{ when: { riskScore: { gte: 0.5 } }, enable: ['preventSelection'] }],
        assessFn: mockAssessFn as never,
      });

      expect(protector).toBe(protectorStub);
      expect(capturedOptions).toMatchObject({ preventSelection: true });
      expect(protectorStub.protect).toHaveBeenCalledTimes(1);
    });

    it('activates strategy when signal condition matches', async () => {
      mockAssessFn.mockResolvedValue(makeAssessment(0.1, { 'shield.automation.headless': true }));

      await assessAndProtect(null, {
        policies: [{ when: { signals: { 'shield.automation.headless': true } }, enable: ['preventScreenshots'] }],
        assessFn: mockAssessFn as never,
      });

      expect(capturedOptions).toMatchObject({ preventScreenshots: true });
    });

    it('does not activate when signal value does not match', async () => {
      mockAssessFn.mockResolvedValue(makeAssessment(0.1, { 'shield.automation.headless': false }));

      const { protector } = await assessAndProtect(null, {
        policies: [{ when: { signals: { 'shield.automation.headless': true } }, enable: ['preventScreenshots'] }],
        assessFn: mockAssessFn as never,
      });

      expect(protector).toBeNull();
    });

    it('does not activate when riskScore.lt boundary is not met', async () => {
      mockAssessFn.mockResolvedValue(makeAssessment(0.8));

      const { protector } = await assessAndProtect(null, {
        policies: [{ when: { riskScore: { gte: 0.3, lt: 0.7 } }, enable: ['enableWatermark'] }],
        assessFn: mockAssessFn as never,
      });

      expect(protector).toBeNull();
    });
  });

  describe('multiple matching rules', () => {
    it('merges strategies from all matched rules', async () => {
      mockAssessFn.mockResolvedValue(makeAssessment(0.8));

      await assessAndProtect(null, {
        policies: [
          { when: { riskScore: { gte: 0.3 } }, enable: ['enableWatermark'] },
          { when: { riskScore: { gte: 0.6 } }, enable: ['preventSelection', 'preventClipboard'] },
        ],
        assessFn: mockAssessFn as never,
      });

      expect(capturedOptions).toMatchObject({
        enableWatermark:   true,
        preventSelection:  true,
        preventClipboard:  true,
      });
    });

    it('only applies strategies from matched rules', async () => {
      mockAssessFn.mockResolvedValue(makeAssessment(0.4));

      await assessAndProtect(null, {
        policies: [
          { when: { riskScore: { gte: 0.3 } }, enable: ['enableWatermark'] },
          { when: { riskScore: { gte: 0.8 } }, enable: ['preventSelection'] },
        ],
        assessFn: mockAssessFn as never,
      });

      expect(capturedOptions?.enableWatermark).toBe(true);
      expect((capturedOptions as Record<string, unknown>)?.preventSelection).toBeUndefined();
    });
  });

  describe('watermark options', () => {
    it('applies static watermarkOptions from matched rule', async () => {
      mockAssessFn.mockResolvedValue(makeAssessment(0.5));
      const wm = { text: 'PROTECTED', opacity: 0.2 };

      await assessAndProtect(null, {
        policies: [{ when: { riskScore: { gte: 0.3 } }, enable: ['enableWatermark'], watermarkOptions: wm }],
        assessFn: mockAssessFn as never,
      });

      expect(capturedOptions?.watermarkOptions).toEqual(wm);
    });

    it('calls watermarkOptions factory with the assessment', async () => {
      const assessment = makeAssessment(0.7);
      mockAssessFn.mockResolvedValue(assessment);
      const factory = jest.fn().mockReturnValue({ text: 'SESSION-abc123' });

      await assessAndProtect(null, {
        policies: [{
          when: { riskScore: { gte: 0.5 } },
          enable: ['enableWatermark'],
          watermarkOptions: factory as (a: ShieldAssessment) => { text: string },
        }],
        assessFn: mockAssessFn as never,
      });

      expect(factory).toHaveBeenCalledWith(assessment);
      expect(capturedOptions?.watermarkOptions).toEqual({ text: 'SESSION-abc123' });
    });

    it('last matched rule watermarkOptions wins', async () => {
      mockAssessFn.mockResolvedValue(makeAssessment(0.9));

      await assessAndProtect(null, {
        policies: [
          { when: { riskScore: { gte: 0.3 } }, enable: ['enableWatermark'], watermarkOptions: { text: 'FIRST' } },
          { when: { riskScore: { gte: 0.7 } }, enable: ['enableWatermark'], watermarkOptions: { text: 'LAST'  } },
        ],
        assessFn: mockAssessFn as never,
      });

      expect(capturedOptions?.watermarkOptions).toEqual({ text: 'LAST' });
    });
  });

  describe('OTel span emitter', () => {
    it('uses attachShieldToSpan when spanEmitter is provided', async () => {
      mockAssessFn.mockResolvedValue(makeAssessment(0.6));
      const emitter = jest.fn();

      await assessAndProtect(null, {
        policies: [{ when: { riskScore: { gte: 0.5 } }, enable: ['preventSelection'] }],
        spanEmitter: emitter,
        assessFn: mockAssessFn as never,
      });

      expect(mockAttachShieldToSpan).toHaveBeenCalled();
      expect(MockContentProtector).not.toHaveBeenCalled();
    });

    it('emits shield.policy.triggered with strategy list and risk score', async () => {
      mockAssessFn.mockResolvedValue(makeAssessment(0.7));
      const emitter = jest.fn();

      await assessAndProtect(null, {
        policies: [{ when: { riskScore: { gte: 0.5 } }, enable: ['preventSelection', 'enableWatermark'] }],
        spanEmitter: emitter,
        assessFn: mockAssessFn as never,
      });

      expect(emitter).toHaveBeenCalledWith('shield.policy.triggered', expect.objectContaining({
        'shield.policy.risk_score':            0.7,
        'shield.policy.protection_activated':  true,
        'shield.policy.matched_rules':         1,
      }));
      const [, attrs] = (emitter as jest.Mock).mock.calls.find(([n]) => n === 'shield.policy.triggered') ?? [];
      const strategies = (attrs as Record<string, string>)['shield.policy.enabled_strategies'];
      expect(strategies).toContain('preventSelection');
      expect(strategies).toContain('enableWatermark');
    });

    it('uses new ContentProtector when no spanEmitter', async () => {
      mockAssessFn.mockResolvedValue(makeAssessment(0.6));

      await assessAndProtect(null, {
        policies: [{ when: { riskScore: { gte: 0.5 } }, enable: ['preventSelection'] }],
        assessFn: mockAssessFn as never,
      });

      expect(mockAttachShieldToSpan).not.toHaveBeenCalled();
      expect(MockContentProtector).toHaveBeenCalled();
    });
  });

  describe('targetElement and customHandlers', () => {
    it('forwards targetElement to ContentProtector', async () => {
      mockAssessFn.mockResolvedValue(makeAssessment(0.6));
      const el = document.createElement('div');

      await assessAndProtect(el, {
        policies: [{ when: { riskScore: { gte: 0.5 } }, enable: ['preventSelection'] }],
        assessFn: mockAssessFn as never,
      });

      expect(capturedOptions?.targetElement).toBe(el);
    });

    it('forwards customHandlers to ContentProtector', async () => {
      mockAssessFn.mockResolvedValue(makeAssessment(0.6));
      const handlers = { onSelectionAttempt: jest.fn() };

      await assessAndProtect(null, {
        policies: [{ when: { riskScore: { gte: 0.5 } }, enable: ['preventSelection'] }],
        customHandlers: handlers,
        assessFn: mockAssessFn as never,
      });

      expect(capturedOptions?.customHandlers).toBe(handlers);
    });
  });
});
