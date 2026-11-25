import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    decodeFloat16Vector,
    decodeInt8Vector,
    dotNormalized,
    toCentipoints,
    formatSimilarity,
    findWordIndex,
    loadVocab,
    lookupWordVector,
    loadSecretTop1k,
    scoreGuessWord,
    loadHotPack,
    clearVectorCache,
} from '../../server/twenty-questions/vectors.mjs';
import { createSemantleStore, KO_V2_ONLY, EN_V2_ONLY } from './helpers.mjs';

test('binary search finds sorted Korean words accurately', () => {
    const { words } = createSemantleStore();
    for (let i = 1; i < words.length; i++) {
        assert.ok(words[i - 1] < words[i], `not strictly sorted at ${i}`);
    }
    for (const target of ['사람', '사랑', '학교', '행복', '물', '드라이기', '아메리카노', '에어프라이어']) {
        const idx = findWordIndex(words, target);
        assert.ok(idx >= 0, `missing ${target}`);
        assert.equal(words[idx], target);
    }
    assert.equal(findWordIndex(words, '존재하지않는단어'), -1);
});

test('hot-pack zero-R2 lookup, cold-shard block lookup, int8 decoder, and LRU caching work cleanly', async () => {
    const { store } = createSemantleStore();
    const env = { SEMANTLE_STORE: store };
    const vocab = await loadVocab(env);
    assert.ok(vocab.totalVocab >= 1030);

    // Hot word uses 0 range calls once hot-pack is loaded
    const vHappy = await lookupWordVector(env, '행복');
    const callsAfterHotLoad = store.rangeCalls.length;
    const vJoy = await lookupWordVector(env, '기쁨');
    const vDryer = await lookupWordVector(env, '드라이기');
    assert.equal(store.rangeCalls.length, callsAfterHotLoad);

    assert.equal(vHappy.length, 300);
    const selfSim = dotNormalized(vHappy, vHappy);
    assert.ok(Math.abs(selfSim - 1) < 1e-4, `selfSim=${selfSim}`);
    assert.ok(dotNormalized(vHappy, vJoy) > 0.7);
    assert.ok(dotNormalized(vHappy, vDryer) < 0);

    // Cold word triggers 1 range read on cold-0.bin, then hits coldBlockCache on repeat
    const callsBeforeCold = store.rangeCalls.length;
    const vAir = await lookupWordVector(env, '에어프라이어');
    assert.ok(vAir && vAir.length === 300);
    assert.equal(store.rangeCalls.length, callsBeforeCold + 1);
    const vAirCached = await lookupWordVector(env, '에어프라이어');
    assert.equal(store.rangeCalls.length, callsBeforeCold + 1);
    assert.ok(Math.abs(dotNormalized(vAir, vAirCached) - 1) < 1e-5);

    assert.equal(toCentipoints(0.55564), 5556);
    assert.equal(formatSimilarity(5556), 55.56);
    assert.equal(formatSimilarity(-1234), -12.34);
});

test('scoreGuessWord distinguishes exact match, Top-1,000 ranked hit, outside-1,000 hot & cold hits, and OOV', async () => {
    const { store } = createSemantleStore({ secretWords: ['행복'] });
    const env = { SEMANTLE_STORE: store };
    const vocab = await loadVocab(env);

    const top1k = await loadSecretTop1k(env, 0, vocab);
    assert.equal(top1k.list.length, 1000);

    const exact = await scoreGuessWord(env, vocab, 0, '행복');
    assert.equal(exact.exact, true);
    assert.equal(exact.rank, 0);
    assert.equal(exact.simCenti, 10000);

    const ranked = await scoreGuessWord(env, vocab, 0, '기쁨');
    assert.equal(ranked.exact, false);
    assert.equal(ranked.rank, 1);
    assert.ok(ranked.simCenti > 7000);

    const hotOutside = await scoreGuessWord(env, vocab, 0, '물');
    assert.equal(hotOutside.exact, false);
    assert.equal(hotOutside.rank, null);
    assert.ok(hotOutside.simCenti < 0);

    const coldOutside = await scoreGuessWord(env, vocab, 0, '에어프라이어');
    assert.equal(coldOutside.exact, false);
    assert.equal(coldOutside.rank, null);
    assert.ok(coldOutside.simCenti < 0);

    const oov = await scoreGuessWord(env, vocab, 0, '없는외계어');
    assert.equal(oov, null);

    const fullBuffer = Buffer.alloc(600 * 3);
    const vecF16 = decodeFloat16Vector(fullBuffer.subarray(0, 600));
    assert.equal(vecF16.length, 300);
    const int8Buf = new Uint8Array(302);
    int8Buf[0] = 0x00;
    int8Buf[1] = 0x3c; // 1.0 in float16
    int8Buf[2] = 100;
    const vecI8 = decodeInt8Vector(int8Buf, 0, 300);
    assert.ok(Math.abs(vecI8[0] - 1) < 1e-5);
});

