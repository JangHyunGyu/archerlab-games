export function trackEvent(name, params = {}) {
  try {
    if (typeof window.gtag === 'function') {
      window.gtag('event', name, { game_id: 'jewelria', ...params });
    }
  } catch {}
}
