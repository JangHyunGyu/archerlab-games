import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, modelResult } from './helpers.mjs';
import { decisionRequest } from '../../server/twenty-questions/decision.mjs';

for (const locale of ['ko', 'ko-KR', 'en', 'ja']) test(`game page ${locale} reaches the decision service without changing turn accounting`, async () => {
    const h = harness();
    const { game } = await h.start();
    let seen;
    h.env.TQ_AI = { async decide(payload) { seen = payload; return modelResult(); } };
    const response = await h.call(`games/${game.id}/questions`, { locale, text: 'Is it alive?', expectedVersion: game.version, requestId: crypto.randomUUID() });
    assert.equal(response.status, 200);
    assert.equal(seen.outputLanguage, locale);
    assert.equal(response.data.game.remaining, 19);
    assert.equal(seen.state.player_question, 'Is it alive?');
    h.db.sqlite.close();
});

const questions = { supported: { type: 'noul', instructions: 'Supported?' } };
const config = { OPENROUTER_API_KEY: 'test-key', KO_DECISION_MODEL_PRESET: 'solar-decide-flash-upstage' };
for (const locale of ['ko', 'ko-KR', 'en', 'ja', '']) test(`direct decision path ${locale || 'offline catalog'} selects the configured route`, async t => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        calls.push({ url, body: JSON.parse(options.body) });
        return Response.json({ answers: { supported: { type: 'noul', noul: .99 } }, usage: { cost: .000005 } });
    });
    const result = await decisionRequest(config, { fact: 'A bird.' }, questions, locale);
    assert.equal(calls[0].body.model, locale.startsWith('ko') ? 'upstage/solar-decide-flash' : 'microsoft/microsoft-decision-1');
    if (locale.startsWith('ko')) assert.deepEqual(calls[0].body.provider, { only: ['upstage'], allow_fallbacks: false });
    assert.equal(result.answers.supported.noul, .99);
    assert.equal(calls.length, 1);
});

for (const failure of ['http', 'timeout', 'invalid']) test(`direct Solar ${failure} preserves the existing provider and accumulated usage`, async t => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        const body = JSON.parse(options.body); calls.push(body);
        if (calls.length === 1) {
            if (failure === 'timeout') throw new DOMException('timeout', 'TimeoutError');
            return Response.json({ answers: { supported: { type: 'noul', noul: 2 } }, usage: { cost: .000005 } }, { status: failure === 'http' ? 503 : 200 });
        }
        return Response.json({ answers: { supported: { type: 'noul', noul: .99 } }, usage: { cost: .0000042 } });
    });
    const result = await decisionRequest(config, {}, questions, 'ko');
    assert.deepEqual(calls.map(call => call.model), ['upstage/solar-decide-flash', 'microsoft/microsoft-decision-1']);
    assert.ok(Math.abs(result.usage.cost - (failure === 'timeout' ? .0000042 : .0000092)) < 1e-12);
});

test('Korean direct fallback can return to a configured Azure deployment', async t => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        calls.push({ url, options });
        return calls.length === 1 ? Response.json({}, { status: 503 }) : Response.json({ answers: { supported: { type: 'noul', noul: .99 } } });
    });
    await decisionRequest({ ...config, TQ_DECISION_PROVIDER: 'azure', TQ_AZURE_ENDPOINT: 'https://azure.example', AZURE_API_KEY: 'azure-test', TQ_AZURE_DEPLOYMENT: 'decision-deployment' }, {}, questions, 'ko');
    assert.equal(calls[1].url, 'https://azure.example/providers/microsoft/v1/systemone');
    assert.equal(JSON.parse(calls[1].options.body).model, 'decision-deployment');
    assert.equal(calls[1].options.headers['api-key'], 'azure-test');
});
