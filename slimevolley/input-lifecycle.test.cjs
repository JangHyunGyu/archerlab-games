const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture() {
  const windowListeners=new Map(),documentListeners=new Map(), sent=[];
  const target=listeners=>({addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}});
  const context={window:target(windowListeners),document:{...target(documentListeners),hidden:false,getElementById:()=>null},navigator:{maxTouchPoints:0},console};
  const source=fs.readFileSync(require('node:path').join(__dirname,'js/main.js'),'utf8');
  vm.runInNewContext(source.slice(0,source.indexOf("window.addEventListener('DOMContentLoaded'"))+'\nglobalThis.Game=SlimeVolleyGame;',context);
  const game=Object.create(context.Game.prototype);
  Object.assign(game,{keys:{},running:true,mode:'multiplayer',network:{isHost:false,sendInput:input=>sent.push({...input}),disconnect(){},clearAllHandlers(){}},sound:{destroy(){}},setupMobileControls(){},backToLobby(){}});
  game.setupInput();
  return {game,context,sent,windowListeners,documentListeners};
}
for (const trigger of ['blur','visibilitychange']) test(`slimevolley: ${trigger} releases held keys and immediately informs the host`,()=>{
  const f=fixture();
  f.windowListeners.get('keydown')({code:'ArrowRight',preventDefault(){}});
  assert.equal(f.game.getMyInput().right,true);
  if(trigger==='blur')f.windowListeners.get('blur')?.();
  else {f.context.document.hidden=true;f.documentListeners.get('visibilitychange')?.();}
  assert.equal(f.game.getMyInput().right,false);
  assert.deepEqual(f.sent.at(-1),{left:false,right:false,jump:false});
  f.game.destroy();
  assert.equal(f.windowListeners.size,0);
  assert.equal(f.documentListeners.size,0);
});

test('slimevolley: focus loss clears touch gestures and prevents stale drag movement',()=>{
  const f=fixture();const elements=new Map();
  for(const id of ['touch-move-zone','touch-jump-zone','joystick-knob'])elements.set(id,{classList:{add(){},remove(){}},style:{},addEventListener(){}});
  f.context.document.getElementById=id=>elements.get(id)||null;
  f.context.document.querySelector=()=>null;
  delete f.game.setupMobileControls;f.game.setupMobileControls();
  const touch=x=>({preventDefault(){},touches:[{clientX:x}]});
  f.game._onMoveStart(touch(0));f.game._onMoveMove(touch(20));f.game._onJumpStart(touch(0));
  assert.equal(f.game.getMyInput().right,true);assert.equal(f.game.getMyInput().jump,true);
  f.windowListeners.get('blur')();
  f.game._onMoveMove(touch(30));
  assert.equal(f.game.getMyInput().right,false);assert.equal(f.game.getMyInput().jump,false);
  assert.equal(elements.get('joystick-knob').style.transform,'');
});

test('slimevolley: leaving during countdown or the result delay cancels the pending start',()=>{
  const lobby=fs.readFileSync(require('node:path').join(__dirname,'js/lobby.js'),'utf8');
  const main=fs.readFileSync(require('node:path').join(__dirname,'js/main.js'),'utf8');
  assert.match(lobby,/currentScreen === 'game-screen'/);
  assert.match(lobby,/this\.game\.backToLobby\(\);\s*this\.showScreen\('main-menu'\)/);
  assert.match(main,/this\.gameOverTimer = setTimeout/);
  assert.match(main,/clearTimeout\(this\.gameOverTimer\)/);
  assert.match(main,/msg\.event === 'gameOver'[\s\S]*?this\.gameOverTimer = setTimeout/);
  assert.equal(main.split('this.gameOverTimer = setTimeout').length - 1, 2);
});
