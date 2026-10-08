const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../shared/game-runtime.js'),'utf8');
function fixture(blocked=false) {
  const context={location:{pathname:'/test/'},document:{currentScript:null},navigator:{},fetch:async()=>{},Promise,Date};
  Object.defineProperty(context,'localStorage',{get(){if(blocked)throw new DOMException('Storage blocked','SecurityError');return {getItem:()=>null};}});
  vm.runInNewContext(source,{window:context}); return context.ArcherGames;
}
test('storage denial during initialization preserves the runtime and fallback preferences',()=>{
  const runtime=fixture(true);
  assert.equal(runtime.storage.getJSON('save',null),null);
  assert.equal(runtime.storage.setString('save','value'),false);
  assert.equal(runtime.audio.isEnabled(),true);
});
function ranking() {
  const pending=[];
  const client=fixture().createRankingClient({fetch:(url,options)=>new Promise(resolve=>pending.push({url,body:JSON.parse(options.body),resolve}))});
  const respond=(i,body,status=200)=>pending[i].resolve({ok:status===200,status,json:async()=>body});
  return {client,pending,respond};
}
for (const status of [200,503]) test(`shared ranking: late start response ${status} cannot replace or disable the current run`,async()=>{
  const f=ranking();const old=f.client.start();const fresh=f.client.start();
  f.respond(1,{session_id:'new'});await fresh;
  f.respond(0,{session_id:'old'},status);await old;
  assert.equal(f.client.sessionId,'new');assert.equal(f.client.disabled,false);
});
test('shared ranking: a previous upload cannot consume events from a restarted game',async()=>{
  const f=ranking();const start=f.client.start();f.respond(0,{session_id:'old'});await start;
  f.client.record({delta:10});const old=f.client.flush();
  const fresh=f.client.start();f.respond(2,{session_id:'new'});await fresh;
  f.client.record({delta:20});
  f.respond(1,{ok:true});await old;
  assert.equal(f.client.queue.length,1);assert.equal(f.client.queue[0].delta,20);
  const upload=f.client.flush();assert.equal(f.pending[3].body.session_id,'new');f.respond(3,{ok:true});await upload;
  assert.equal(f.client.queue.length,0);
});

test('shared ranking: completing an old upload does not unlock a new in-flight upload',async()=>{
  const f=ranking();let start=f.client.start();f.respond(0,{session_id:'old'});await start;
  f.client.record({delta:10});const old=f.client.flush();
  start=f.client.start();f.respond(2,{session_id:'new'});await start;
  f.client.record({delta:20});const fresh=f.client.flush();
  f.respond(1,{ok:true});await old;
  assert.equal(f.client.syncing,true);
  const duplicate=f.client.flush();assert.equal(f.pending.length,4);
  f.respond(3,{ok:true});await Promise.all([fresh,duplicate]);
  assert.equal(f.client.syncing,false);assert.equal(f.client.queue.length,0);
});

test('shared ranking: submitting an old run cannot attach its score to a new session',async()=>{
  const f=ranking();let start=f.client.start();f.respond(0,{session_id:'old'});await start;
  f.client.record({delta:10});const submission=f.client.submit('Player',10);
  const rejected=assert.rejects(submission,/score sync failed|session changed/);
  start=f.client.start();f.respond(2,{session_id:'new'});await start;
  f.respond(1,{ok:true});await rejected;
  assert.equal(f.pending.some(request=>request.url.endsWith('/rankings')),false);
});
