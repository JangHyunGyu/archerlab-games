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
} from '../../server/twenty-questions/vectors.mjs';
import { createSemantleStore } from './helpers.mjs';

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
