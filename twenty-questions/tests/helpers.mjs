import { DatabaseSync } from 'node:sqlite';
import { handleRoomRequest } from '../../server/twenty-questions/service.mjs';
import {
    decodeInt8Vector,
    dotNormalized,
    toCentipoints,
    clearVectorCache,
} from '../../server/twenty-questions/vectors.mjs';

const ENCODER = new TextEncoder();

export function database() {
    const sqlite = new DatabaseSync(':memory:');
    const db = {
        sqlite,
        prepare(sql) {
            function bound(values = []) {
                const statement = () => sqlite.prepare(sql);
                return {
                    sql,
                    bind: (...args) => bound(args),
                    first: async () => statement().get(...values) || null,
                    all: async () => ({ results: statement().all(...values) }),
                    run: async () => ({ meta: { changes: Number(statement().run(...values).changes) }, success: true }),
                };
            }
            return bound();
        },
        async batch(statements) {
            sqlite.exec('BEGIN');
            try {
                const results = [];
                for (const statement of statements) {
                    if (/^\s*(?:SELECT|WITH|PRAGMA)\b/i.test(statement.sql || '')) {
                        results.push({ ...(await statement.all()), success: true });
                    } else {
                        results.push(await statement.run());
                    }
                }
                sqlite.exec('COMMIT');
                return results;
            } catch (error) {
                sqlite.exec('ROLLBACK');
                throw error;
            }
        },
    };
    return db;
}

function encodeFloat16(val) {
    const f32 = new Float32Array(1);
    const u32 = new Uint32Array(f32.buffer);
    f32[0] = val;
    const x = u32[0];
    const sign = (x >> 16) & 0x8000;
    const exp = ((x >> 23) & 0xff) - 127 + 15;
    let mant = (x >> 13) & 0x3ff;
    if (exp <= 0) {
        if (exp < -10) return sign;
        mant = (mant | 0x400) >> (1 - exp);
        return sign | mant;
    }
    if (exp >= 31) return sign | 0x7c00;
    return sign | (exp << 10) | mant;
}

function syntheticHangulWord(index) {
    const base = 0xac00;
    const a = String.fromCharCode(base + ((Math.floor(index / 600) % 20) * 588));
    const b = String.fromCharCode(base + ((Math.floor(index / 25) % 24) * 588));
    const c = String.fromCharCode(base + ((index % 25) * 588));
    return `가${a}${b}${c}`;
}

function syntheticEnglishWord(index) {
    const ch = offset => String.fromCharCode(97 + (offset % 26));
    const a = ch(Math.floor(index / (26 * 26)));
    const b = ch(Math.floor(index / 26));
    const c = ch(index);
    return `synth${a}${b}${c}`;
}

