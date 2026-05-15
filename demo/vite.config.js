import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@tindalabs/shield': path.resolve(__dirname, '../src/index.ts'),
    },
    extensions: ['.ts', '.js', '.vue'],
  },
});
