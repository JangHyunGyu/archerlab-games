self.__ARCHERLAB_GAME_ID__ = 'blockpang-service-worker';
importScripts('../shared/service-worker-error-reporter.js?v=20260710-d1-v2', '../shared/service-worker-runtime.js?v=20261009-redirect-cache-v1');
self.ArcherGameServiceWorker.install({ gameId: 'blockpang', version: '20261008-cache-isolation-v1' });
