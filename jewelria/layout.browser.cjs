const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('@playwright/test');
const { server: api, d1, storage } = require('../tests/helpers/ranking-delivery.cjs');
const root = path.resolve(__dirname, '..');
const out = process.env.JEWELRIA_LAYOUT_OUTPUT;
const baselineCss = process.env.JEWELRIA_BASELINE_CSS;
const mime = { '.html':'text/html; charset=utf-8', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.webp':'image/webp', '.png':'image/png', '.mp3':'audio/mpeg', '.woff2':'font/woff2' };
const server = http.createServer((req,res) => {
  const url = new URL(req.url,'http://test');
  let file = path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  if (file.endsWith(path.sep+'jewelria')) file=path.join(file,'index.html');
  if (baselineCss && url.pathname==='/jewelria/assets/css/premium.css') file=path.resolve(baselineCss);
  fs.readFile(file,(error,body)=>{ res.writeHead(error?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(error?'':body); });
});

(async()=>{
  if (out) fs.mkdirSync(out,{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  let browser;
  const results=[];
  try {
    try { browser=await chromium.launch(); } catch { browser=await chromium.launch({channel:'chrome'}); }
    for (const [width,height] of [[320,568],[390,844],[430,932],[568,320],[844,390],[768,1024],[1024,768],[1440,900]]) {
      const db=d1(),boxes=new Map();await api.initDB(db);
      const env={DB:db,RANKING_DELIVERY:{getByName(id){if(!boxes.has(id))boxes.set(id,new api.RankingDelivery({storage:storage()},{DB:db}));return boxes.get(id);}}};
      const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,reducedMotion:'reduce',serviceWorkers:'block'});
      await context.route(/google-analytics|googletagmanager|cloudflareinsights/,route=>route.fulfill({status:204}));
      await context.route('https://game-api.yama5993.workers.dev/**',async route=>{
        const q=route.request();const response=await api.deliveryWorker.fetch(new Request(q.url(),{method:q.method(),headers:q.headers(),body:q.postData()||undefined}),env);
        await route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),'access-control-allow-origin':'*'},body:await response.text()});
      });
      const page=await context.newPage();const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(base+'/jewelria/',{waitUntil:'load'});
      await page.waitForTimeout(600);
      const shot=async state=>{if(out)await page.screenshot({path:path.join(out,`${width}x${height}-${state}.png`)});};
      await shot('title');
      await page.locator('#play-btn').click();
      await page.waitForFunction(()=>document.querySelector('#game-screen').classList.contains('is-active'));
      await page.waitForTimeout(500);
      const measure=()=>page.evaluate(()=>{
        const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
        const link=rect('.archerlab-link'),hud=rect('.game-hud'),board=rect('.board-frame');
        const overlap=r=>link.x<r.right && link.right>r.x && link.y<r.bottom && link.bottom>r.y;
        return {link,hud,board,overlap:overlap(hud)||overlap(board),fullscreen:!!document.fullscreenElement,scroll:document.documentElement.scrollWidth>innerWidth+1};
      });
      const states={playing:await measure()};await shot('playing');
      await page.locator('#pause-btn').click();await shot('pause');
      await page.locator('#resume-btn').click();
      const cdp=await context.newCDPSession(page);
      const resize=async nextHeight=>cdp.send('Emulation.setDeviceMetricsOverride',{width,height:nextHeight,deviceScaleFactor:1,mobile:false});
      await resize(Math.max(280,height-72));await page.waitForTimeout(150);
      states.dynamicViewport=await measure();await shot('dynamic');
      await resize(height);await page.waitForTimeout(150);
      // Simulate the CSS env() values used by a notched mobile viewport.
      for (const sheet of await page.locator('link[rel="stylesheet"]').all()) {
        const href=await sheet.getAttribute('href');if(!href||!href.includes('assets/css/'))continue;
        const css=await (await page.request.get(new URL(href,page.url()).href)).text();
        const styles=css.replace(/url\((['"]?)([^'"\)]+)\1\)/g,(_match,_quote,asset)=>`url("${new URL(asset,new URL(href,page.url())).href}")`)
          .replace(/env\(safe-area-inset-top(?:,\s*0px)?\)/g,'24px').replace(/env\(safe-area-inset-(?:left|right|bottom)(?:,\s*0px)?\)/g,'12px');
        await page.addStyleTag({content:styles});
      }
      await page.waitForTimeout(150);states.safeArea=await measure();await shot('safe-area');
      const result={width,height,states,errors};results.push(result);console.log(JSON.stringify(result));
      if(!baselineCss)for(const [name,state] of Object.entries(states)){
        assert.equal(state.overlap,false,`${width}x${height} ${name}: link covers HUD or board`);
        assert.equal(state.scroll,false);
        assert.ok(state.link.x>=0&&state.link.right<=width+1&&state.link.y>=0);
        assert.ok(state.link.width>=44&&state.link.height>=44);
      }
      assert.equal(errors.length,0,errors.join('\n'));
      await context.close();db.sql.close();
    }
  } finally { if(out)fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));await browser?.close();server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
