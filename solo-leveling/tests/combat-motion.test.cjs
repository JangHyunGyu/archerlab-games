const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the production animation entry point without starting a WebGL game.
const source = fs.readFileSync(path.join(__dirname, '../js/entities/Player.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace('export class Player', 'class Player');
const context = vm.createContext({
    Phaser: { Physics: { Arcade: { Sprite: class {} } }, Math: { Clamp: (n,a,b)=>Math.min(b,Math.max(a,n)) } },
});
vm.runInContext(`${source}\nglobalThis.Player = Player;`, context);
const { Player } = context;

for (const duration of [190,230,260,280,300]) {
    for (const [angle,direction] of [[0,'right'],[Math.PI/2,'down'],[Math.PI,'left'],[-Math.PI/2,'up']]) {
        const player = Object.create(Player.prototype);
        Object.assign(player, { active:true, isDead:false, texturePrefix:'test', character:{}, _attackPose:{},
            scene:{anims:{exists:()=>true}}, play(config,ignore) { this.played=config; this.ignored=ignore; },
            setFlipX(value) { this.flipX=value; },
        });
        player.playAttackMotion(angle,duration,-1);
        assert.equal(player.played.key,`test_attack_${direction}`);
        assert.equal(player.played.duration,duration);
        // Phaser otherwise inherits 20 fps and silently ignores duration.
        assert.equal(player.played.frameRate,null);
        assert.equal(player.flipX,false,'directional frames must not be mirrored twice');
        assert.equal(player.ignored,false,'an explicit new attack restarts its pose sequence');
        player._sampleAttackPose(duration-1);
        assert.equal(player._attackPose.active,true);
        player._sampleAttackPose(1);
        assert.equal(player._attackPose.active,false,'recovery must finish with the requested cast');
    }
}
const noGhost = Object.create(Player.prototype);
noGhost._reducedMotion = true;
noGhost._emitMovementAfterimage(1000,1,1); // No scene allocation under reduced motion.
noGhost._attackPose = {active:true,elapsed:0,duration:260,angle:0,direction:'right',side:1};
const reducedPose = noGhost._sampleAttackPose(120);
for (const component of Object.values(reducedPose)) assert.equal(Math.abs(component),0);
assert.equal(noGhost._attackPose.active,true,'reduced motion preserves the gameplay action');
noGhost._sampleAttackPose(140);
assert.equal(noGhost._attackPose.active,false,'reduced motion keeps normal recovery timing');
console.log('combat motion: 5 durations × 4 directions, recovery and reduced-motion allocation passed');

const basicSource = fs.readFileSync(path.join(__dirname, '../js/weapons/BasicDagger.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export class BasicDagger', 'class BasicDagger');
context.WeaponBase = class {};
context.Phaser.Math.Easing = {Cubic:{Out:t=>1-(1-t)**3}};
context.Phaser.BlendModes = {ADD:1};
vm.runInContext(`${basicSource}\nglobalThis.BasicDagger = BasicDagger;`,context);
for (const [method,offset,duration] of [['_swordSlash',18,250],['_clawSwipe',14,235]]) {
    const effect = {setPosition(x,y){this.x=x;this.y=y;return this;},setAlpha(a){this.alpha=a;return this;}};
    for (const name of ['setDepth','setScale','setRotation','setFlipY','setBlendMode']) effect[name]=()=>effect;
    let tween;
    const weapon = Object.create(context.BasicDagger.prototype);
    Object.assign(weapon,{
        player:{x:100,y:200}, config:{}, attackRange:225, extraRange:0,
        scene:{tweens:{add:config=>(tween=config)}},
        _getAttackSetup:()=>({baseAngle:0,side:1}),_getConfiguredEffectTexture:()=> 'test',
        getEffectCenteredFit:()=>({scale:1}),createEffectSprite:()=>effect,
        getMirroredEffectRotation:()=>0,getEffectRotation:()=>0,
        getEffectColor:()=>0,getEffectGlowColor:()=>0,_trackAttackObjects:()=>({}),
        _delay(){},playConfiguredSound(){},
    });
    weapon[method]();
    weapon.player.x=240; weapon.player.y=270;
    tween.targets.t=118/duration;
    tween.onUpdate();
    assert.equal(effect.x,240,`${method} follows horizontal movement`);
    assert.equal(effect.y,270-offset,`${method} follows vertical movement`);
    assert.ok(effect.alpha>.75,`${method} remains visible at impact`);
}
console.log('moving sword/claw origins and contact brightness passed');

// Alternate body tracks must survive update(), keep their authored direction,
// and give way to a skill's default animation without leaking combo state.
for (const motion of ['cut','reverse','rise','backhand','lift','blessing']) {
    for (const [angle,direction] of [[0,'right'],[Math.PI/2,'down'],[Math.PI,'left'],[-Math.PI/2,'up']]) {
        const player = Object.create(Player.prototype);
        Object.assign(player,{active:true,texturePrefix:'test',character:{},_attackPose:{},
            scene:{anims:{exists:()=>true}},play(config){this.played=config;},setFlipX(v){this.flipX=v;}});
        player.playAttackMotion(angle,300,-1,motion);
        assert.equal(player.played.key,`test_attack_${motion}_${direction}`);
        assert.equal(player._getActiveAnimationKey(),player.played.key,'update retains the chosen track');
        assert.equal(player.flipX,false);
        player.playAttackMotion(angle,190,1);
        assert.equal(player._getActiveAnimationKey(),`test_attack_${direction}`,'skill clears variant');
        player.scene.anims.exists=k=>!k.includes(`_${motion}_`);
        player.playAttackMotion(angle,300,1,motion);
        assert.equal(player.played.key,`test_attack_${direction}`,'missing variant falls back safely');
    }
}

(async()=>{
    const {pathToFileURL}=require('node:url');
    const {WEAPONS}=await import(pathToFileURL(path.join(__dirname,'../js/utils/Constants.js')));
    const {getGameplayAssetList}=await import(pathToFileURL(path.join(__dirname,'../js/utils/AssetManifest.js')));
    const {CHARACTER_DEFS,getCharacterWeaponKeys}=await import(pathToFileURL(path.join(__dirname,'../js/utils/Characters.js')));
    for(const [id,char] of Object.entries(CHARACTER_DEFS)) {
        const key=getCharacterWeaponKeys(id)[0], config=WEAPONS[key];
        const weapon=Object.create(context.BasicDagger.prototype);
        const scheduled=[],emitted=[];
        Object.assign(weapon,{config,player:{active:true},_basicAttackIndex:0,count:3,
            _delay(ms,fn){scheduled.push({ms,fn});},_attackByStyle(style,variant){emitted.push({style,variant});}});
        for(let burst=0;burst<4;burst++) {
            weapon.fire();
            assert.deepEqual(scheduled.map(x=>x.ms),[0,key==='flameSpark'?145:110,key==='flameSpark'?290:220]);
            scheduled.splice(0).forEach(x=>x.fn());
        }
        assert.equal(emitted.length,12,'extra attacks preserved');
        emitted.forEach((x,i)=>{
            assert.equal(x.variant,config.basicAttackPattern[i%config.basicAttackPattern.length],`${id} cycle order`);
            assert.equal(x.style,x.variant.style||config.attackStyle);
        });
        weapon.fire(); weapon.player.isDead=true;
        scheduled.splice(0).forEach(x=>x.fn());
        assert.equal(weapon._basicAttackIndex,12,'dead players neither emit nor advance');
        const assets=getGameplayAssetList(id);
        for(const variant of char.basicAttackVariants) {
            assert.ok(config.basicAttackPattern.some(x=>x.motion===variant),`${id}: unused track`);
            for(const direction of ['right','left','down','up']) for(let i=0;i<6;i++) {
                const asset=assets.find(x=>x.key===`${char.texturePrefix}_attack_${variant}_${direction}_${i}`);
                assert.ok(asset,`${id}/${variant}/${direction}/${i} registered`);
                assert.ok(fs.existsSync(path.join(__dirname,'..',asset.path)),`${asset.path} exists`);
                assert.ok(fs.existsSync(path.join(__dirname,'..',asset.path.replace('.png','.webp'))));
            }
        }
    }
    // Both dagger presentations retain the same contact time and damage cone.
    const samples=[];
    for(const method of ['_daggerSlash','_dualDaggerCrossThrust']) {
        const w=Object.create(context.BasicDagger.prototype), delays=[];
        const sprite={};
        for(const name of ['setDepth','setAlpha','setScale','setFlipY','setRotation','setBlendMode','setPosition']) sprite[name]=()=>sprite;
        Object.assign(w,{config:WEAPONS.basicDagger,player:{x:100,y:200,active:true},attackRange:205,extraRange:12,
            scene:{scene:{isActive:()=>true},textures:{exists:()=>true},add:{sprite:()=>sprite},tweens:{add:()=>({})}},
            _getAttackSetup:()=>({baseAngle:.7,side:-1}),_getConfiguredEffectTexture:()=> 'basic_attack_shadow_dagger_slash',
            getEffectForwardFit:()=>({scale:1,centerForward:100}),createEffectSprite:()=>sprite,
            _trackAttackObjects:()=>({}),_delay(ms,fn){delays.push({ms,fn});},
            _damageEnemiesInCone(...args){samples.push(args);},playConfiguredSound(){}});
        w[method]({motion:'cut',side:-1});
        assert.deepEqual(delays.map(x=>x.ms),[132]);
        delays[0].fn();
    }
    assert.deepEqual(samples[0],samples[1],'slash preserves stab range, angle and knockback');

    // 4-directional idle frames and facing preservation (no mirror flip on idle/hit)
    const { CHARACTER_FRAME_NAMES } = await import(pathToFileURL(path.join(__dirname, '../js/utils/Characters.js')));
    const shadowAssets = getGameplayAssetList('shadowMonarch');
    for (const dir of ['down', 'right', 'up', 'left']) {
        for (let i = 0; i < 4; i++) {
            assert.ok(CHARACTER_FRAME_NAMES.includes(`idle_${dir}_${i}`), `CHARACTER_FRAME_NAMES includes idle_${dir}_${i}`);
            assert.ok(shadowAssets.some(a => a.key === `motion_player_idle_${dir}_${i}`), `gameplay assets include motion_player_idle_${dir}_${i}`);
        }
    }
    for (const dir of ['down', 'right', 'up', 'left']) {
        const p = Object.create(Player.prototype);
        Object.assign(p, {
            active: true, isDead: false, texturePrefix: 'test', facingDirection: dir,
            facingRight: dir !== 'left', moveIntensity: 0, character: {}, _attackPose: {},
            _hitFlashTimer: 0, _isMoving: false, flipX: true,
            scene: { anims: { exists: () => true } },
            anims: { currentAnim: null },
            play(config) { this.played = config; },
            setFlipX(value) { this.flipX = value; },
        });
        assert.equal(p._getActiveAnimationKey(), `test_idle_${dir}`, `idle key keeps facing ${dir}`);
        p._applyFlipForAnimation(`test_idle_${dir}`);
        assert.equal(p.flipX, false, `idle_${dir} never sets flipX`);
        p._applyFlipForAnimation('test_hit');
        assert.equal(p.flipX, false, 'hit never sets flipX');
    }

    // RulersAuthority targetMode === 'self' respects facingDirection/lastMoveAngle and avoids 0-degree snap
    const rulerSrc = fs.readFileSync(path.join(__dirname, '../js/weapons/RulersAuthority.js'), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace('export class RulersAuthority', 'class RulersAuthority');
    context.Phaser.Math.Angle = {
        Between: (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1),
        Wrap: (a) => Math.atan2(Math.sin(a), Math.cos(a)),
    };
    vm.runInContext(`${rulerSrc}\nglobalThis.RulersAuthority = RulersAuthority;`, context);
    const noopSprite = { scaleX: 1, scaleY: 1 };
    for (const m of ['setDepth', 'setAlpha', 'setScale', 'setBlendMode', 'setRotation', 'setTint']) noopSprite[m] = () => noopSprite;
    const rulerCalls = [];
    const ruler = Object.create(context.RulersAuthority.prototype);
    Object.assign(ruler, {
        config: { targetMode: 'self', blastRange: 180, motionDuration: 260, imageOnlyVfx: true },
        extraRange: 0,
        player: {
            x: 120, y: 240, facingDirection: 'up', facingRight: true, moveIntensity: 0,
            character: { basicAttackVariants: ['lift'] },
            getAllEnemies: () => [],
            playAttackMotion: (angle, duration, side, variant) => rulerCalls.push({ angle, duration, side, variant }),
        },
        scene: {
            scene: { isActive: () => true },
            textures: { exists: () => true },
            tweens: { add: () => ({}) },
        },
        getEffectTexture: () => 'test_vfx',
        getEffectScaleForVisibleSize: () => ({ x: 1, y: 1 }),
        createEffectSprite: () => noopSprite,
        getEffectColor: () => 0,
        playConfiguredSound() {},
        healPlayerFromConfig() {},
        _delay() {},
    });
    ruler._blast(0);
    assert.equal(rulerCalls.length, 1);
    assert.ok(Math.abs(rulerCalls[0].angle - (-Math.PI / 2)) < 1e-6, 'self targetMode uses facingDirection up (-pi/2) instead of 0');
    assert.equal(rulerCalls[0].variant, 'lift');

    // ShadowSlash multi-wave fan triggers playAttackMotion once per cast (sequence === 0)
    const slashSrc = fs.readFileSync(path.join(__dirname, '../js/weapons/ShadowSlash.js'), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace('export class ShadowSlash', 'class ShadowSlash');
    vm.runInContext(`${slashSrc}\nglobalThis.ShadowSlash = ShadowSlash;`, context);
    const slashDelays = [];
    const slashMotions = [];
    const slashW = Object.create(context.ShadowSlash.prototype);
    Object.assign(slashW, {
        config: { arcOffsets: [-0.35, 0, 0.35], slashRange: 260, imageOnlyVfx: true },
        extraRange: 0,
        count: 2,
        player: {
            x: 100, y: 200, facingDirection: 'left', facingRight: false, moveIntensity: 0,
            getClosestEnemy: () => null,
            getAllEnemies: () => [],
            playAttackMotion: (angle, duration) => slashMotions.push({ angle, duration }),
        },
        scene: { textures: { exists: () => false }, tweens: { add: () => ({}) } },
        _delay(ms, fn) { slashDelays.push({ ms, fn }); },
        getEffectDarkColor: () => 0,
        getEffectColor: () => 0,
        getEffectGlowColor: () => 0,
        getEffectTexture: () => 'test_vfx',
        getEffectRotation: (a) => a,
        getEffectForwardFit: () => ({ scale: 1, centerForward: 90 }),
        getDamage: () => 50,
        createEffectSprite: () => noopSprite,
        playConfiguredSound() {},
    });
    slashW.fire();
    assert.equal(slashDelays.length, 6, '2 repeats x 3 offsets scheduled');
    slashDelays.forEach((d) => d.fn());
    assert.equal(slashMotions.length, 1, 'fan slash triggers playAttackMotion only on first wave');

    console.log('basic cycles: all five characters, 12 emitted attacks each, asset coverage, variant persistence, skill reset, dagger hit parity, 4-dir idle, self-target angle and single-trigger fan slash passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
