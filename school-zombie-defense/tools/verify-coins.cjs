'use strict';
// Real GameScene/Chrome integration, with every API request routed to local SQLite.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('@playwright/test');
const { server, d1, storage } = require('../../tests/helpers/ranking-delivery.cjs');
const root = path.resolve(__dirname, '../..');
const output = process.env.ZOMBIE_QA_OUTPUT || path.resolve(root, '../output/zombie-coins-20261004');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml', '.mp3':'audio/mpeg', '.woff2':'font/woff2', '.json':'application/json' };
const staticServer = http.createServer((request, response) => {
  let relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (relative.endsWith('/')) relative += 'index.html';
  const file = path.resolve(root, '.' + relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end(); return;
  }
  response.writeHead(200, { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' });
  fs.createReadStream(file).pipe(response);
});

(async () => {
  fs.mkdirSync(output, { recursive:true });
  await new Promise(resolve => staticServer.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + staticServer.address().port;
  const db = d1(); await server.initDB(db);
  const boxes = new Map();
  const env = { DB:db, RANKING_DELIVERY:{ getByName(id) {
    if (!boxes.has(id)) boxes.set(id, new server.RankingDelivery({ storage:storage() }, { DB:db }));
    return boxes.get(id);
  } } };
  const browser = await chromium.launch({ channel:'chrome', headless:true });
  try {
    const context = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, serviceWorkers:'block' });
    let offline = false;
    await context.route('https://game-api.yama5993.workers.dev/**', async route => {
      if (offline) { await route.abort('internetdisconnected'); return; }
      const q = route.request();
      const result = await server.deliveryWorker.fetch(new Request(q.url(), {method:q.method(), headers:q.headers(), body:q.postData() || undefined}), env);
      await route.fulfill({ status:result.status, headers:Object.fromEntries(result.headers), body:await result.text() });
    });
    const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/school-zombie-defense/?autostart');
    await page.waitForFunction(() => window.__schoolZombieDefense?.scene.getScene('GameScene')?.rankSessionId);
    db.sql.exec('UPDATE school_zombie_profiles SET coins=100');
    await page.evaluate(() => window.__schoolZombieDefense.scene.getScene('GameScene').ensureServerProfile({force:true}));
    const prepareReroll = async () => page.evaluate(() => {
      const s = window.__schoolZombieDefense.scene.getScene('GameScene'); s.scene.pause();
      s.mode='playing'; s.kills=9; s.coins=9; s.rewardCounts={1:9,2:0,3:0,4:0};
      s.openSkillChoice(); s.rerollSkillChoices();
      s.scene.resume();
      return {coins:s.coins, rerolls:s.runRerollLevels};
    });
    assert.deepEqual(await prepareReroll(), {coins:4,rerolls:[2]});
    const online = await page.evaluate(async () => {
      const s=window.__schoolZombieDefense.scene.getScene('GameScene');
      const paid=await Promise.all([s.bankRunCoins(),s.bankRunCoins()]);
      return {paid,coins:s.meta.coins,displayed:s.getDisplayedCoins(),banked:s.runCoinsBanked};
    });
    assert.deepEqual(online, {paid:[4,4],coins:104,displayed:104,banked:true});
    await page.reload(); await page.waitForFunction(() => window.__schoolZombieDefense.scene.getScene('GameScene')?.rankSessionId);
    assert.equal(await page.evaluate(() => window.__schoolZombieDefense.scene.getScene('GameScene').meta.coins),104);
    await prepareReroll(); offline=true;
    await page.evaluate(async () => {const s=window.__schoolZombieDefense.scene.getScene('GameScene');s.mode='paused';await s.returnToMenuFromRun();});
    const pending = await page.evaluate(() => {
      const s=window.__schoolZombieDefense.scene.getScene('GameScene');
      return {mode:s.mode,coins:s.meta.coins,runCoins:s.coins,pending:window.ArcherRanking.pending().filter(e=>e.path.endsWith('/bank-run')).length};
    });
    assert.deepEqual(pending,{mode:'menu',coins:104,runCoins:0,pending:1});
    await page.goto(origin + '/school-zombie-defense/'); await page.waitForFunction(() => window.__schoolZombieDefense.scene.getScene('GameScene')?.mode==='menu');
    const journal = await page.evaluate(() => window.ArcherRanking.pending().find(e=>e.path.endsWith('/bank-run')).body.event);
    assert.equal(journal.run_coins,4); assert.deepEqual(journal.reroll_levels,[2]);
    offline=false; await page.evaluate(() => window.ArcherRanking.flush());
    await page.waitForFunction(() => window.__schoolZombieDefense.scene.getScene('GameScene').meta.coins===108);
    assert.equal(db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,108);
    await page.evaluate(() => window.__schoolZombieDefense.scene.getScene('GameScene').startRun());
    await page.waitForFunction(() => window.__schoolZombieDefense.scene.getScene('GameScene').rankSessionId);
    await prepareReroll(); offline=true;
    await page.evaluate(() => window.__schoolZombieDefense.scene.getScene('GameScene').gameOver());
    await page.waitForTimeout(650);
    const screens=[];
    for (const [width,height] of [[320,568],[390,844],[768,1024],[1440,900]]) {
      await page.setViewportSize({width,height}); await page.waitForTimeout(150);
      const view=await page.evaluate(() => {const close=document.querySelector('#ranking-delivery-status button').getBoundingClientRect();return {width:innerWidth,height:innerHeight,closeWidth:close.width,closeHeight:close.height,overflow:document.documentElement.scrollWidth>innerWidth,summary:window.__schoolZombieDefense.scene.getScene('GameScene').gameOverCoinsText.text};});
      assert.ok(view.closeWidth>=44 && view.closeHeight>=44);assert.equal(view.overflow,false);
      screens.push(view); await page.screenshot({path:path.join(output,`pending-${width}.png`)});
    }
    offline=false; await page.evaluate(() => window.ArcherRanking.flush());
    await page.waitForFunction(() => window.__schoolZombieDefense.scene.getScene('GameScene').meta.coins===112);
    const completed=await page.evaluate(() => {const s=window.__schoolZombieDefense.scene.getScene('GameScene');return {coins:s.meta.coins,banked:s.runCoinsBanked,pending:window.ArcherRanking.pending().length,summary:s.gameOverCoinsText.text};});
    assert.equal(completed.pending,0);assert.equal(completed.banked,true);
    assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM school_zombie_coin_claims').get().n,3);
    assert.equal(errors.length,0,errors.join('\n'));
    const result={online,pending,journal,screens,completed,errors};
    fs.writeFileSync(path.join(output,'browser-coins.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  } finally { await browser.close(); await new Promise(resolve=>staticServer.close(resolve)); }
})().catch(error=>{console.error(error);staticServer.close();process.exitCode=1;});
