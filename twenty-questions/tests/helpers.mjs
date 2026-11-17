import { DatabaseSync } from 'node:sqlite';
import { handleRoomRequest } from '../../server/twenty-questions/service.mjs';
import {
    decodeFloat16Vector,
    dotNormalized,
    toCentipoints,
    clearVectorCache,
} from '../../server/twenty-questions/vectors.mjs';

export function database() {
    const sqlite = new DatabaseSync(':memory:');
    const db = {
        sqlite,
        prepare(sql) {
            function bound(values = []) {
                const statement = () => sqlite.prepare(sql);
                return {
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
                for (const statement of statements) results.push(await statement.run());
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

export function createSemantleStore({ secretWords = ['행복', '학교', '사과'] } = {}) {
    const coreWords = [
        '사람', '사랑', '학교', '시간', '사과', '과일', '도서관', '행복', '기쁨',
        '물', '집', '바다', '하늘', '고양이', '강아지', '컴퓨터', '나무', '책', '친구', '밤',
        '음식', '자연',
    ];
    const wordSet = new Set([...coreWords, ...secretWords]);
    let idx = 0;
    while (wordSet.size < 1030) {
        wordSet.add(syntheticHangulWord(idx++));
    }
    const words = [...wordSet].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const wordToIdx = new Map(words.map((w, i) => [w, i]));

    // Build deterministic unit vectors in 300 dimensions.
    // Give semantic pairs positive overlap while keeping synthetic filler words weakly or negatively correlated.
    const dims = 300;
    const rawVectorsBytes = new Uint8Array(words.length * dims * 2);
    const decodedVecs = new Array(words.length);

    const groups = new Map([
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
        ['물', [-0.4, -0.4, -0.2]],
    ]);

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
            // Deterministic pseudo-orthogonal directions in higher dimensions so top1k orders cleanly.
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
        const offset = i * dims * 2;
        for (let d = 0; d < dims; d++) {
            const half = encodeFloat16(vec[d] / norm);
            rawVectorsBytes[offset + d * 2] = half & 0xff;
            rawVectorsBytes[offset + d * 2 + 1] = (half >> 8) & 0xff;
        }
        decodedVecs[i] = decodeFloat16Vector(rawVectorsBytes.subarray(offset, offset + dims * 2), dims);
    }

    const topK = 1000;
    const secrets = [];
    const top1kBytes = new Uint8Array(secretWords.length * topK * 8);
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
            sIdx,
            toCentipoints(top[0].sim),
            toCentipoints(top[9].sim),
            toCentipoints(top[topK - 1].sim),
        ]);
        const baseOff = s * topK * 8;
        for (let k = 0; k < topK; k++) {
            top1kView.setUint32(baseOff + k * 8, top[k].wIdx, true);
            top1kView.setFloat32(baseOff + k * 8 + 4, top[k].sim, true);
        }
    }

    const vocabJson = JSON.stringify({ version: 'semantle-ko-test-v1', dims, words, secrets });
    const files = {
        'semantle-ko/v1/vocab.json': new TextEncoder().encode(vocabJson),
        'semantle-ko/v1/vectors.f16': rawVectorsBytes,
        'semantle-ko/v1/secrets-top1k.bin': top1kBytes,
    };

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

    return { store, words, secrets, vocabJson, decodedVecs };
}

export function harness(storeOptions) {
    clearVectorCache();
    const db = database();
    const semantleStore = createSemantleStore(storeOptions);
    const env = { DB: db, SEMANTLE_STORE: semantleStore.store };
    const queues = new Map();

    async function fetch(request) {
        const key = request.headers.get('Authorization') || '';
        const next = (queues.get(key) || Promise.resolve()).then(() => handleRoomRequest(request, env));
        queues.set(key, next.catch(() => {}));
        return next;
    }

    const token = 'a'.repeat(64);
    async function call(path, body, method = body ? 'POST' : 'GET', secret = token) {
        const result = await fetch(new Request('https://api/twenty-questions/' + path, {
            method,
            headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {}),
        }));
        return { status: result.status, data: await result.json() };
    }

    async function start(secret = token) {
        return (await call('games', { locale: 'ko', requestId: crypto.randomUUID() }, 'POST', secret)).data;
    }

    function sqliteRow(query, ...values) {
        return db.sqlite.prepare(query).get(...values);
    }

    function answer(gameId) {
        return sqliteRow('SELECT answer_word FROM sm_games WHERE id = ?', gameId).answer_word;
    }

    async function guess(game, text, requestId = crypto.randomUUID(), secret = token) {
        return call(`games/${game.id}/guesses`, { text, expectedVersion: game.version, requestId }, 'POST', secret);
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
    };
}