const SCRATCH_V2 = 'C:/Users/user/.gemini/antigravity/brain/6c49ba5a-ab31-41a1-8921-f75797ef1f9c/scratch/semantle-build/out-v2';
test('local built v2 FastText 1.50M-word pack resolves hot & cold probes accurately (when present)', { skip: !fs.existsSync(`${SCRATCH_V2}/secrets-meta.json`) }, async () => {
    const meta = JSON.parse(fs.readFileSync(`${SCRATCH_V2}/secrets-meta.json`, 'utf8'));
    const cache = new Map();
    const env = {
        SEMANTLE_STORE: {
            async get(key, opts) {
                const name = key.split('/').pop();
                const filePath = `${SCRATCH_V2}/${name}`;
                if (!fs.existsSync(filePath)) return null;
                if (name.endsWith('.json')) {
                    const text = fs.readFileSync(filePath, 'utf8');
                    return { async json() { return JSON.parse(text); } };
                }
                if (!opts?.range) {
                    if (!cache.has(filePath)) cache.set(filePath, fs.readFileSync(filePath));
                    const b = cache.get(filePath);
                    return { async arrayBuffer() { return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } };
                }
                const fd = fs.openSync(filePath, 'r');
                const buf = Buffer.alloc(opts.range.length);
                fs.readSync(fd, buf, 0, opts.range.length, opts.range.offset);
                fs.closeSync(fd);
                return { async arrayBuffer() { return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength); } };
            },
        },
    };
    const vocab = await loadVocab(env);
    assert.ok(vocab.totalVocab >= 1500000);
    assert.ok(meta.secrets.length >= 4500);

    for (const probe of ['드라이기', '헤어드라이어', '아메리카노', '에어프라이어', '민트초코', '떡볶이', '삼겹살']) {
        const res = await scoreGuessWord(env, vocab, 0, probe);
        assert.ok(res !== null, `Missing expected Korean word in v2 pack: ${probe}`);
    }

    const top1k = await loadSecretTop1k(env, 0, vocab);
    assert.equal(top1k.list.length, 1000);
    const rank1Word = top1k.list[0].word;
    const rank1Scored = await scoreGuessWord(env, vocab, 0, rank1Word);
    assert.equal(rank1Scored.rank, 1);
    assert.equal(formatSimilarity(rank1Scored.simCenti), top1k.list[0].similarity);
});

test('English hot-pack, cold-shard, scoreGuessWord, and ko/en cache separation work cleanly', async () => {
    const { store } = createSemantleStore({ enSecretWords: ['happy'] });
    const env = { SEMANTLE_STORE: store };
    const koVocab = await loadVocab(env, 'ko');
    const enVocab = await loadVocab(env, 'en');
    assert.notEqual(koVocab.version, enVocab.version);
    assert.ok(enVocab.totalVocab >= 1030);

    const vHappy = await lookupWordVector(env, 'happy', 300, 'en');
    const callsAfterHotLoad = store.rangeCalls.length;
    const vJoy = await lookupWordVector(env, 'joy', 300, 'en');
    assert.equal(store.rangeCalls.length, callsAfterHotLoad);
    assert.ok(dotNormalized(vHappy, vJoy) > 0.7);

    // Cold English word triggers 1 range read on semantle-en cold-0.bin, then LRU-cached
    const callsBeforeCold = store.rangeCalls.length;
    const vAir = await lookupWordVector(env, 'airfryer', 300, 'en');
    assert.ok(vAir && vAir.length === 300);
    assert.equal(store.rangeCalls.length, callsBeforeCold + 1);
    await lookupWordVector(env, 'airfryer', 300, 'en');
    assert.equal(store.rangeCalls.length, callsBeforeCold + 1);

    const exact = await scoreGuessWord(env, enVocab, 0, 'happy', null, 'en');
    assert.equal(exact.exact, true);
    assert.equal(exact.rank, 0);

    const ranked = await scoreGuessWord(env, enVocab, 0, 'joy', null, 'en');
    assert.equal(ranked.rank, 1);

    const coldOutside = await scoreGuessWord(env, enVocab, 0, 'airfryer', null, 'en');
    assert.equal(coldOutside.rank, null);

    // Cross-language probe misses cleanly without bleeding caches
    assert.equal(await scoreGuessWord(env, enVocab, 0, '행복', null, 'en'), null);
    assert.equal(await scoreGuessWord(env, koVocab, 0, 'happy', null, 'ko'), null);
});

