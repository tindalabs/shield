import { assess } from '@tindalabs/shield';

// The fixture is a thin loader: it exposes the public API on `window` so the
// Playwright specs drive assess() via page.evaluate() in the real engine.
declare global {
  interface Window {
    Shield: { assess: typeof assess };
  }
}

window.Shield = { assess };
document.getElementById('status')!.textContent = 'ready';
