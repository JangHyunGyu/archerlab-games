self.__ARCHERLAB_GAME_ID__ = 'water-sort-service-worker';
importScripts('../shared/service-worker-error-reporter.js?v=20260710-d1-v2', '../shared/service-worker-runtime.js?v=20261008-runtime-v4');
self.ArcherGameServiceWorker.install({ gameId: 'water-sort', version: '20261008-cache-isolation-v1' });
