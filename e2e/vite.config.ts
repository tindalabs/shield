import { defineConfig } from 'vite';
import path from 'node:path';

// Serves a minimal fixture that loads Shield's TypeScript source directly
// (same alias the demo/ app uses). Built to static files so `vite preview`
// can serve them over plain HTTP — WebKit on Linux cannot reach Vite's dev
// server, but it reads the static preview output fine.
export default defineConfig({
  root: path.resolve(__dirname, 'fixture'),
  resolve: {
    alias: {
      '@tindalabs/shield': path.resolve(__dirname, '../src/index.ts'),
      '@': path.resolve(__dirname, '../src'),
    },
    extensions: ['.ts', '.js'],
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});
