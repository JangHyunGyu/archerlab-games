import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

export default defineConfig({
  base: '/water-sort/',
  plugins: [react(), {
    name: 'local-shared-game-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0].replace(/^\/water-sort/, '');
        if (!path || !['/shared/ranking-delivery.js', '/shared/immersive.js', '/favicon.svg'].includes(path)) return next();
        response.setHeader('Content-Type', path.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript');
        response.end(readFileSync(new URL(`../..${path}`, import.meta.url)));
      });
    },
  }],
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
