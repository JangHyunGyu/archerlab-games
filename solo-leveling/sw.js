self.__ARCHERLAB_GAME_ID__ = 'solo-leveling-service-worker';
importScripts('../shared/service-worker-error-reporter.js?v=20260710-d1-v2', '../shared/service-worker-runtime.js?v=20261009-redirect-cache-v1');
self.ArcherGameServiceWorker.install({ gameId: 'solo-leveling', version: '20261010-basic-combo-v3' });