function buildPackFiles({ prefix, versionLabel, coreWords, secretWords, syntheticWord, groups, coldForce, metaExtra = {} }) {
    const wordSet = new Set([...coreWords, ...secretWords]);
    let idx = 0;
    while (wordSet.size < 1030) {
        wordSet.add(syntheticWord(idx++));
    }
    const words = [...wordSet].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const wordToIdx = new Map(words.map((w, i) => [w, i]));

    const dims = 300;
    const quantBytes = dims + 2;
    const rawQuants = new Uint8Array(words.length * quantBytes);
    const decodedVecs = new Array(words.length);

    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const vec = new Float32Array(dims);
        const preset = groups.get(w);
        if (preset) {
            vec[0] = preset[0];
            vec[1] = preset[1];
            vec[2] = preset[2];
            vec[3 + (i % 16)] = 0.05;
        } else {
            const dA = 3 + (i % 200);
            const dB = 3 + ((i * 7 + 13) % 200);
            vec[0] = 0.25 - ((i % 7) * 0.08);
            vec[1] = 0.20 - ((i % 5) * 0.08);
            vec[2] = 0.18 - ((i % 9) * 0.06);
            vec[dA] += 0.65;
            vec[dB] += 0.45;
        }
        let sq = 0;
        for (let d = 0; d < dims; d++) sq += vec[d] * vec[d];
        const norm = Math.sqrt(sq) || 1;
        let maxAbs = 0;
        for (let d = 0; d < dims; d++) {
            vec[d] /= norm;
            if (Math.abs(vec[d]) > maxAbs) maxAbs = Math.abs(vec[d]);
        }
        const half = encodeFloat16(Math.max(maxAbs / 127, 1e-6));
        const sign = (half & 0x8000) ? -1 : 1;
        const exp = (half >> 10) & 0x1f;
        const mant = half & 0x03ff;
        const fScale = exp === 0 ? sign * Math.pow(2, -14) * (mant / 1024) : sign * Math.pow(2, exp - 15) * (1 + mant / 1024);

        const offset = i * quantBytes;
        rawQuants[offset] = half & 0xff;
        rawQuants[offset + 1] = (half >> 8) & 0xff;
        for (let d = 0; d < dims; d++) {
            const q = Math.max(-127, Math.min(127, Math.round(vec[d] / fScale)));
            rawQuants[offset + 2 + d] = q < 0 ? q + 256 : q;
        }
        decodedVecs[i] = decodeInt8Vector(rawQuants, offset, dims);
    }

    const topK = 1000;
    const secretStride = 24576;
    const secrets = [];
    const top1kBytes = new Uint8Array(secretWords.length * secretStride);
    const top1kView = new DataView(top1kBytes.buffer);

    for (let s = 0; s < secretWords.length; s++) {
        const sWord = secretWords[s];
        const sIdx = wordToIdx.get(sWord);
        const sVec = decodedVecs[sIdx];
        const sims = [];
        for (let wIdx = 0; wIdx < words.length; wIdx++) {
            if (wIdx === sIdx) continue;
            sims.push({ wIdx, sim: dotNormalized(sVec, decodedVecs[wIdx]) });
        }
        sims.sort((a, b) => b.sim - a.sim);
        const top = sims.slice(0, topK);
        secrets.push([
            sWord,
            toCentipoints(top[0].sim),
            toCentipoints(top[9].sim),
            toCentipoints(top[topK - 1].sim),
        ]);
        const baseOff = s * secretStride;
        top1kBytes.set(rawQuants.subarray(sIdx * quantBytes, (sIdx + 1) * quantBytes), baseOff);
        top1kView.setUint16(baseOff + dims + 2, topK, true);
        let pos = baseOff + dims + 4;
        for (let k = 0; k < topK; k++) {
            const wb = ENCODER.encode(words[top[k].wIdx]);
            top1kBytes[pos++] = wb.length;
            top1kBytes.set(wb, pos);
            pos += wb.length;
            top1kView.setInt16(pos, toCentipoints(top[k].sim), true);
            pos += 2;
        }
    }

    const hotSet = new Set([...coreWords.filter(w => !coldForce.has(w)), ...secretWords]);
    for (const w of words) {
        if (hotSet.size >= 550) break;
        if (!coldForce.has(w)) hotSet.add(w);
    }
    const cmpUtf8 = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
    const hotWords = [...hotSet].sort(cmpUtf8);
    const coldWords = words.filter(w => !hotSet.has(w)).sort(cmpUtf8);

    const hotWb = hotWords.map(w => ENCODER.encode(w));
    const hotRawLen = hotWb.reduce((sum, b) => sum + b.length, 0);
    const hotAlignedLen = (hotRawLen + 3) & ~3;
    const hotBuf = new Uint8Array(16 + (hotWords.length + 1) * 4 + hotAlignedLen + hotWords.length * quantBytes);
    hotBuf.set([0x53, 0x4d, 0x48, 0x32], 0);
    const hotView = new DataView(hotBuf.buffer);
    hotView.setUint32(4, hotWords.length, true);
    hotView.setUint32(8, hotAlignedLen, true);
    let wCursor = 0;
    const wordsBase = 16 + (hotWords.length + 1) * 4;
    const vecsBase = wordsBase + hotAlignedLen;
    for (let k = 0; k < hotWords.length; k++) {
        hotView.setUint32(16 + k * 4, wCursor, true);
        hotBuf.set(hotWb[k], wordsBase + wCursor);
        wCursor += hotWb[k].length;
        const origIdx = wordToIdx.get(hotWords[k]);
        hotBuf.set(rawQuants.subarray(origIdx * quantBytes, (origIdx + 1) * quantBytes), vecsBase + k * quantBytes);
    }
    hotView.setUint32(16 + hotWords.length * 4, wCursor, true);

    const blockWords = 32;
    const blocks = [];
    const coldChunks = [];
    let coldOffset = 0;
    for (let b = 0; b < coldWords.length; b += blockWords) {
        const sliceWords = coldWords.slice(b, b + blockWords);
        const firstWb = ENCODER.encode(sliceWords[0]);
        const parts = [];
        let blockLen = 0;
        for (const w of sliceWords) {
            const wb = ENCODER.encode(w);
            const rec = new Uint8Array(1 + wb.length + quantBytes);
            rec[0] = wb.length;
            rec.set(wb, 1);
            const origIdx = wordToIdx.get(w);
            rec.set(rawQuants.subarray(origIdx * quantBytes, (origIdx + 1) * quantBytes), 1 + wb.length);
            parts.push(rec);
            blockLen += rec.length;
        }
        const blockBuf = new Uint8Array(blockLen);
        let p = 0;
        for (const part of parts) { blockBuf.set(part, p); p += part.length; }
        coldChunks.push(blockBuf);
        blocks.push({ firstWb, offset: coldOffset, length: blockLen, shardId: 0, wordCount: sliceWords.length });
        coldOffset += blockLen;
    }
    const cold0Buf = new Uint8Array(coldOffset);
    let cPos = 0;
    for (const chunk of coldChunks) { cold0Buf.set(chunk, cPos); cPos += chunk.length; }

    const fwLen = blocks.reduce((s, blk) => s + blk.firstWb.length, 0);
    const coldIdxBuf = new Uint8Array(12 + blocks.length * 12 + fwLen);
    coldIdxBuf.set([0x53, 0x4d, 0x43, 0x32], 0);
    const coldIdxView = new DataView(coldIdxBuf.buffer);
    coldIdxView.setUint32(4, blocks.length, true);
    coldIdxView.setUint32(8, fwLen, true);
    const fwBase = 12 + blocks.length * 12;
    let fwPos = 0;
    for (let bi = 0; bi < blocks.length; bi++) {
        const blk = blocks[bi];
        coldIdxBuf.set(blk.firstWb, fwBase + fwPos);
        fwPos += blk.firstWb.length;
        const eOff = 12 + bi * 12;
        coldIdxView.setUint32(eOff, fwPos, true);
        coldIdxView.setUint32(eOff + 4, blk.offset, true);
        coldIdxView.setUint16(eOff + 8, blk.length, true);
        coldIdxBuf[eOff + 10] = blk.shardId;
        coldIdxBuf[eOff + 11] = blk.wordCount;
    }

    const metaJson = JSON.stringify({
        version: versionLabel,
        dims,
        totalVocab: words.length,
        rankedVocab: words.length,
        hotCount: hotWords.length,
        coldCount: coldWords.length,
        secretStride,
        secrets,
        ...metaExtra,
    });
    const files = {
        [`${prefix}secrets-meta.json`]: ENCODER.encode(metaJson),
        [`${prefix}hot-pack.bin`]: hotBuf,
        [`${prefix}cold-index.bin`]: coldIdxBuf,
        [`${prefix}cold-0.bin`]: cold0Buf,
        [`${prefix}secrets-top1k.bin`]: top1kBytes,
    };

    return { files, words, secrets, metaJson, decodedVecs };
}

