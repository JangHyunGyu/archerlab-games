import { fault } from './core.mjs';

const DATA_PREFIX = 'semantle-ko/v1/';
const DIMS = 300;
const VECTOR_BYTES = DIMS * 2;
const TOP_K = 1000;
const TOP_K_BYTES = TOP_K * 8;
const MAX_VEC_CACHE = 2048;
const MAX_TOP1K_CACHE = 32;

// Precompute IEEE-754 binary16 -> float32 decode table once per isolate.
const FLOAT16_TABLE = new Float32Array(65536);
for (let h = 0; h < 65536; h++) {
    const sign = (h & 0x8000) ? -1 : 1;
    const exp = (h >> 10) & 0x1f;
    const mant = h & 0x03ff;
    if (exp === 0) FLOAT16_TABLE[h] = sign * Math.pow(2, -14) * (mant / 1024);
    else if (exp === 31) FLOAT16_TABLE[h] = mant ? NaN : sign * Infinity;
    else FLOAT16_TABLE[h] = sign * Math.pow(2, exp - 15) * (1 + mant / 1024);
}

let prodCache = null;
const storeCaches = new WeakMap();

function cacheFor(env) {
    if (env?.SEMANTLE_STORE) {
        let entry = storeCaches.get(env.SEMANTLE_STORE);
        if (!entry) {
            entry = { store: env.SEMANTLE_STORE, vocabPromise: null, vecCache: new Map(), top1kCache: new Map() };
            storeCaches.set(env.SEMANTLE_STORE, entry);
        }
        return entry;
    }
    if (!env?.SEMANTLE_DATA) throw fault('service_unavailable', 503);
    if (!prodCache) {
        prodCache = { store: null, vocabPromise: null, vecCache: new Map(), top1kCache: new Map() };
    }
    prodCache.store = env.SEMANTLE_DATA;
    return prodCache;
}

export function clearVectorCache() {
    prodCache = null;
}

export function dataReady(env) {
    return Boolean(env?.SEMANTLE_DATA || env?.SEMANTLE_STORE);
}

export function decodeFloat16Vector(buffer, dims = DIMS) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.byteLength < dims * 2) throw fault('service_unavailable', 503);
    const out = new Float32Array(dims);
    let sq = 0;
    for (let i = 0; i < dims; i++) {
        const half = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
        const val = FLOAT16_TABLE[half];
        out[i] = val;
        sq += val * val;
    }
    const norm = Math.sqrt(sq);
    if (Number.isFinite(norm) && norm > 1e-8) {
        const inv = 1 / norm;
        for (let i = 0; i < dims; i++) out[i] *= inv;
    }
    return out;
}

export function dotNormalized(vecA, vecB) {
    let sum = 0;
    for (let i = 0; i < vecA.length; i++) sum += vecA[i] * vecB[i];
    if (!Number.isFinite(sum)) return 0;
    return Math.max(-1, Math.min(1, sum));
}

export function toCentipoints(cosineSim) {
    return Math.max(-10000, Math.min(10000, Math.round(cosineSim * 10000)));
}

export function formatSimilarity(centipoints) {
    return Number((centipoints / 100).toFixed(2));
}

export function findWordIndex(words, word) {
    let lo = 0;
    let hi = words.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const current = words[mid];
        if (current === word) return mid;
        if (current < word) lo = mid + 1;
        else hi = mid - 1;
    }
    return -1;
}

function lruSet(map, key, value, maxSize) {
    if (map.has(key)) map.delete(key);
    else if (map.size >= maxSize) {
        const oldest = map.keys().next().value;
        map.delete(oldest);
    }
    map.set(key, value);
}

export async function loadVocab(env) {
    const cache = cacheFor(env);
    if (!cache.vocabPromise) {
        cache.vocabPromise = (async () => {
            const obj = await cache.store.get(DATA_PREFIX + 'vocab.json');
            if (!obj) throw fault('service_unavailable', 503);
            const data = typeof obj.json === 'function' ? await obj.json() : JSON.parse(new TextDecoder().decode(await obj.arrayBuffer()));
            if (!Array.isArray(data?.words) || !Array.isArray(data?.secrets) || !data.words.length || !data.secrets.length) {
                throw fault('service_unavailable', 503);
            }
            return data;
        })().catch(error => {
            cache.vocabPromise = null;
            throw error;
        });
    }
    return cache.vocabPromise;
}

