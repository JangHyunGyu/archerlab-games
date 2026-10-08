import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { sharedAssets } from '../scripts/shared-assets.mjs';

test('Vite serves shared page scripts and dynamically injected runtime from the repository root', async () => {
  let middleware;
  sharedAssets().configureServer({config:{root:fileURLToPath(new URL('../',import.meta.url))},middlewares:{use(fn){middleware=fn;}}});
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const refs=[...html.matchAll(/src="((?:\/shared\/|\/assets\/|\.\.\/assets\/)[^"]+)"/g)].map(match=>match[1].replace(/^\.\./,''));
  refs.push('/shared/game-runtime.js?v=dynamic','/favicon.svg');
  for (const ref of refs) for (const prefix of ['', '/water-sort']) {
    const response=await new Promise((resolve,reject)=>{
      const headers={};
      middleware({url:prefix+ref},{setHeader:(key,value)=>{headers[key]=value;},end:body=>resolve({body,headers})},error=>reject(error||new Error(`Missing shared asset ${prefix+ref}`)));
    });
    assert.ok(response.body.equals(readFileSync(new URL(`../../${ref.split('?')[0].slice(1)}`,import.meta.url))));
    assert.match(response.headers['Content-Type'], /javascript|svg/);
  }
  let passed=false;
  middleware({url:'/water-sort/../game-api-worker.js'},{},()=>{passed=true;});
  assert.equal(passed,true,'only public shared assets are exposed');
});
