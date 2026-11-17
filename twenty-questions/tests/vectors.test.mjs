import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    decodeFloat16Vector,
    dotNormalized,
    toCentipoints,
    formatSimilarity,
    findWordIndex,
    loadVocab,
    loadWordVector,
    loadSecretTop1k,
    scoreGuessWord,
} from '../../server/twenty-questions/vectors.mjs';
import { createSemantleStore } from './helpers.mjs';

test('binary search finds sorted Korean words accurately', () => {
    const { words } = createSemantleStore();
    for (let i = 1; i < words.length; i++) {
        assert.ok(words[i - 1] < words[i], `not strictly sorted at ${i}`);
    }
    for (const target of ['사람', '사랑', '학교', '행복', '물']) {
        const idx = findWordIndex(words, target);
        assert.ok(idx >= 0, `missing ${target}`);
        assert.equal(words[idx], target);
    }
    assert.equal(findWordIndex(words, '존재하지않는단어'), -1);
});

test('float16 decoder and cosine similarity respect bounds and range slicing', async () => {
    const { store, words } = createSemantleStore();
    const env = { SEMANTLE_STORE: store };
    const vocab = await loadVocab(env);
    assert.equal(vocab.words.length, words.length);

    const happyIdx = findWordIndex(vocab.words, '행복');
    const joyIdx = findWordIndex(vocab.words, '기쁨');
    const waterIdx = findWordIndex(vocab.words, '물');
    const vHappy = await loadWordVector(env, happyIdx);
    const vJoy = await loadWordVector(env, joyIdx);
    const vWater = await loadWordVector(env, waterIdx);

    assert.equal(vHappy.length, 300);
    const selfSim = dotNormalized(vHappy, vHappy);
    assert.ok(Math.abs(selfSim - 1) < 1e-4, `selfSim=${selfSim}`);
    assert.ok(dotNormalized(vHappy, vJoy) > 0.7);
    assert.ok(dotNormalized(vHappy, vWater) < 0);
    assert.equal(toCentipoints(0.55564), 5556);
    assert.equal(formatSimilarity(5556), 55.56);
    assert.equal(formatSimilarity(-1234), -12.34);

    // Second call uses LRU cache instead of issuing another range read.
    const callsBefore = store.rangeCalls.length;
    const vHappyCached = await loadWordVector(env, happyIdx);
    assert.equal(vHappyCached, vHappy);
    assert.equal(store.rangeCalls.length, callsBefore);
});

test('scoreGuessWord distinguishes exact match, Top-1,000 ranked hit, outside-1,000 hit, and OOV', async () => {
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

    const outside = await scoreGuessWord(env, vocab, 0, '물');
    assert.equal(outside.exact, false);
    assert.equal(outside.rank, null);
    assert.ok(outside.simCenti < 0);

    const oov = await scoreGuessWord(env, vocab, 0, '없는외계어');
    assert.equal(oov, null);

    // Guard against misbehaving stores that return full buffers ignoring range.
    const fullBuffer = Buffer.alloc(600 * 3);
    const vec = decodeFloat16Vector(fullBuffer.subarray(0, 600));
    assert.equal(vec.length, 300);
});

const SCRATCH_OUT = 'C:/Users/user/.gemini/antigravity/brain/6c49ba5a-ab31-41a1-8921-f75797ef1f9c/scratch/semantle-build/out';
test('local built FastText pack matches JS binary decoder and binary search (when present)', { skip: !fs.existsSync(`${SCRATCH_OUT}/vocab.json`) }, async () => {
    const vocab = JSON.parse(fs.readFileSync(`${SCRATCH_OUT}/vocab.json`, 'utf8'));
    const vecBuf = fs.readFileSync(`${SCRATCH_OUT}/vectors.f16`);
    const topBuf = fs.readFileSync(`${SCRATCH_OUT}/secrets-top1k.bin`);
    const env = {
        SEMANTLE_STORE: {
            async get(key, opts) {
                if (key.endsWith('vocab.json')) return { async json() { return vocab; } };
                const src = key.endsWith('vectors.f16') ? vecBuf : topBuf;
                const s = opts?.range?.offset || 0;
                const e = opts?.range?.length != null ? s + opts.range.length : src.byteLength;
                const slice = src.subarray(s, e);
                return { async arrayBuffer() { return slice.slice().buffer; } };
            },
        },
    };
    const res = await scoreGuessWord(env, vocab, 0, vocab.words[vocab.secrets[0][0]]);
    assert.equal(res.exact, true);
    const top1k = await loadSecretTop1k(env, 0, vocab);
    assert.equal(top1k.list.length, 1000);
    const rank1Word = top1k.list[0].word;
    const rank1Scored = await scoreGuessWord(env, vocab, 0, rank1Word);
    assert.equal(rank1Scored.rank, 1);
    assert.equal(formatSimilarity(rank1Scored.simCenti), top1k.list[0].similarity);
});
