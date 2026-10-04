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
    context.setDefaultTimeout(25000);
    let offline = false, authFailure = 0, profileRequests = 0;
    await context.route('https://game-api.yama5993.workers.dev/**', async route => {
      if (offline) { await route.abort('internetdisconnected'); return; }
      const q = route.request();
      if (new URL(q.url()).pathname === '/school-zombie/profile') {
        profileRequests++;
        if (authFailure) { await route.fulfill({ status:authFailure, contentType:'application/json', body:'{"error":"temporary profile failure"}' }); return; }
      }
      const result = await server.deliveryWorker.fetch(new Request(q.url(), {method:q.method(), headers:q.headers(), body:q.postData() || undefined}), env);
      await route.fulfill({ status:result.status, headers:Object.fromEntries(result.headers), body:await result.text() });
    });
    const page = await context.newPage(); page.setDefaultTimeout(25000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
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
    if(process.argv.includes('--retry-only')) {
      await prepareReroll();
      await page.evaluate(async () => {
        const s=window.__schoolZombieDefense.scene.getScene('GameScene');
        s.originalBank=s.bankRunCoins;s.bankRunCoins=async()=>0;s.mode='paused';await s.returnToMenuFromRun();
      });
      const retryScreens=[];
      for(const [width,height] of [[320,568],[390,844],[768,1024],[1440,900]]) {
        await page.setViewportSize({width,height});await page.waitForTimeout(150);
        const view=await page.evaluate(() => {
          const s=window.__schoolZombieDefense.scene.getScene('GameScene');
          const button=s.overlayObjects.find(o=>o.input?.hitArea?.height===80);
          const scale=document.querySelector('canvas').getBoundingClientRect().width/540;
          return {mode:s.mode,runCoins:s.coins,hitWidth:button.input.hitArea.width*scale,hitHeight:button.input.hitArea.height*scale,overflow:document.documentElement.scrollWidth>innerWidth};
        });
        assert.equal(view.mode,'gameover');assert.equal(view.runCoins,4);assert.ok(view.hitWidth>=44&&view.hitHeight>=44);assert.equal(view.overflow,false);
        retryScreens.push({width,height,...view});await page.screenshot({path:path.join(output,`reward-retry-${width}.png`)});
      }
      await page.evaluate(async () => {const s=window.__schoolZombieDefense.scene.getScene('GameScene');s.bankRunCoins=s.originalBank;delete s.originalBank;await s.returnToGameStart();});
      assert.equal(db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,104);
      assert.equal(await page.evaluate(()=>window.__schoolZombieDefense.scene.getScene('GameScene').mode),'menu');
      assert.equal(errors.length,0,errors.join('\n'));
      fs.writeFileSync(path.join(output,'retry-screens.json'),JSON.stringify({retryScreens,finalCoins:104,errors},null,2));
      console.log('Reward retry stays ended, preserves net coins, fits all four viewports and credits once on retry.');return;
    }
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
    const account = await page.evaluate(() => window.__schoolZombieDefense.scene.getScene('GameScene').profileAuth.profile_id);
    const beforeRequests = profileRequests;
    await page.evaluate(async () => { const s=window.__schoolZombieDefense.scene.getScene('GameScene'); await Promise.all([s.ensureServerProfile({force:true}),s.ensureServerProfile({force:true})]); });
    assert.equal(profileRequests-beforeRequests,1);
    await page.evaluate(() => { const s=window.__schoolZombieDefense.scene.getScene('GameScene'); s.applyServerProfile({success:true,profile_id:s.profileAuth.profile_id,profile_revision:s.profileRevision-1,profile:{coins:1,upgrades:{}}}); });
    assert.equal(await page.evaluate(() => window.__schoolZombieDefense.scene.getScene('GameScene').meta.coins),112);
    for (const status of [401,404]) {
      authFailure=status;
      const failed = await page.evaluate(async () => { const s=window.__schoolZombieDefense.scene.getScene('GameScene');try { await s.ensureServerProfile({force:true,allowOffline:false,quiet:true}); return false; } catch { return true; } });
      assert.equal(failed,true);
      assert.equal(await page.evaluate(() => window.__schoolZombieDefense.scene.getScene('GameScene').profileAuth.profile_id),account);
    }
    authFailure=0;
    await page.evaluate(() => { localStorage.removeItem('schoolZombieDefenseProfileV1'); });
    await page.goto(origin+'/school-zombie-defense/');
    await page.waitForFunction(() => window.__schoolZombieDefense.scene.getScene('GameScene')?.profileReady);
    assert.equal(await page.evaluate(() => window.__schoolZombieDefense.scene.getScene('GameScene').profileAuth.profile_id),account);
    assert.equal(await page.evaluate(() => window.__schoolZombieDefense.scene.getScene('GameScene').meta.coins),112);
    assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM school_zombie_profiles').get().n,1);

    await context.addInitScript(() => {
      if (new URL(location.href).searchParams.has('quota')) Storage.prototype.setItem = function () { throw new DOMException('quota','QuotaExceededError'); };
    });
    await page.evaluate(() => { localStorage.removeItem('schoolZombieDefenseProfileV1'); });
    await page.goto(origin+'/school-zombie-defense/?autostart&quota');
    await page.waitForFunction(() => window.__schoolZombieDefense.scene.getScene('GameScene')?.rankSessionId);
    await prepareReroll();
    await page.waitForFunction(async () => {
      const sid=window.__schoolZombieDefense.scene.getScene('GameScene').rankSessionId;
      return (await navigator.locks.query()).held.some(lock=>lock.name==='archer-reward-'+sid);
    });
    const popupPromise=page.waitForEvent('popup');
    await page.evaluate(() => window.open(location.pathname+'?quota','_blank'));
    const popup=await popupPromise;
    await popup.waitForFunction(() => window.__schoolZombieDefense?.scene.getScene('GameScene')?.mode==='menu');
    assert.equal(db.sql.prepare('SELECT coins FROM school_zombie_profiles').get().coins,112,'a copied tab must not bank an active battle');
    await popup.close();
    offline=true;
    // Refresh during an unfinished run: pagehide must retain the final ledger,
    // even with full localStorage and no final-menu/ranking submission.
    await page.goto(origin+'/school-zombie-defense/?quota');
    await page.waitForFunction(() => window.__schoolZombieDefense.scene.getScene('GameScene')?.mode==='menu');
    await page.waitForFunction(() => window.ArcherRanking.pending().some(e=>e.path.endsWith('/bank-run')));
    const interrupted = await page.evaluate(() => window.ArcherRanking.pending().find(e=>e.path.endsWith('/bank-run')).body.event);
    assert.equal(interrupted.run_coins,4); assert.deepEqual(interrupted.reroll_levels,[2]);
    offline=false; await page.evaluate(() => window.ArcherRanking.flush());
    await page.waitForFunction(() => window.__schoolZombieDefense.scene.getScene('GameScene').meta.coins===116);
    assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM school_zombie_coin_claims').get().n,4);
    const crossbow = await page.evaluate(async () => {
      const s=window.__schoolZombieDefense.scene.getScene('GameScene');
      const directions=['10','1030','11','1130','12','1230','13','1330','14'];
      const before=document.createElement('canvas'),after=document.createElement('canvas');
      before.width=after.width=1800;before.height=after.height=1000;
      const oldCtx=before.getContext('2d'),newCtx=after.getContext('2d');
      for(const ctx of [oldCtx,newCtx]) {ctx.fillStyle='#223039';ctx.fillRect(0,0,1800,1000);}
      const medians=[],alphaChanges=[];
      for(let row=0;row<4;row++) {
        const img=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=`assets/images/character-a${row?'-attack-'+row:''}.png`;});
        for(let column=0;column<9;column++) {
          const key=row?`character-a-attack-aim-${directions[column]}-${row}`:`character-a-aim-${directions[column]}`;
          const rendered=s.textures.get(key).getSourceImage();
          const original=document.createElement('canvas');original.width=rendered.width;original.height=rendered.height;
          const ctx=original.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(img,column*736,0,736,960,0,0,original.width,original.height);
          const raw=ctx.getImageData(0,0,original.width,original.height).data;
          const graded=rendered.getContext('2d').getImageData(0,0,rendered.width,rendered.height).data;
          let changed=0;for(let i=3;i<raw.length;i+=4) if(raw[i]!==graded[i])changed++;
          alphaChanges.push(changed);
          const skin=[];
          for(let y=Math.ceil(original.height*.735);y<original.height*.83;y++) for(let x=0;x<original.width;x++) {
            const i=(y*original.width+x)*4;
            if(raw[i+3]>200&&raw[i]>160&&raw[i+1]>raw[i]*.6&&raw[i+1]<raw[i]*.97&&raw[i+2]<raw[i+1]*.95)skin.push([graded[i],graded[i+1],graded[i+2]]);
          }
          medians.push({row,direction:directions[column],rgb:[0,1,2].map(channel=>skin.map(p=>p[channel]).sort((a,b)=>a-b)[Math.floor(skin.length/2)])});
          oldCtx.drawImage(original,column*200,row*250,200,250);newCtx.drawImage(rendered,column*200,row*250,200,250);
          for(const c of [oldCtx,newCtx]){c.fillStyle='#eef2f3';c.font='12px sans-serif';c.fillText(`${directions[column]} / ${row?'attack '+row:'ready'}`,column*200+8,row*250+18);}
        }
      }
      return {medians,alphaChanges,before:before.toDataURL('image/png'),after:after.toDataURL('image/png')};
    });
    for(const which of ['before','after']) { fs.writeFileSync(path.join(output,`crossbow-${which}.png`),Buffer.from(crossbow[which].split(',')[1],'base64'));delete crossbow[which]; }
    assert.ok(crossbow.alphaChanges.every(n=>n===0),'crossbow silhouette/pose alpha must be preserved in all 36 cells');
    for(const channel of [0,1,2]) assert.ok(Math.max(...crossbow.medians.map(v=>v.rgb[channel]))-Math.min(...crossbow.medians.map(v=>v.rgb[channel]))<=10,'direction/action skin hue drift');
    const toastScreens=[];
    for(const [width,height] of [[320,568],[390,844],[768,1024],[1440,900]]) {
      await page.setViewportSize({width,height});
      await page.waitForTimeout(150);
      const bounds=await page.evaluate(() => {
        const s=window.__schoolZombieDefense.scene.getScene('GameScene');s.reducedMotion=true;s.clearTransientObjects();
        const copy='Your account could not be saved. Please check your browser storage.';
        s.showToast(copy);
        const text=Array.from(s.transientObjects).find(object=>object.text===copy);
        const b=text.getBounds();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.ok(bounds.left>=0&&bounds.right<=540&&bounds.top>=0&&bounds.bottom<=960);assert.equal(bounds.overflow,false);
      toastScreens.push({width,height,...bounds});
      await page.screenshot({path:path.join(output,`storage-toast-${width}.png`)});
    }
    assert.equal(errors.length,0,errors.join('\n'));
    const result={online,pending,journal,screens,completed,accountRecovered:true,coalescedProfileRequests:true,staleReceiptIgnored:true,activeOtherTabSafe:true,interrupted,finalCoins:116,crossbow,toastScreens,errors};
    fs.writeFileSync(path.join(output,'browser-coins.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  } finally { await browser.close(); await new Promise(resolve=>staticServer.close(resolve)); }
})().catch(error=>{console.error(error);staticServer.close();process.exitCode=1;});
