import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, modelResult } from './helpers.mjs';
import { decisionRequest, buildKoreanNameHint, isAlternativeChoiceQuestion, isNonPolarQuestion, judge, parseDecision } from '../../server/twenty-questions/decision.mjs';
import { SEED_CATALOG } from '../../server/twenty-questions/seed-catalog.mjs';

test('Worker RPC receives serializable plain question objects after singleton resolution', async () => {
    let called = false;
    const result = await decisionRequest({ TQ_AI: { async decide(payload) {
        called = true;
        assert.equal(Object.getPrototypeOf(payload.questions), Object.prototype);
        assert.equal(payload.questions.who, undefined);
        assert.deepEqual(payload.state.resolved_question_rules, ['Use facts.']);
        return { answers: { supported: { type: 'noul', noul: .99 } } };
    } } }, {}, {
        who: { type: 'choice', instructions: 'Use facts.', criteria: { review: 'Review' } },
        supported: { type: 'noul', instructions: 'Supported?' },
    });
    assert.equal(called, true);
    assert.equal(result.answers.who.choice, 'review');
});

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
    assert.equal(calls[0].body.model, 'google/gemini-decision-1');
    assert.equal(result.answers.supported.noul, .99);
    assert.equal(calls.length, 1);
});

for (const failure of ['http', 'timeout', 'invalid']) test(`direct ${failure} exhausts Gemini, Microsoft and Jev`, async t => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        calls.push(JSON.parse(options.body));
        if (failure === 'timeout') throw new DOMException('timeout', 'TimeoutError');
        return Response.json({ answers: { supported: { type: 'noul', noul: 2 } } }, { status: failure === 'http' ? 503 : 200 });
    });
    await assert.rejects(decisionRequest(config, {}, questions, 'ko'));
    assert.deepEqual(calls.map(call => call.model), ['google/gemini-decision-1', 'microsoft/microsoft-decision-1', 'typesafe/jev-1.14']);
});

for (const winner of [1, 2, 3]) test(`direct path stops at provider ${winner}, including valid uncertainty`, async t => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        const payload = JSON.parse(options.body); calls.push(payload);
        return Response.json({ model: payload.model, answers: { supported: { type: 'noul', noul: .5 } }, usage: { cost: .00001 } }, { status: calls.length < winner ? 503 : 200 });
    });
    const result = await decisionRequest(config, {}, questions, 'ko');
    assert.equal(calls.length, winner);
    assert.equal(result.model, ['google/gemini-decision-1', 'microsoft/microsoft-decision-1', 'typesafe/jev-1.14'][winner - 1]);
    assert.equal(result.answers.supported.noul, .5);
    assert.ok(Math.abs(result.usage.cost - winner * .00001) < 1e-10);
    assert.deepEqual(calls.map(c => c.provider), ['google-ai-studio', 'azure', 'typesafe'].slice(0, winner).map(p => ({ only: [p], allow_fallbacks: false })));
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

test('non-polar Korean A-vs-B alternative questions resolve to unknown while X-or-not-X polarity stays yes/no', () => {
    for (const q of ['유기물이야 무기물이야?', '생물이니 무생물이니', '동물이에요 아니면 식물이에요?', '실내인가요 실외인가요?']) {
        assert.equal(isAlternativeChoiceQuestion(q), true, q);
        assert.equal(parseDecision(modelResult('yes'), {}, q).code, 'unknown', q);
    }
    for (const q of ['유기물인가 아닌가?', '인간의 눈으로 볼수있는것인가 없는것이가', '생물이야?', '개예요? 고양이예요?']) {
        assert.equal(isAlternativeChoiceQuestion(q), false, q);
    }
    assert.equal(parseDecision(modelResult('yes'), {}, '유기물인가 아닌가?').code, 'yes');
    assert.equal(parseDecision(modelResult('multiple'), {}, '개예요? 고양이예요?').code, 'multiple');
});

test('confident unclear classifications (>= 0.78) stay unknown even with polarized answer_yes', () => {
    const res = {
        answers: {
            question_kind: { type: 'choice', choice: 'unclear', probabilities: { unclear: 0.79, single: 0.21 } },
            supported_by_facts: { type: 'noul', noul: 0.80 },
            answer_yes: { type: 'noul', noul: 0.06 },
        },
        usage: { cost: 0.00001 },
    };
    assert.equal(parseDecision(res, {}, 'IS this about my crush').code, 'unknown');
});

