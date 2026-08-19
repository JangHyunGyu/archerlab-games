self.__ARCHERLAB_GAME_ID__ = 'jelly-pang-2048-service-worker';
importScripts('../shared/service-worker-error-reporter.js?v=20260710-d1-v2', '../shared/service-worker-runtime.js?v=20260819-runtime-v3');
self.ArcherGameServiceWorker.install({ gameId: 'jelly-pang-2048', version: '20260816-resume-a11y-v3' });
