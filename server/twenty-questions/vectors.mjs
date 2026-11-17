import { fault } from './core.mjs';

const DATA_PREFIX = 'semantle-ko/v2/';
const DIMS = 300;
const QUANT_BYTES = DIMS + 2; // 2B float16 scale + 300B int8
const DEFAULT_SECRET_STRIDE = 24576;
const MAX_TOP1K_CACHE = 64;
const MAX_COLD_BLOCK_CACHE = 256;

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

// 아이솔레이트당 1회 IEEE-754 float16 -> float32 디코드 테이블 사전 계산
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
            entry = {
                store: env.SEMANTLE_STORE,
                vocabPromise: null,
                hotPromise: null,
                coldIndexPromise: null,
                top1kCache: new Map(),
                coldBlockCache: new Map(),
            };
            storeCaches.set(env.SEMANTLE_STORE, entry);
        }
        return entry;
    }
    if (!env?.SEMANTLE_DATA) throw fault('service_unavailable', 503);
    if (!prodCache) {
        prodCache = {
            store: null,
            vocabPromise: null,
            hotPromise: null,
            coldIndexPromise: null,
            top1kCache: new Map(),
            coldBlockCache: new Map(),
        };
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

// 2바이트 float16 스케일 + 300바이트 signed int8 양자화 벡터를 정규화된 Float32Array로 디코드
export function decodeInt8Vector(bytes, offset = 0, dims = DIMS) {
    if (offset + 2 + dims > bytes.byteLength) throw fault('service_unavailable', 503);
    const half = bytes[offset] | (bytes[offset + 1] << 8);
    const scale = FLOAT16_TABLE[half];
    const out = new Float32Array(dims);
    let sq = 0;
    const base = offset + 2;
    for (let i = 0; i < dims; i++) {
        const u = bytes[base + i];
        const q = u > 127 ? u - 256 : u;
        const val = q * scale;
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

function compareUtf8(buf, start, end, needle) {
    const lenA = end - start;
    const lenB = needle.length;
    const minLen = lenA < lenB ? lenA : lenB;
    for (let i = 0; i < minLen; i++) {
        const diff = buf[start + i] - needle[i];
        if (diff !== 0) return diff;
    }
    return lenA - lenB;
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
            const obj = await cache.store.get(DATA_PREFIX + 'secrets-meta.json');
            if (!obj) throw fault('service_unavailable', 503);
            const data = typeof obj.json === 'function'
                ? await obj.json()
                : JSON.parse(DECODER.decode(await obj.arrayBuffer()));
            if (!Array.isArray(data?.secrets) || !data.secrets.length) {
                throw fault('service_unavailable', 503);
            }
            const secretWordToId = new Map();
            for (let i = 0; i < data.secrets.length; i++) {
                secretWordToId.set(data.secrets[i][0], i);
            }
            data.secretWordToId = secretWordToId;
            return data;
        })().catch(error => {
            cache.vocabPromise = null;
            throw error;
        });
    }
    return cache.vocabPromise;
}

export async function loadHotPack(env) {
    const cache = cacheFor(env);
    if (!cache.hotPromise) {
        cache.hotPromise = (async () => {
            const obj = await cache.store.get(DATA_PREFIX + 'hot-pack.bin');
            if (!obj) throw fault('service_unavailable', 503);
            const bytes = new Uint8Array(await obj.arrayBuffer());
            if (bytes.byteLength < 16 || bytes[0] !== 0x53 || bytes[1] !== 0x4d || bytes[2] !== 0x48 || bytes[3] !== 0x32) {
                throw fault('service_unavailable', 503);
            }
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            const count = view.getUint32(4, true);
            const alignedWordsLen = view.getUint32(8, true);
            const offsetsBase = 16;
            const wordsBase = offsetsBase + (count + 1) * 4;
            const vecsBase = wordsBase + alignedWordsLen;
            return { bytes, view, count, offsetsBase, wordsBase, vecsBase };
        })().catch(error => {
            cache.hotPromise = null;
            throw error;
        });
    }
    return cache.hotPromise;
}

