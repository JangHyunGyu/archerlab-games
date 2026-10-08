import { readFile } from 'node:fs';
import path from 'node:path';

const assets = new Set([
  '/shared/ranking-delivery.js', '/shared/immersive.js', '/shared/client-error-reporter.js',
  '/shared/game-runtime.js', '/shared/browser-check.js', '/favicon.svg',
  '/assets/js/ga-engagement.js', '/assets/js/archerlab-session.js',
]);

export function sharedAssets() {
  return {
    name: 'local-shared-game-assets',
    configureServer(server) {
      const root = path.resolve(server.config.root, '..');
      server.middlewares.use((request, response, next) => {
        const asset = request.url?.split('?')[0].replace(/^\/water-sort\//, '/');
        if (!asset || !assets.has(asset)) return next();
        readFile(path.join(root, asset), (error, body) => {
          if (error) return next(error);
          response.setHeader('Content-Type', asset.endsWith('.svg') ? 'image/svg+xml' : 'application/javascript');
          response.end(body);
        });
      });
    },
  };
}
