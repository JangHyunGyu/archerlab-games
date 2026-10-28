import { chromium } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const directory = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const browser = await chromium.launch();
try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8090/twenty-questions/', { waitUntil: 'networkidle' });
    await page.locator('#start').click(); await page.locator('#game-screen').waitFor({ state: 'visible' });
    const gameId = await page.evaluate(() => localStorage.getItem('archerlab_twenty_game'));
    let answer;
    for (const file of fs.readdirSync(directory).filter(name => name.endsWith('.sqlite'))) {
        const db = new DatabaseSync(path.join(directory, file), { readOnly: true });
        try {
            if (db.prepare("SELECT name FROM sqlite_master WHERE name = 'tq_games'").get()) {
                const game = db.prepare('SELECT answer_json FROM tq_games WHERE id = ?').get(gameId);
                if (game) answer = JSON.parse(game.answer_json);
            }
        } finally { db.close(); }
    }
    assert.ok(answer);
    await page.locator('#question-input').fill('동물인가요?'); await page.locator('#send').click();
    await page.locator('.history-row').waitFor();
    assert.ok(!(await page.locator('#notice').isVisible()));
    const first = await page.locator('.stamp').textContent();
    await page.locator('.languages a[lang=en]').click(); await page.locator('#game-screen').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => localStorage.getItem('archerlab_twenty_game')), gameId);
    await page.locator('#question-mode').click(); await page.locator('#question-input').fill('Is it made by humans?'); await page.locator('#send').click();
    await page.waitForFunction(() => document.querySelectorAll('.history-row').length === 2);
    const second = await page.locator('.stamp').last().textContent();
    await page.locator('#guess-mode').click(); await page.locator('#question-input').fill(answer.en); await page.locator('#send').click();
    await page.locator('#result-screen').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#result-streak').textContent(), '1');
    assert.equal(await page.locator('#result-answer').textContent(), answer.en);
    await page.waitForTimeout(1100);
    await page.screenshot({ path: 'tmp/twenty-questions-qa/native-worker-success.png', fullPage: true });
    assert.deepEqual(errors, []);
    const report = { runtime: 'Cloudflare Workerd + local D1 + local Durable Object + remote production AI RPC', result: 'won', first, second, errors, interceptedRequests: 0 };
    fs.writeFileSync('tmp/twenty-questions-qa/native-worker-browser.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
} finally { await browser.close(); }
