import { defineConfig, devices } from '@playwright/test';

// Cross-browser smoke verification for assess(). The unit suite runs in jsdom,
// which has no Worker (so the DevTools debugger detector) and no real engine
// behaviour — this matrix runs the detection pipeline in Chromium, Firefox and
// WebKit so a browser update can't silently turn a detector into a false
// negative without CI noticing.
const PORT = 5180;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  workers: process.env['CI'] ? 1 : undefined,
  retries: process.env['CI'] ? 1 : 0,
  timeout: 20_000,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // WebKit (Safari engine): Playwright's WebKit on Linux throws an "internal
    // error" on navigation regardless of the server, so it is omitted there to
    // keep local dev and the Linux CI leg green. It runs on macOS — locally on
    // a Mac and via the dedicated macOS CI job — where the native engine works.
    // WebKit is the highest-value engine to verify: timing-based DevTools
    // heuristics diverge most on Safari.
    ...(process.platform === 'linux'
      ? []
      : [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }]),
  ],
  webServer: {
    command: 'npm run build:fixture && npm run serve:fixture',
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
