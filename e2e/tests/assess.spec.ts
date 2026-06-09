import { test, expect, type Page } from '@playwright/test';

// The six signal keys assess() always returns (see types/assessment.ts).
const SIGNAL_KEYS = [
  'shield.devtools.open',
  'shield.automation.webdriver',
  'shield.automation.headless',
  'shield.frame.embedded',
  'shield.extension.detected',
  'shield.extension.names',
] as const;

async function loadFixture(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('ready');
}

test.describe('assess() — real-engine smoke', () => {
  test('resolves with a well-formed assessment (runs the Worker-based DevTools path)', async ({
    page,
  }) => {
    await loadFixture(page);

    const started = Date.now();
    const result = await page.evaluate(() =>
      window.Shield.assess({ devtools: true, extensions: true, timeout: 600 }),
    );
    const elapsed = Date.now() - started;

    // The DevTools debugger detector spins up a real Worker — a path jsdom
    // cannot execute. The full assess() must still settle within its budget.
    expect(elapsed).toBeLessThan(5_000);

    // All six signal keys present with the documented primitive types.
    // (Keys contain dots, so check membership directly — toHaveProperty would
    // read them as nested paths.)
    expect(Object.keys(result.signals).sort()).toEqual([...SIGNAL_KEYS].sort());
    expect(typeof result.signals['shield.devtools.open']).toBe('boolean');
    expect(typeof result.signals['shield.automation.webdriver']).toBe('boolean');
    expect(typeof result.signals['shield.automation.headless']).toBe('boolean');
    expect(typeof result.signals['shield.frame.embedded']).toBe('boolean');
    expect(typeof result.signals['shield.extension.detected']).toBe('boolean');
    expect(typeof result.signals['shield.extension.names']).toBe('string');

    // Risk summary is a calibrated [0, 1] score with a flags array.
    expect(typeof result.risk.score).toBe('number');
    expect(result.risk.score).toBeGreaterThanOrEqual(0);
    expect(result.risk.score).toBeLessThanOrEqual(1);
    expect(Array.isArray(result.risk.flags)).toBe(true);
    expect(typeof result.spanAttributes).toBe('object');
  });

  test('automation.webdriver signal matches navigator.webdriver in this engine', async ({
    page,
  }) => {
    await loadFixture(page);
    // Whatever the engine reports for navigator.webdriver, the signal must
    // mirror it — proving the detector reads the live navigator, not a stub.
    const navWebdriver = await page.evaluate(() => navigator.webdriver === true);
    const result = await page.evaluate(() => window.Shield.assess({ devtools: false }));
    expect(result.signals['shield.automation.webdriver']).toBe(navWebdriver);
  });

  test('detects a known extension signature and composes risk end-to-end', async ({ page }) => {
    await loadFixture(page);
    // React DevTools ships in the default signature set; its JS global is the
    // detection target. A real engine must walk window, flag it, score it, and
    // surface it in spanAttributes — the whole pipeline, not just the detector.
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {};
    });
    const result = await page.evaluate(() => window.Shield.assess({ devtools: false }));

    expect(result.signals['shield.extension.detected']).toBe(true);
    expect(result.signals['shield.extension.names']).toContain('React DevTools');
    expect(result.risk.flags).toContain('extension');
    expect(result.risk.score).toBeGreaterThanOrEqual(0.2);
    // spanAttributes only carry truthy values — extension + risk must surface.
    expect(result.spanAttributes['shield.extension.detected']).toBe(true);
    expect(Number(result.spanAttributes['shield.risk.score'])).toBeGreaterThanOrEqual(0.2);
    expect(String(result.spanAttributes['shield.risk.flags'])).toContain('extension');
  });

  test('a clean session reports no extension and keeps spanAttributes lean', async ({ page }) => {
    await loadFixture(page);
    const result = await page.evaluate(() =>
      window.Shield.assess({ devtools: false, extensions: true }),
    );
    expect(result.signals['shield.extension.detected']).toBe(false);
    expect(result.signals['shield.extension.names']).toBe('');
    expect(result.risk.flags).not.toContain('extension');
    // No extension key should leak into spanAttributes when nothing is detected.
    // (Bracket access — the dotted key is flat, not a nested path.)
    expect(result.spanAttributes['shield.extension.detected']).toBeUndefined();
  });
});