// v3 팩(기본)은 추측 가능 어휘 = 순위 어휘. v2 팩은 v2 시절처럼 순위 어휘 밖 단어(KO_V2_ONLY, EN_V2_ONLY)도 추측 가능하다.
export const KO_V2_ONLY = '과학을';
export const EN_V2_ONLY = 'writting';

export function createSemantleStore({
    secretWords = ['행복', '학교', '사과'],
    enSecretWords = ['happy', 'school', 'apple'],
} = {}) {
    const koConfig = {
        coreWords: [
            '사람', '사랑', '학교', '시간', '사과', '과일', '도서관', '행복', '기쁨',
            '물', '집', '바다', '하늘', '고양이', '강아지', '컴퓨터', '나무', '책', '친구', '밤',
            '음식', '자연', '드라이기', '아메리카노', '에어프라이어',
        ],
        secretWords,
        syntheticWord: syntheticHangulWord,
        coldForce: new Set(['에어프라이어']),
        groups: new Map([
            ['행복', [1, 0, 0]],
            ['기쁨', [0.92, 0.35, 0]],
            ['사랑', [0.85, 0.50, 0]],
            ['친구', [0.65, 0.65, 0.2]],
            ['학교', [0, 1, 0]],
            ['도서관', [0.1, 0.94, 0.3]],
            ['책', [0.05, 0.80, 0.5]],
            ['시간', [0.2, 0.45, 0.4]],
            ['사과', [0, 0, 1]],
            ['과일', [0.1, 0.1, 0.96]],
            ['나무', [0.15, 0.2, 0.8]],
            ['사람', [0.45, 0.4, 0.35]],
            ['아메리카노', [0.1, 0.2, 0.65]],
            ['드라이기', [-0.35, -0.35, -0.25]],
            ['물', [-0.4, -0.4, -0.2]],
            ['에어프라이어', [-0.45, -0.30, -0.15]],
            [KO_V2_ONLY, [0.98, 0.1, 0]],
        ]),
    };
    const koPack = buildPackFiles({
        ...koConfig,
        prefix: 'semantle-ko/v3/',
        versionLabel: 'semantle-ko-test-v3',
        metaExtra: { pack: 'v3', guessableEqualsRanked: true },
    });
    const koLegacyPack = buildPackFiles({
        ...koConfig,
        coreWords: [...koConfig.coreWords, KO_V2_ONLY],
        prefix: 'semantle-ko/v2/',
        versionLabel: 'semantle-ko-test-v2',
    });

    const enConfig = {
        coreWords: [
            'person', 'love', 'school', 'time', 'apple', 'fruit', 'library', 'happy', 'joy',
            'water', 'home', 'ocean', 'sky', 'cat', 'dog', 'computer', 'tree', 'book', 'friend', 'night',
            'food', 'nature', 'dryer', 'espresso', 'airfryer', 'coffee', 'cloud', 'milk',
        ],
        secretWords: enSecretWords,
        syntheticWord: syntheticEnglishWord,
        coldForce: new Set(['airfryer']),
        groups: new Map([
            ['happy', [1, 0, 0]],
            ['joy', [0.92, 0.35, 0]],
            ['love', [0.85, 0.50, 0]],
            ['friend', [0.65, 0.65, 0.2]],
            ['school', [0, 1, 0]],
            ['library', [0.1, 0.94, 0.3]],
            ['book', [0.05, 0.80, 0.5]],
            ['time', [0.2, 0.45, 0.4]],
            ['apple', [0, 0, 1]],
            ['fruit', [0.1, 0.1, 0.96]],
            ['tree', [0.15, 0.2, 0.8]],
            ['person', [0.45, 0.4, 0.35]],
            ['espresso', [0.1, 0.2, 0.65]],
            ['coffee', [0.25, 0.3, 0.7]],
            ['milk', [0.15, 0.2, 0.6]],
            ['cloud', [-0.3, -0.2, 0.1]],
            ['dryer', [-0.35, -0.35, -0.25]],
            ['water', [-0.4, -0.4, -0.2]],
            ['airfryer', [-0.45, -0.30, -0.15]],
            [EN_V2_ONLY, [0.1, 0.98, 0]],
        ]),
    };
    const enPack = buildPackFiles({
        ...enConfig,
        prefix: 'semantle-en/v3/',
        versionLabel: 'semantle-en-test-v3',
        metaExtra: { pack: 'v3', guessableEqualsRanked: true },
    });
    const enLegacyPack = buildPackFiles({
        ...enConfig,
        coreWords: [...enConfig.coreWords, EN_V2_ONLY],
        prefix: 'semantle-en/v2/',
        versionLabel: 'semantle-en-test-v2',
    });

    const files = { ...koPack.files, ...koLegacyPack.files, ...enPack.files, ...enLegacyPack.files };
    const rangeCalls = [];
    const store = {
        rangeCalls,
        async get(key, opts) {
            const bytes = files[key];
            if (!bytes) return null;
            let slice = bytes;
            if (opts?.range) {
                rangeCalls.push({ key, ...opts.range });
                const start = opts.range.offset || 0;
                const end = opts.range.length != null ? start + opts.range.length : bytes.byteLength;
                slice = bytes.subarray(start, end);
            }
            const copy = slice.slice().buffer;
            return {
                async arrayBuffer() { return copy; },
                async json() { return JSON.parse(new TextDecoder().decode(slice)); },
            };
        },
    };

    return {
        store,
        words: koPack.words,
        secrets: koPack.secrets,
        metaJson: koPack.metaJson,
        decodedVecs: koPack.decodedVecs,
        legacy: {
            words: koLegacyPack.words,
            secrets: koLegacyPack.secrets,
            decodedVecs: koLegacyPack.decodedVecs,
        },
        en: {
            words: enPack.words,
            secrets: enPack.secrets,
            metaJson: enPack.metaJson,
            decodedVecs: enPack.decodedVecs,
        },
    };
}

