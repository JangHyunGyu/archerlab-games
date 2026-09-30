// Local-only responsive fixture for the largest board. Never exposed by the Worker.
import http from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import catalog from '../lib/challenge-levels.json' with { type: 'json' };
import { copy as c } from '../app/copy.ts';
const board=catalog[99].variants[0].board.map((tube,i)=>`<button class="bottle-button" aria-label="${i+1}${c.bottle}"><span class="tube"><canvas class="glass-canvas" data-colors="${tube.join(',')}"></canvas></span><span class="completion-star"></span></button>`).join('');
const renderer=`<script type="module">
import {drawVessel,liquidLayers} from '/glass-renderer.js';
for(const canvas of document.querySelectorAll('.glass-canvas')){
 const tube=canvas.parentElement,ctx=canvas.getContext('2d');
 const draw=()=>{const w=tube.clientWidth,h=tube.clientHeight,d=Math.min(devicePixelRatio||1,2);canvas.width=(w+20)*d;canvas.height=(h+24)*d;ctx.setTransform(d,0,0,d,0,0);drawVessel(ctx,{x:10,y:10,width:w,height:h},liquidLayers(canvas.dataset.colors?canvas.dataset.colors.split(',').map(Number):[]));};
 new ResizeObserver(draw).observe(tube);draw();
}
</script>`;
const html=`<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/style.css"><body><div class="lab-app in-game"><div class="lab-scenery"></div><div class="lab-haze"></div><main class="lab-main"><section class="play-screen"><div class="game-hud"><div class="hud-stat stage-stat"><span>${c.stage}</span><strong>100</strong></div><button class="hud-home" aria-label="${c.home}" title="${c.home}"><span aria-hidden="true">🏠</span></button><div class="hud-stat score-stat"><span>${c.score}</span><strong>128,000</strong></div></div><div class="timer-strip"><div class="timer-track"><div class="timer-fill"></div></div><span class="timer-number">60<small>s</small></span></div><div class="experiment-tray"><div class="board many-tubes">${board}</div></div></section></main></div>${renderer}</body></html>`;
http.createServer((req,res)=>{
  if(req.url==='/study'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(readFileSync(new URL('./glass-study.html',import.meta.url)));}
  if(req.url==='/glass-renderer.js'||req.url==='/pour-motion.ts'){const file=req.url==='/glass-renderer.js'?'glass-renderer.ts':'pour-motion.ts';const source=readFileSync(new URL('../lib/'+file,import.meta.url),'utf8');res.setHeader('Content-Type','text/javascript');return res.end(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);}
  if((req.url==='/lab-background.webp'||req.url==='/water-sort/lab-background.webp')){res.setHeader('Content-Type','image/webp');return res.end(readFileSync(new URL('../public/lab-background.webp',import.meta.url)));}
  if(req.url==='/style.css'){const cssFile=readdirSync(new URL('../dist/assets/',import.meta.url)).find(f=>f.endsWith('.css'));res.setHeader('Content-Type','text/css');return res.end(readFileSync(new URL('../dist/assets/'+cssFile,import.meta.url)));}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);
}).listen(3004,'127.0.0.1',()=>console.log('Responsive fixture: http://127.0.0.1:3004/'));
