const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('@playwright/test');
const root = path.resolve(__dirname, '../..');
const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    const file = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    const types = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };
    fs.readFile(file, (error, data) => {
        res.writeHead(error ? 404 : 200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
        res.end(error ? '' : data);
    });
});
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    let browser;
    try {
        browser = await chromium.launch();
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
        const errors = [];
        page.on('pageerror', error => { errors.push(error.message); console.error('PAGE ERROR:', error.message); });
        page.on('console', message => { if (/\[ARISE\]/.test(message.text())) console.log(message.text()); });
        await page.route('**/*', route => route.request().url().startsWith(base)
            ? route.continue() : ['script', 'stylesheet'].includes(route.request().resourceType())
                ? route.fulfill({ body: '', contentType: route.request().resourceType() === 'script' ? 'application/javascript' : 'text/css' })
                : route.fulfill({ json: { ok: true, session_id: 'local-arise-test', scores: [] } }));
        await page.goto(base + '/solo-leveling/index.html');
        await page.evaluate(async () => {
            window.testGame = (await import(document.querySelector('script[type="module"]').src)).game;
        });
        await page.waitForFunction(() => window.testGame?.scene.isActive('MenuScene'), null, { timeout: 90000 });
        await page.evaluate(async () => {
            const menu = testGame.scene.getScene('MenuScene');
            await menu._ensureGameplayAssetsLoaded('shadowMonarch');
            menu.scene.start('GameScene', { characterId: 'shadowMonarch' });
        });
        await page.waitForFunction(() => testGame.scene.isActive('GameScene') && !testGame.scene.getScene('GameScene')._isBooting);
        for (const [index, viewport] of [[320,568],[430,932],[768,1024],[1024,768],[844,390],[1440,900]].entries()) {
            const [width, height] = viewport;
            await page.setViewportSize({ width, height });
            await page.emulateMedia({ reducedMotion: index === 4 ? 'reduce' : 'no-preference' });
            await page.waitForTimeout(250);
            await page.evaluate(index => {
                const s = testGame.scene.getScene('GameScene');
                s.player.stats.hp = s.player.stats.maxHp = 1000000;
                // Keep unrelated level-up choices from pausing the resumed battle.
                s.player.xpToNext = Number.MAX_SAFE_INTEGER;
                s.shadowArmyManager.soldiers.forEach(soldier => soldier.destroy());
                s.shadowArmyManager.soldiers = [];
                s._cinematicProbe = { timer: 0, tween: 0 };
                s.time.delayedCall(180, () => s._cinematicProbe.timer++);
                s.tweens.add({ targets: s._cinematicProbe, tween: 100, duration: 300 });
                s.enemyManager._spawnEnemy('goblin', s.player.x + 400, s.player.y + 300);
                const x = index === 0 ? 20 : s.player.x + 320;
                const y = index === 0 ? 30 : s.player.y + 180;
                s.shadowArmyManager.onBossKilled({ x, y, bossKey: ['igris', 'tusk', 'beru'][index % 3] });
            }, index);
            await page.waitForFunction(() => testGame.scene.isActive('AriseScene'));
            await page.keyboard.press('Tab');
            assert.equal(await page.evaluate(() => testGame.scene.getScene('GameScene').statusWindow.isOpen), false);
            const snapshot = () => page.evaluate(() => {
                const s = testGame.scene.getScene('GameScene');
                return { x: s.player.x, y: s.player.y, hp: s.player.stats.hp, elapsed: s.enemyManager.gameTime,
                    probe: { ...s._cinematicProbe }, enemies: s.enemyManager.getActiveEnemies().map(e => [e.x,e.y,e.hp]) };
            });
            const before = await snapshot();
            assert.equal(await page.evaluate(() => testGame.scene.getScene('GameScene').systemMessage.currentElements.every(el => !el.visible)), true);
            await page.waitForTimeout(500);
            assert.deepEqual(await snapshot(), before, 'physics, enemies, HP, timers, and tweens must freeze');
            assert.equal(before.probe.timer, 0);
            const focused = await page.evaluate(() => {
                const s = testGame.scene.getScene('GameScene');
                const boss = s.shadowArmyManager._pendingRecruit;
                return [s, testGame.scene.getScene('AriseScene')].map(scene => {
                    const c = scene.cameras.main;
                    // Check the focus independently of the intentional brief VFX shake.
                    const center = { x: c.scrollX + c.width / 2, y: c.scrollY + c.height / 2 };
                    return { scene: scene.sys.settings.key, dx: center.x - boss.x, dy: center.y - boss.y };
                });
            });
            assert.ok(focused.every(c => Math.abs(c.dx) < 2 && Math.abs(c.dy) < 2),
                'both the map and extraction must center on the boss: ' + JSON.stringify(focused));
            if (index === 1) {
                await page.setViewportSize({ width: 932, height: 430 });
                await page.waitForTimeout(250);
                await page.setViewportSize({ width, height });
            }
            await page.waitForFunction(() => testGame.scene.getScene('GameScene').shadowArmyManager._soldierPreview?.alpha > 0.8, null, { timeout: 20000 });
            if (process.env.SOLO_ARISE_SCREENSHOTS) {
                fs.mkdirSync(process.env.SOLO_ARISE_SCREENSHOTS, { recursive: true });
                await page.screenshot({ path: path.join(process.env.SOLO_ARISE_SCREENSHOTS, `arise-${width}x${height}.png`) });
            }
            try {
                await page.waitForFunction(() => testGame.scene.isActive('GameScene') && !testGame.scene.isActive('AriseScene'), null, { timeout: 15000 });
            } catch (error) {
                console.error(await page.evaluate(() => ({ fps: testGame.loop.actualFps, scenes: testGame.scene.scenes.map(s => [s.sys.settings.key,s.sys.settings.status]), performing: testGame.scene.getScene('GameScene').shadowArmyManager.isPerformingArise, timers: [...testGame.scene.getScene('GameScene').shadowArmyManager._ariseTimers].map(t => [t.delay,t.elapsed,t.paused]) })));
                throw error;
            }
            await page.waitForTimeout(350);
            assert.equal(await page.evaluate(() => testGame.scene.getScene('GameScene').shadowArmyManager.soldiers.length), 1);
            assert.equal(await page.evaluate(() => {
                const s = testGame.scene.getScene('GameScene');
                return s.cameras.main._follow === s.player && s.shadowArmyManager.soldiers[0].scene === s;
            }), true, 'restore player follow and recruit into the combat scene');
            assert.equal(await page.evaluate(() => testGame.scene.getScene('GameScene')._cinematicProbe.timer), 1);
            assert.ok((await snapshot()).elapsed > before.elapsed);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true);
            console.log(`PASS paused combat, centered extraction, automatic resume: ${width}x${height}`);
        }
        assert.deepEqual(errors, []);
    } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