const SCRATCH_EN_V2 = 'C:/Users/user/.gemini/antigravity/brain/8794a22b-c998-439a-8a5e-4fd209af8e96/scratch/semantle-en-build/out-en-v2';
test('local built en-v2 FastText pack resolves hot & cold probes accurately (when present)', { skip: !fs.existsSync(`${SCRATCH_EN_V2}/secrets-meta.json`) }, async () => {
    const meta = JSON.parse(fs.readFileSync(`${SCRATCH_EN_V2}/secrets-meta.json`, 'utf8'));
    const cache = new Map();
    const env = {
        SEMANTLE_STORE: {
            async get(key, opts) {
                const name = key.split('/').pop();
                const filePath = `${SCRATCH_EN_V2}/${name}`;
                if (!fs.existsSync(filePath)) return null;
                if (name.endsWith('.json')) {
                    const text = fs.readFileSync(filePath, 'utf8');
                    return { async json() { return JSON.parse(text); } };
                }
                if (!opts?.range) {
                    if (!cache.has(filePath)) cache.set(filePath, fs.readFileSync(filePath));
                    const b = cache.get(filePath);
                    return { async arrayBuffer() { return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } };
                }
                const fd = fs.openSync(filePath, 'r');
                const buf = Buffer.alloc(opts.range.length);
                fs.readSync(fd, buf, 0, opts.range.length, opts.range.offset);
                fs.closeSync(fd);
                return { async arrayBuffer() { return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength); } };
            },
        },
    };
    const vocab = await loadVocab(env, 'en');
    assert.ok(vocab.totalVocab >= 300000);
    assert.ok(meta.secrets.length >= 4500);

    for (const probe of ['person', 'food', 'school', 'nature', 'happy', 'coffee', 'espresso', 'youtube']) {
        const res = await scoreGuessWord(env, vocab, 0, probe, null, 'en');
        assert.ok(res !== null, `Missing expected English word in en-v2 pack: ${probe}`);
    }

    const top1k = await loadSecretTop1k(env, 0, vocab, 'en');
    assert.equal(top1k.list.length, 1000);
    const rank1Word = top1k.list[0].word;
    const rank1Scored = await scoreGuessWord(env, vocab, 0, rank1Word, null, 'en');
    assert.equal(rank1Scored.rank, 1);
    assert.equal(formatSimilarity(rank1Scored.simCenti), top1k.list[0].similarity);
});

test('v2 and v3 packs load side by side; only v2 still accepts words outside the ranked vocabulary', async () => {
    const { store } = createSemantleStore({ secretWords: ['행복'], enSecretWords: ['school'] });
    const env = { SEMANTLE_STORE: store };
    const v3 = await loadVocab(env, 'ko');
    const v2 = await loadVocab(env, 'ko', 'v2');
    assert.equal(v3.pack, 'v3');
    assert.equal(v3.guessableEqualsRanked, true);
    assert.equal(v2.pack, 'v2');
    assert.equal(v2.guessableEqualsRanked, false);
    assert.deepEqual(v2.secrets.map(row => row[0]), v3.secrets.map(row => row[0]));

    const legacy = await scoreGuessWord(env, v2, 0, KO_V2_ONLY);
    assert.equal(legacy.rank, 1);
    assert.equal(await scoreGuessWord(env, v3, 0, KO_V2_ONLY), null);
    assert.equal((await scoreGuessWord(env, v3, 0, '기쁨')).rank, 1);

    const enV3 = await loadVocab(env, 'en');
    const enV2 = await loadVocab(env, 'en', 'v2');
    assert.equal((await scoreGuessWord(env, enV2, 0, EN_V2_ONLY, null, 'en')).rank, 1);
    assert.equal(await scoreGuessWord(env, enV3, 0, EN_V2_ONLY, null, 'en'), null);
    await assert.rejects(loadVocab(env, 'ko', 'v9'), /service_unavailable/);
});

