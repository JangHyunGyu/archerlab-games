const PREFIX = 'archerlab_twenty_';
const memory = new Map();
export const storage = {
    available: true,
    get(key) {
        try { const value = localStorage.getItem(PREFIX + key); if (value !== null) return value; } catch { this.available = false; }
        try { return sessionStorage.getItem(PREFIX + key) ?? memory.get(key) ?? null; } catch { return memory.get(key) ?? null; }
    },
    set(key, value) {
        memory.set(key, String(value));
        try { localStorage.setItem(PREFIX + key, value); } catch { this.available = false; try { sessionStorage.setItem(PREFIX + key, value); } catch {} }
    },
    remove(key) {
        memory.delete(key);
        try { localStorage.removeItem(PREFIX + key); } catch { this.available = false; }
        try { sessionStorage.removeItem(PREFIX + key); } catch {}
    },
};

let token = storage.get('player');
if (!/^[a-f0-9]{64}$/.test(token || '')) {
    token = [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
    storage.set('player', token);
}
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
const apiBase = local ? (document.querySelector('meta[name="local-api"]')?.content || 'http://127.0.0.1:8787') : 'https://game-api.yama5993.workers.dev';

export async function request(path, body, method = body ? 'POST' : 'GET') {
    if (navigator.onLine === false) throw Object.assign(new Error('offline'), { code: 'offline' });
    let result;
    try {
        result = await fetch(`${apiBase}/twenty-questions/${path}`, {
            method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000), cache: 'no-store',
        });
    } catch { throw Object.assign(new Error('network_error'), { code: 'network_error' }); }
    const data = await result.json().catch(() => ({ error: 'network_error' }));
    if (!result.ok) throw Object.assign(new Error(data.error || 'network_error'), { code: data.error || 'network_error', status: result.status });
    return data;
}

export const requestId = () => crypto.randomUUID();

export function reportException(error, phase) {
    const message = String(error?.message || error);
    if (error?.code || navigator.onLine === false) return;
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return;
    if (error?.name === 'TypeError' && /^(?:Failed to fetch|Load failed|NetworkError|cancelled|Load cancelled|The Internet connection)/i.test(message)) return;
    const url = location.origin + location.pathname;
    const body = {
        appId: 'twenty-questions', gameId: 'twenty-questions', errorType: 'client_exception',
        errorClass: error?.name || 'Error', message: message.slice(0, 500),
        stack: String(error?.stack || '').slice(0, 2500), url, pageUrl: url,
        extra: { phase },
    };
    fetch(`${apiBase}/client-errors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
}
