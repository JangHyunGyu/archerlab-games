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
    assert.equal(calls[0].body.model, 'microsoft/microsoft-decision-1');
    assert.equal(result.answers.supported.noul, .99);
    assert.equal(calls.length, 1);
});

for (const failure of ['http', 'timeout', 'invalid']) test(`direct ${failure} exhausts Microsoft, Jev and Clef`, async t => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        calls.push(JSON.parse(options.body));
        if (failure === 'timeout') throw new DOMException('timeout', 'TimeoutError');
        return Response.json({ answers: { supported: { type: 'noul', noul: 2 } } }, { status: failure === 'http' ? 503 : 200 });
    });
    await assert.rejects(decisionRequest(config, {}, questions, 'ko'));
    assert.deepEqual(calls.map(call => call.model), ['microsoft/microsoft-decision-1', 'typesafe/jev-1.14', 'cloudflare/clef-flash']);
});

for (const winner of [1, 2, 3]) test(`direct path stops at provider ${winner}, including valid uncertainty`, async t => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        const payload = JSON.parse(options.body); calls.push(payload);
        return Response.json({ model: payload.model, answers: { supported: { type: 'noul', noul: .5 } }, usage: { cost: .00001 } }, { status: calls.length < winner ? 503 : 200 });
    });
    const result = await decisionRequest(config, {}, questions, 'ko');
    assert.equal(calls.length, winner);
    assert.equal(result.model, ['microsoft/microsoft-decision-1', 'typesafe/jev-1.14', 'cloudflare/clef-flash'][winner - 1]);
    assert.equal(result.answers.supported.noul, .5);
    assert.ok(Math.abs(result.usage.cost - winner * .00001) < 1e-10);
    assert.deepEqual(calls.map(c => c.provider), ['azure', 'typesafe', 'cloudflare'].slice(0, winner).map(p => ({ only: [p], allow_fallbacks: false })));
});

test('the direct path retains a configured Azure deployment', async t => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        calls.push({ url, options });
        return Response.json({ answers: { supported: { type: 'noul', noul: .99 } } });
    });
    await decisionRequest({ ...config, TQ_DECISION_PROVIDER: 'azure', TQ_AZURE_ENDPOINT: 'https://azure.example', AZURE_API_KEY: 'azure-test', TQ_AZURE_DEPLOYMENT: 'decision-deployment' }, {}, questions, 'ko');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://azure.example/providers/microsoft/v1/systemone');
    assert.equal(JSON.parse(calls[0].options.body).model, 'decision-deployment');
    assert.equal(calls[0].options.headers['api-key'], 'azure-test');
});

test('single-option game questions are resolved locally without a service or key', async () => {
    const result = await decisionRequest({}, {}, { fixed: { type: 'choice', instructions: 'The only available result.', criteria: { selected: 'Selected' } } });
    assert.equal(result.answers.fixed.choice, 'selected');
    assert.equal(result.model, null);
    assert.equal(result.usage.cost, 0);
});

test('direct decisions remove singleton helpers but preserve their instructions and answer', async t => {
    let sent;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        sent = JSON.parse(options.body);
        return Response.json({ answers: { supported: { type: 'noul', noul: .99 } } });
    });
    const result = await decisionRequest(config, { fact: 'A bird.' }, {
        who: { type: 'choice', instructions: 'Use only supplied facts.', criteria: { review: 'Review the evidence.' } }, ...questions
    });
    assert.equal(sent.questions.who, undefined);
    assert.deepEqual(sent.state.resolved_question_rules, ['Use only supplied facts.']);
    assert.match(sent.questions.supported.instructions, /state.resolved_question_rules/);
    assert.equal(result.answers.who.choice, 'review');
});