export function harness(storeOptions = {}) {
    clearVectorCache();
    const db = database();
    const semantleStore = createSemantleStore(storeOptions);
    let now = storeOptions.initialNow ?? Date.parse('2026-11-21T00:00:15+09:00');
    const env = { DB: db, SEMANTLE_STORE: semantleStore.store, NOW_FN: () => now };
    const queues = new Map();

    async function fetch(request) {
        const reqLang = new URL(request.url).searchParams.get('lang') || 'ko';
        const key = `${request.headers.get('Authorization') || ''}:${reqLang}`;
        const next = (queues.get(key) || Promise.resolve()).then(() => handleRoomRequest(request, env));
        queues.set(key, next.catch(() => {}));
        return next;
    }

    const withLang = (path, lang = 'ko') => (lang === 'en' ? `${path}${path.includes('?') ? '&' : '?'}lang=en` : path);
    const token = 'a'.repeat(64);
    async function call(path, body, method = body ? 'POST' : 'GET', secret = token, lang = 'ko') {
        const result = await fetch(new Request('https://api/twenty-questions/' + withLang(path, lang), {
            method,
            headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {}),
        }));
        return { status: result.status, data: await result.json() };
    }

    async function start(secret = token, lang = 'ko') {
        return (await call('games', { locale: lang, requestId: crypto.randomUUID() }, 'POST', secret, lang)).data;
    }

    function sqliteRow(query, ...values) {
        return db.sqlite.prepare(query).get(...values);
    }

    function answer(gameId) {
        return sqliteRow('SELECT answer_word FROM sm_games WHERE id = ?', gameId).answer_word;
    }

    async function guess(game, text, requestId = crypto.randomUUID(), secret = token, lang = 'ko') {
        return call(`games/${game.id}/guesses`, { text, expectedVersion: game.version, requestId }, 'POST', secret, lang);
    }

    return {
        db,
        env,
        semantleStore,
        fetch,
        call,
        start,
        guess,
        answer,
        row: sqliteRow,
        getNow: () => now,
        setNow: ms => { now = ms; },
        advanceMs: ms => { now += ms; },
    };
}
