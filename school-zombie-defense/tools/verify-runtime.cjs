const {chromium}=require('@playwright/test');
const fs=require('node:fs');const path=require('node:path');const out=process.env.ZOMBIE_QA_OUTPUT||path.resolve(__dirname,'../../../output/zombie-review-20261004');fs.mkdirSync(out,{recursive:true});const assert=require('node:assert/strict');
const {server,d1,storage}=require('../../tests/helpers/ranking-delivery.cjs');
(async()=>{
 const db=d1();const boxes=new Map();await server.initDB(db);
 const env={DB:db,RANKING_DELIVERY:{getByName(id){if(!boxes.has(id))boxes.set(id,new server.RankingDelivery({storage:storage()},{DB:db}));return boxes.get(id);}}};
 const browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});const errors=[];
 await context.route('https://game-api.yama5993.workers.dev/**',async route=>{const q=route.request();const r=await server.deliveryWorker.fetch(new Request(q.url(),{method:q.method(),headers:q.headers(),body:q.postData()||undefined}),env);await route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:await r.text()});});
 let page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/school-zombie-defense/?autostart');await page.waitForFunction(()=>window.__schoolZombieDefense?.scene.getScene('GameScene')?.rankSessionId);
 db.sql.exec('UPDATE ranking_sessions SET started_at=started_at-60000');
 const ranking=await page.evaluate(async()=>{const s=window.__schoolZombieDefense.scene.getScene('GameScene');s.scene.pause();s.elapsed=120;s.level=5;s.stage=2;s.highestClearedStage=1;s.kills=60;s.coins=60;s.rewardCounts={1:60,2:0,3:0,4:0};s.recordRankStageClear(1);await s.bankRunCoins();s.lastRankableRun=s.getRankSnapshot();await s.submitRankScore(s.lastRankableRun,'Local regression');return {pending:window.ArcherRanking.pending().length,coinsBanked:s.runCoinsBanked,mode:s.mode};});
 assert.equal(ranking.pending,0);assert.equal(ranking.coinsBanked,true);assert.equal(db.sql.prepare('SELECT score FROM rankings').get().score,1);
 const responsive=[];for(const [width,height] of [[320,568],[390,844],[844,390],[768,1024],[1440,900]]){await page.setViewportSize({width,height});await page.evaluate(()=>{const s=window.__schoolZombieDefense.scene.getScene('GameScene');s.showRankNameLayer({score:1,kills:60});});await page.waitForTimeout(120);responsive.push(await page.evaluate(()=>{const r=document.querySelector('.school-zombie-rank-dialog').getBoundingClientRect();const b=document.querySelector('.school-zombie-rank-submit').getBoundingClientRect();return {width:innerWidth,height:innerHeight,dialog:{x:r.x,y:r.y,width:r.width,height:r.height},button:{width:b.width,height:b.height},scroll:document.documentElement.scrollWidth>innerWidth};}));await page.evaluate(()=>window.__schoolZombieDefense.scene.getScene('GameScene').removeRankNameLayer());}
 fs.writeFileSync(out+'/responsive.json',JSON.stringify(responsive,null,2));
 for(const r of responsive){assert.equal(r.scroll,false);assert.ok(r.button.height>=44 && r.button.width>=44);assert.ok(r.dialog.x>=-1 && r.dialog.x+r.dialog.width<=r.width+1);}
 await page.setViewportSize({width:700,height:1000});
 const cdp=await context.newCDPSession(page);await cdp.send('HeapProfiler.enable');const cycles=[];
 for(let cycle=0;cycle<6;cycle++){
  await page.evaluate(()=>{const s=window.__schoolZombieDefense.scene.getScene('GameScene');s.resetRun();s.mode='playing';s.scene.resume();s.level=24;s.levelNeed=1e9;s.coreHp=s.maxCoreHp=1e9;s.spawnTimer=1e9;s.recruitedDefenders=new Set(s.defenders.map(d=>d.id));s.recruitOrder=s.defenders.map(d=>d.id);for(const d of s.defenders){d.recruited=true;d.sprite.setVisible(true);d.rate=0.13;d.damageBoost=4;}for(let i=0;i<80;i++)s.spawnZombie(0);});
  await page.waitForTimeout(100);await page.evaluate(()=>{const s=window.__schoolZombieDefense.scene.getScene('GameScene');s.zombies.forEach((z,i)=>{z.x=75+(i%10)*40;z.y=180+Math.floor(i/10)*35;z.hp=z.maxHp=400;});});
  await page.waitForTimeout(3500);
  const active=await page.evaluate(()=>{const s=window.__schoolZombieDefense.scene.getScene('GameScene');return {zombies:s.zombies.length,corpses:s.activeCorpses.length,transients:s.transientObjects.size,children:s.children.list.length};});
  await page.evaluate(()=>{const s=window.__schoolZombieDefense.scene.getScene('GameScene');s.resetRun();s.mode='menu';});await page.waitForTimeout(250);await cdp.send('HeapProfiler.collectGarbage');const heap=await cdp.send('Runtime.getHeapUsage');
  const clean=await page.evaluate(()=>{const s=window.__schoolZombieDefense.scene.getScene('GameScene');return {zombies:s.zombies.length,bullets:s.bullets.length,transients:s.transientObjects.size,corpses:s.activeCorpses.length,runTimers:s.runTimers.size,separationRefs:s.zombieSeparationCandidates?.length||0,children:s.children.list.length,tweens:s.tweens.getTweens().length,pool:s.damageTextPool.length,objects:s.children.list.map(o=>({type:o.type,texture:o.texture?.key,text:o.text,visible:o.visible,active:o.active}))};});
  for(const key of ['zombies','bullets','transients','corpses','runTimers','separationRefs'])assert.equal(clean[key],0,key);
  cycles.push({cycle,active,clean,heap});console.log('cleaned cycle '+cycle);
 }
 fs.writeFileSync(out+'/browser-regression.json',JSON.stringify({ranking,responsive,cycles,errors},null,2));
 assert.equal(errors.length,0,errors.join('\n'));assert.equal(cycles.at(-1).clean.children-cycles.at(-1).clean.pool,cycles[0].clean.children-cycles[0].clean.pool);
 assert.ok(cycles.at(-1).heap.usedSize-cycles[1].heap.usedSize<1500000,'post-warmup heap must stay bounded');
 const result={ranking,responsive,cycles,errors};fs.writeFileSync(out+'/browser-regression.json',JSON.stringify(result,null,2));console.log(JSON.stringify({ranking,responsive,cycles:cycles.map(c=>({cycle:c.cycle,active:c.active,children:c.clean.children,pool:c.clean.pool,heap:c.heap.usedSize})),errors}));await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