export async function loadWordVector(env, wordIdx, dims = DIMS) {
    const cache = cacheFor(env);
    if (cache.vecCache.has(wordIdx)) {
        const hit = cache.vecCache.get(wordIdx);
        cache.vecCache.delete(wordIdx);
        cache.vecCache.set(wordIdx, hit);
        return hit;
    }
    const stride = dims * 2;
    const obj = await cache.store.get(DATA_PREFIX + 'vectors.f16', {
        range: { offset: wordIdx * stride, length: stride },
    });
    if (!obj) throw fault('service_unavailable', 503);
    const rawBuf = await obj.arrayBuffer();
    const buf = rawBuf.byteLength > stride ? rawBuf.slice(wordIdx * stride, (wordIdx + 1) * stride) : rawBuf;
    const vec = decodeFloat16Vector(buf, dims);
    lruSet(cache.vecCache, wordIdx, vec, MAX_VEC_CACHE);
    return vec;
}

export async function loadSecretTop1k(env, secretId, vocab) {
    const cache = cacheFor(env);
    if (cache.top1kCache.has(secretId)) {
        const hit = cache.top1kCache.get(secretId);
        cache.top1kCache.delete(secretId);
        cache.top1kCache.set(secretId, hit);
        return hit;
    }
    const count = Math.min(TOP_K, vocab.words.length - 1);
    const byteLen = count * 8;
    if (byteLen < 8) throw fault('service_unavailable', 503);
    const obj = await cache.store.get(DATA_PREFIX + 'secrets-top1k.bin', {
        range: { offset: secretId * byteLen, length: byteLen },
    });
    if (!obj) throw fault('service_unavailable', 503);
    const rawBuf = await obj.arrayBuffer();
    const buf = rawBuf.byteLength > byteLen ? rawBuf.slice(secretId * byteLen, (secretId + 1) * byteLen) : rawBuf;
    if (buf.byteLength < byteLen) throw fault('service_unavailable', 503);
    const view = new DataView(buf);
    const map = new Map();
    const list = new Array(count);
    for (let k = 0; k < count; k++) {
        const wordIdx = view.getUint32(k * 8, true);
        const simFloat = view.getFloat32(k * 8 + 4, true);
        const simCenti = toCentipoints(simFloat);
        const rank = k + 1;
        map.set(wordIdx, { rank, simCenti });
        list[k] = {
            rank,
            word: vocab.words[wordIdx],
            similarity: formatSimilarity(simCenti),
        };
    }
    const parsed = { map, list };
    lruSet(cache.top1kCache, secretId, parsed, MAX_TOP1K_CACHE);
    return parsed;
}

export async function scoreGuessWord(env, vocab, secretId, word) {
    const wordIdx = findWordIndex(vocab.words, word);
    if (wordIdx < 0) return null;
    const secret = vocab.secrets[secretId];
    if (!secret) throw fault('service_unavailable', 503);
    const secretWordIdx = secret[0];
    if (wordIdx === secretWordIdx) {
        return { wordIdx, exact: true, simCenti: 10000, rank: 0 };
    }
    const top1k = await loadSecretTop1k(env, secretId, vocab);
    const near = top1k.map.get(wordIdx);
    if (near) {
        return { wordIdx, exact: false, simCenti: near.simCenti, rank: near.rank };
    }
    const dims = vocab.dims || DIMS;
    const [secretVec, guessVec] = await Promise.all([
        loadWordVector(env, secretWordIdx, dims),
        loadWordVector(env, wordIdx, dims),
    ]);
    const simCenti = toCentipoints(dotNormalized(secretVec, guessVec));
    return { wordIdx, exact: false, simCenti, rank: null };
}
