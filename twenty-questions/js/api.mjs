var __oc3;
const PREFIX = 'archerlab_semantle_';
const memory = new Map();

export const storage = {
    available: true,
    get(key) { var __oc0, __oc1, __oc2;
        try {
            const value = localStorage.getItem(PREFIX + key);
            if (value !== null) return value;
        } catch (_err) { this.available = false; }
        try { return (((__oc1 = (__oc0 = sessionStorage.getItem(PREFIX + key)) !== null && __oc0 !== void 0 ? __oc0 : memory.get(key)) !== null && __oc1 !== void 0 ? __oc1 : null)); }
        catch (_err) { return (((__oc2 = memory.get(key)) !== null && __oc2 !== void 0 ? __oc2 : null)); }
    },
    set(key, value) {
        memory.set(key, String(value));
        try { localStorage.setItem(PREFIX + key, value); }
        catch (_err) {
            this.available = false;
            try { sessionStorage.setItem(PREFIX + key, value); } catch (_err) {}
        }
    },
    remove(key) {
        memory.delete(key);
        try { localStorage.removeItem(PREFIX + key); } catch (_err) { this.available = false; }
        try { sessionStorage.removeItem(PREFIX + key); } catch (_err) {}
    },
};

let token = storage.get('player');
if (!/^[a-f0-9]{64}$/.test(token || '')) {
    token = [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
    storage.set('player', token);
}

export const pageLang = document.documentElement.lang === 'en' ? 'en' : 'ko';

const local = ['localhost', '127.0.0.1'].includes(location.hostname);
const apiBase = local ? ((((__oc3 = document.querySelector('meta[name="local-api"]')) === null || __oc3 === void 0 ? void 0 : __oc3.content)) || 'http://127.0.0.1:8787') : 'https://game-api.yama5993.workers.dev';

export async function request(path, body, method = body ? 'POST' : 'GET') {
    if (navigator.onLine === false) throw Object.assign(new Error('offline'), { code: 'offline' });
    const targetPath = pageLang === 'en' ? `${path}${path.indexOf('?') >= 0 ? '&' : '?'}lang=en` : path;
    let result;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 15000) : null;
    try {
        result = await fetch(`${apiBase}/twenty-questions/${targetPath}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
            ...(controller ? { signal: controller.signal } : {}),
            cache: 'no-store',
        });
    } catch (_err) {
        throw Object.assign(new Error('network_error'), { code: 'network_error' });
    } finally {
        if (timeoutId !== null) clearTimeout(timeoutId);
    }
    const data = await result.json().catch(() => ({ error: 'network_error' }));
    if (!result.ok) {
        throw Object.assign(new Error(data.error || 'network_error'), {
            code: data.error || 'network_error',
            status: result.status,
        });
    }
    return data;
}

export const requestId = () => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

export function reportException(error, phase) {
    const message = String(((error === null || error === void 0 ? void 0 : error.message)) || error);
    if (((error === null || error === void 0 ? void 0 : error.code)) || navigator.onLine === false) return;
    if (((error === null || error === void 0 ? void 0 : error.name)) === 'AbortError' || ((error === null || error === void 0 ? void 0 : error.name)) === 'TimeoutError') return;
    if (((error === null || error === void 0 ? void 0 : error.name)) === 'TypeError' && /^(?:Failed to fetch|Load failed|NetworkError|cancelled|Load cancelled|The Internet connection)/i.test(message)) return;
    const url = location.origin + location.pathname;
    const body = {
        appId: 'twenty-questions',
        gameId: 'twenty-questions',
        errorType: 'client_exception',
        errorClass: ((error === null || error === void 0 ? void 0 : error.name)) || 'Error',
        message: message.slice(0, 500),
        stack: String(((error === null || error === void 0 ? void 0 : error.stack)) || '').slice(0, 2500),
        url,
        pageUrl: url,
        extra: { phase },
    };
    fetch(`${apiBase}/client-errors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
    }).catch(() => {});
}
