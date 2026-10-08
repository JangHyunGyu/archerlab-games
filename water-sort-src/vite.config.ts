import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sharedAssets } from './scripts/shared-assets.mjs';

export default defineConfig({
  base: '/water-sort/',
  plugins: [react(), sharedAssets()],
  build: { outDir: 'dist', emptyOutDir: true, assetsDir: 'assets' },
  server: {
    proxy: {
      '/water-sort/api/challenge': {
        target: 'http://127.0.0.1:8787',
        rewrite: () => '/water-sort/challenge',
      },
    },
  },
});