export async function loadColdIndex(env) {
    const cache = cacheFor(env);
    if (!cache.coldIndexPromise) {
        cache.coldIndexPromise = (async () => {
            const obj = await cache.store.get(DATA_PREFIX + 'cold-index.bin');
            if (!obj) throw fault('service_unavailable', 503);
            const bytes = new Uint8Array(await obj.arrayBuffer());
            if (bytes.byteLength < 12 || bytes[0] !== 0x53 || bytes[1] !== 0x4d || bytes[2] !== 0x43 || bytes[3] !== 0x32) {
                throw fault('service_unavailable', 503);
            }
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            const blockCount = view.getUint32(4, true);
            const entriesBase = 12;
            const firstWordsBase = entriesBase + blockCount * 12;
            return { bytes, view, blockCount, entriesBase, firstWordsBase };
        })().catch(error => {
            cache.coldIndexPromise = null;
            throw error;
        });
    }
    return cache.coldIndexPromise;
}

export async function loadSecretTop1k(env, secretId, vocab) {
    const cache = cacheFor(env);
    if (cache.top1kCache.has(secretId)) {
        const hit = cache.top1kCache.get(secretId);
        cache.top1kCache.delete(secretId);
        cache.top1kCache.set(secretId, hit);
        return hit;
    }
    const stride = vocab?.secretStride || DEFAULT_SECRET_STRIDE;
    const dims = vocab?.dims || DIMS;
    const obj = await cache.store.get(DATA_PREFIX + 'secrets-top1k.bin', {
        range: { offset: secretId * stride, length: stride },
    });
    if (!obj) throw fault('service_unavailable', 503);
    const rawBuf = await obj.arrayBuffer();
    const buf = rawBuf.byteLength > stride ? rawBuf.slice(secretId * stride, (secretId + 1) * stride) : rawBuf;
    if (buf.byteLength < 4 + dims) throw fault('service_unavailable', 503);

    const bytes = new Uint8Array(buf);
    const view = new DataView(buf);
    const secretVec = decodeInt8Vector(bytes, 0, dims);
    let pos = 2 + dims;
    const count = view.getUint16(pos, true);
    pos += 2;

    const map = new Map();
    const list = new Array(count);
    for (let k = 0; k < count; k++) {
        const wl = bytes[pos++];
        const word = DECODER.decode(bytes.subarray(pos, pos + wl));
        pos += wl;
        const simCenti = view.getInt16(pos, true);
        pos += 2;
        const rank = k + 1;
        map.set(word, { rank, simCenti });
        list[k] = { rank, word, similarity: formatSimilarity(simCenti) };
    }
    const parsed = { secretVec, map, list };
    lruSet(cache.top1kCache, secretId, parsed, MAX_TOP1K_CACHE);
    return parsed;
}

function lookupHotVector(hotPack, wordBytes, dims = DIMS) {
    const { bytes, view, count, offsetsBase, wordsBase, vecsBase } = hotPack;
    const vecStride = dims + 2;
    let lo = 0;
    let hi = count - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const sOff = view.getUint32(offsetsBase + mid * 4, true);
        const eOff = view.getUint32(offsetsBase + (mid + 1) * 4, true);
        const cmp = compareUtf8(bytes, wordsBase + sOff, wordsBase + eOff, wordBytes);
        if (cmp === 0) return decodeInt8Vector(bytes, vecsBase + mid * vecStride, dims);
        if (cmp < 0) lo = mid + 1;
        else hi = mid - 1;
    }
    return null;
}

