(function () {
    if (self.__ARCHERLAB_SERVICE_WORKER_ERROR_REPORTER__) return;
    self.__ARCHERLAB_SERVICE_WORKER_ERROR_REPORTER__ = true;

    var endpoint = 'https://game-api.yama5993.workers.dev/client-errors';
    var gameId = self.__ARCHERLAB_GAME_ID__ || 'archerlab-games-service-worker';

    function safeString(value, fallback) {
        if (value === undefined || value === null) return fallback || '';
        try {
            return String(value);
        } catch {
            return fallback || '';
        }
    }

    function send(type, message, error, source) {
        var payload = {
            appId: gameId,
            message: '[' + type + '] ' + safeString(message, 'Service worker error'),
            stack: error && error.stack ? safeString(error.stack) : '',
            url: self.location && self.location.href ? self.location.href : '',
            source: source || 'service-worker',
            errorType: type,
            errorClass: 'service-worker',
            context: {
                scope: self.registration && self.registration.scope ? self.registration.scope : ''
            }
        };

        return fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(function (response) {
            if (!response.ok) throw new Error('error reporter HTTP ' + response.status);
        }).catch(function () {
            // Reporting must never break the service worker.
        });
    }

    self.addEventListener('error', function (event) {
        send(
            'SERVICE_WORKER_ERROR',
            event && event.message,
            event && event.error,
            event && event.filename ? event.filename : 'service-worker'
        );
    });

    self.addEventListener('unhandledrejection', function (event) {
        var reason = event && event.reason;
        send(
            'SERVICE_WORKER_UNHANDLED_REJECTION',
            reason && reason.message ? reason.message : reason,
            reason,
            'service-worker.unhandledrejection'
        );
    });

    self.ArcherLabServiceWorkerErrorReporter = { report: send };
})();
