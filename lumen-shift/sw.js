self.__ARCHERLAB_GAME_ID__ = 'lumen-shift-service-worker';
importScripts('../shared/service-worker-error-reporter.js?v=20260710-d1-v2', '../shared/service-worker-runtime.js?v=20260802-runtime-v1');
self.ArcherGameServiceWorker.install({ gameId: 'lumen-shift', version: '20260802-v1' });