test('judge avoids vehicle category contradiction for traffic light and grounds food vs non-food objects', async () => {
    const payloads = [];
    const env = {
        TQ_AI: {
            async decide(payload) {
                payloads.push(payload);
                return modelResult('no');
            },
        },
    };
    const trafficVerdict = await judge(env, {
        id: 'transport.traffic-light',
        ko: '신호등',
        en: 'traffic light',
        category: 'transport',
        facts: 'A traffic light is a human-made signaling device. It is not a vehicle.',
    }, '탈것인가요', [], 'ko');
    assert.equal(trafficVerdict.code, 'no');
    assert.doesNotMatch(payloads[0].state.fixed_answer.facts, /이동수단\/탈것/);
    assert.match(payloads[0].state.fixed_answer.facts, /NOT a vehicle or rideable transport/);

    await judge(env, {
        id: 'food.cucumber',
        ko: '오이',
        en: 'cucumber',
        category: 'food',
        facts: 'A cucumber is a widely cultivated plant food.',
    }, '물건인가요?', [], 'ko');
    assert.match(payloads[1].state.fixed_answer.facts, /"물건인가요\?" = NO\/아니오/);
});

test('judge builds RPC payloads under limits for every catalog concept', async () => {
    for (const entry of SEED_CATALOG) {
        let captured;
        const env = {
            TQ_AI: {
                async decide(payload) {
                    captured = payload;
                    return modelResult('no');
                },
            },
        };
        const res = await judge(env, entry, '집에서 무언가를 볼 수 있나요?', [], 'ko');
        assert.equal(res.code, 'no', entry.id);
        assert.equal(Object.keys(captured.questions).length, 3, entry.id);
        for (const [name, q] of Object.entries(captured.questions)) {
            assert.ok(q.instructions.length < 1500, `${entry.id}.${name} instructions too long: ${q.instructions.length}`);
        }
        const bytes = Buffer.byteLength(JSON.stringify(captured), 'utf8');
        assert.ok(bytes <= 24576, `${entry.id} RPC payload too large: ${bytes}`);
        assert.ok(Array.isArray(captured.state.pragmatics) && captured.state.pragmatics.length > 0, entry.id);
    }
});

test('non-polar wh-questions and widened A-vs-B choices resolve deterministically to unknown while polar queries run', async () => {
    for (const q of [
        '뭐예요?',
        '가격이 얼마인가요?',
        '몇 글자예요?',
        '어디에서 사나요?',
        '무슨 색깔인가요?',
        '동물인가요, 식물인가요?',
        '과일입니까 채소입니까?',
        'What is it?',
        'Which continent does it live in?',
        'How many legs does it have?',
    ]) {
        assert.equal(isNonPolarQuestion(q), true, q);
        const result = await judge({ TQ_AI: { async decide() { throw new Error('must not call AI'); } } }, SEED_CATALOG[0], q, [], 'ko');
        assert.equal(result.code, 'unknown', q);
        assert.equal(result.model, 'rule:non-polar', q);
    }

    for (const q of [
        '무언가를 볼 수 있나요?',
        '눈으로 볼 수 있나요?',
        '음식이나 음료인가요?',
        '유기물인가 아닌가?',
        '25센치 미만인가요?',
        'Is it bigger than a breadbox?',
    ]) {
        assert.equal(isNonPolarQuestion(q), false, q);
    }
});

test('buildKoreanNameHint covers length, first/last syllable, and character inclusion', () => {
    assert.match(buildKoreanNameHint('카메라', '첫 글자가 카인가요?'), /First syllable equals "카" => YES\/예/);
    assert.match(buildKoreanNameHint('카메라', '끝 글자가 라인가요?'), /Last syllable equals "라" => YES\/예/);
    assert.match(buildKoreanNameHint('카메라', '글자 수가 3글자인가요?'), /3 == 3 => YES\/예/);
    assert.match(buildKoreanNameHint('카메라', '"메"라는 글자가 들어가나요?'), /DOES contain "메"/);
    assert.match(buildKoreanNameHint('카메라', '이름에 바가 포함되나요?'), /does NOT contain "바"/);
});