async function lookupColdVector(env, cache, coldIdx, wordBytes, dims = DIMS) {
    const { bytes, view, blockCount, entriesBase, firstWordsBase } = coldIdx;
    if (!blockCount) return null;
    let lo = 0;
    let hi = blockCount - 1;
    let cand = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const prevEnd = mid > 0 ? view.getUint32(entriesBase + (mid - 1) * 12, true) : 0;
        const curEnd = view.getUint32(entriesBase + mid * 12, true);
        const cmp = compareUtf8(bytes, firstWordsBase + prevEnd, firstWordsBase + curEnd, wordBytes);
        if (cmp <= 0) {
            cand = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    if (cand < 0) return null;

    const eOff = entriesBase + cand * 12;
    const blockOffset = view.getUint32(eOff + 4, true);
    const blockLength = view.getUint16(eOff + 8, true);
    const shardId = bytes[eOff + 10];
    const wordCount = bytes[eOff + 11];
    const cacheKey = `${shardId}:${blockOffset}`;

    let blockBytes = cache.coldBlockCache.get(cacheKey);
    if (!blockBytes) {
        const obj = await cache.store.get(`${DATA_PREFIX}cold-${shardId}.bin`, {
            range: { offset: blockOffset, length: blockLength },
        });
        if (!obj) throw fault('service_unavailable', 503);
        const rawBuf = await obj.arrayBuffer();
        const sliced = rawBuf.byteLength > blockLength ? rawBuf.slice(blockOffset, blockOffset + blockLength) : rawBuf;
        blockBytes = new Uint8Array(sliced);
        lruSet(cache.coldBlockCache, cacheKey, blockBytes, MAX_COLD_BLOCK_CACHE);
    } else {
        cache.coldBlockCache.delete(cacheKey);
        cache.coldBlockCache.set(cacheKey, blockBytes);
    }

    const vecStride = dims + 2;
    let p = 0;
    for (let i = 0; i < wordCount; i++) {
        const wl = blockBytes[p++];
        if (compareUtf8(blockBytes, p, p + wl, wordBytes) === 0) {
            return decodeInt8Vector(blockBytes, p + wl, dims);
        }
        p += wl + vecStride;
    }
    return null;
}

export async function lookupWordVector(env, word, dims = DIMS) {
    const cache = cacheFor(env);
    const wordBytes = ENCODER.encode(word);
    const hotPack = await loadHotPack(env);
    const hotVec = lookupHotVector(hotPack, wordBytes, dims);
    if (hotVec) return hotVec;
    const coldIdx = await loadColdIndex(env);
    return lookupColdVector(env, cache, coldIdx, wordBytes, dims);
}

// 핫 팩·콜드 인덱스·활성 정답 Top-1k를 백그라운드 예열해 첫 추측 지연 제거
export async function preloadVectors(env, secretId = null, answerWord = null) {
    try {
        const vocab = await loadVocab(env);
        const tasks = [loadHotPack(env), loadColdIndex(env)];
        const resolvedId = (answerWord && vocab.secretWordToId?.has(answerWord))
            ? vocab.secretWordToId.get(answerWord)
            : secretId;
        if (resolvedId !== null && resolvedId !== undefined && resolvedId >= 0 && resolvedId < vocab.secrets.length) {
            tasks.push(loadSecretTop1k(env, resolvedId, vocab));
        }
        await Promise.allSettled(tasks);
    } catch { /* 예열 실패는 실제 요청 시 정상 에러 처리 */ }
}

export async function scoreGuessWord(env, vocab, secretId, word, answerWord = null) {
    const effectiveSecretId = (answerWord && vocab.secretWordToId?.has(answerWord))
        ? vocab.secretWordToId.get(answerWord)
        : secretId;
    const secret = vocab.secrets[effectiveSecretId];
    if (!secret) throw fault('service_unavailable', 503);
    const secretWord = answerWord || secret[0];
    if (word === secretWord) {
        return { exact: true, simCenti: 10000, rank: 0 };
    }
    const top1k = await loadSecretTop1k(env, effectiveSecretId, vocab);
    const near = top1k.map.get(word);
    if (near) {
        return { exact: false, simCenti: near.simCenti, rank: near.rank };
    }
    const dims = vocab.dims || DIMS;
    const guessVec = await lookupWordVector(env, word, dims);
    if (!guessVec) return null;
    const simCenti = toCentipoints(dotNormalized(top1k.secretVec, guessVec));
    return { exact: false, simCenti, rank: null };
}