test('loading one pack\'s hot pack releases the other pack\'s hot pack for the same language', async () => {
    const { store } = createSemantleStore();
    const reads = [];
    const counting = { async get(key, opts) { reads.push(key); return store.get(key, opts); } };
    const env = { SEMANTLE_STORE: counting };
    const hotReads = key => reads.filter(k => k === key).length;

    await loadHotPack(env, 'ko', 'v2');
    await loadHotPack(env, 'ko', 'v2');
    assert.equal(hotReads('semantle-ko/v2/hot-pack.bin'), 1);
    await loadHotPack(env, 'en', 'v3');
    await loadHotPack(env, 'ko', 'v2');
    assert.equal(hotReads('semantle-ko/v2/hot-pack.bin'), 1, 'another language must not evict ko');
    await loadHotPack(env, 'ko', 'v3');
    await loadHotPack(env, 'ko', 'v2');
    assert.equal(hotReads('semantle-ko/v2/hot-pack.bin'), 2, 'v3 load released the v2 hot pack');
});

// Real v3 packs built by tools/build-semantle-v3-pack.py. Point SEMANTLE_V3_KO_DIR / SEMANTLE_V3_EN_DIR at the output dirs.
function diskStore(prefix, dir) {
    return {
        async get(key, opts) {
            if (!key.startsWith(prefix)) return null;
            const file = `${dir}/${key.slice(prefix.length)}`;
            if (!fs.existsSync(file)) return null;
            let bytes;
            if (opts?.range) {
                const fd = fs.openSync(file, 'r');
                bytes = Buffer.alloc(opts.range.length);
                fs.readSync(fd, bytes, 0, opts.range.length, opts.range.offset);
                fs.closeSync(fd);
            } else {
                bytes = fs.readFileSync(file);
            }
            const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            return { async arrayBuffer() { return copy; }, async json() { return JSON.parse(bytes.toString('utf8')); } };
        },
    };
}

async function assertRealPackMonotonic(lang, dir, { mustAccept, mustReject }) {
    clearVectorCache();
    const env = { SEMANTLE_STORE: diskStore(`semantle-${lang}/v3/`, dir) };
    const vocab = await loadVocab(env, lang);
    assert.equal(vocab.guessableEqualsRanked, true);
    assert.equal(vocab.totalVocab, vocab.rankedVocab);
    const hot = await loadHotPack(env, lang);
    const hotWords = [];
    for (let i = 0; i < hot.count; i += 97) {
        const start = hot.view.getUint32(hot.offsetsBase + i * 4, true);
        const end = hot.view.getUint32(hot.offsetsBase + (i + 1) * 4, true);
        hotWords.push(new TextDecoder().decode(hot.bytes.subarray(hot.wordsBase + start, hot.wordsBase + end)));
    }
    for (const word of mustAccept) assert.ok(await scoreGuessWord(env, vocab, 0, word, null, lang), `${word} must be guessable`);
    for (const word of mustReject) assert.equal(await scoreGuessWord(env, vocab, 0, word, null, lang), null, `${word} must be rejected`);

    const step = Math.max(1, Math.floor(vocab.secrets.length / 40));
    for (let secretId = 0; secretId < vocab.secrets.length; secretId += step) {
        const top1k = await loadSecretTop1k(env, secretId, vocab, lang);
        for (let k = 1; k < top1k.list.length; k++) assert.ok(top1k.list[k - 1].similarity >= top1k.list[k].similarity);
        for (const item of top1k.list.filter((_, k) => k % 50 === 0)) {
            const scored = await scoreGuessWord(env, vocab, secretId, item.word, null, lang);
            assert.equal(scored.rank, item.rank);
        }
        for (const word of hotWords) {
            if (word === vocab.secrets[secretId][0]) continue;
            const scored = await scoreGuessWord(env, vocab, secretId, word, null, lang);
            assert.ok(scored, `${word} is in the hot pack, so it must score`);
            if (scored.rank === null) {
                assert.ok(scored.simCenti <= top1k.lastSimCenti, `${lang} secret #${secretId}: unlisted guess beats #1000`);
            }
        }
    }
}

test('real ko v3 pack: rank is monotonic in similarity and inflected forms are rejected (when present)', { skip: !process.env.SEMANTLE_V3_KO_DIR }, async () => {
    await assertRealPackMonotonic('ko', process.env.SEMANTLE_V3_KO_DIR, {
        mustAccept: ['지구과학', '과학탐구', '과학', '드라이기', '아메리카노', '떡볶이', '삼겹살', '유튜브', '사람', '학교', '행복'],
        mustReject: ['과학을', '과학인', '학교에서', '먹었다'],
    });
});

test('real en v3 pack: rank is monotonic in similarity and typos are rejected (when present)', { skip: !process.env.SEMANTLE_V3_EN_DIR }, async () => {
    await assertRealPackMonotonic('en', process.env.SEMANTLE_V3_EN_DIR, {
        mustAccept: ['science', 'smartphones', 'coffee', 'happy'],
        mustReject: ['writting', 'neccessary'],
    });
});
