import { Player } from '../js/entities/Player.js';
import { WeaponManager } from '../js/managers/WeaponManager.js';
import { CHARACTER_DEFS, CHARACTER_FRAME_NAMES, getCharacterWeaponKeys } from '../js/utils/Characters.js';
import { getGameplayAssetList, CHARACTER_MOTION_ASSET_VERSION } from '../js/utils/AssetManifest.js';
const $ = id => document.getElementById(id);
const ids = Object.keys(CHARACTER_DEFS);
for (const id of ids) $('character').add(new Option(id, id));
let scene;
let recording = false;
function choices() {
    $('action').replaceChildren(...getCharacterWeaponKeys($('character').value).map(key => new Option(key, key)));
    $('strips').replaceChildren();
    const character = CHARACTER_DEFS[$('character').value];
    for (const direction of ['right', 'left', 'down', 'up']) {
        const article = document.createElement('article');
        const heading = document.createElement('h2');
        heading.textContent = `${character.id} — ${direction}`;
        const frames = document.createElement('div'); frames.className = 'frames';
        for (let i = 0; i < 6; i++) {
            const img = new Image(); img.alt = `${direction} frame ${i}`;
            img.src = character.usesExistingPlayerMotion
                ? `../assets/player/motion/player_attack_${direction}_${i}.png?v=${CHARACTER_MOTION_ASSET_VERSION}`
                : `../assets/player/characters/${character.assetKey}/motion/attack_${direction}_${i}.png?v=${CHARACTER_MOTION_ASSET_VERSION}`;
            frames.append(img);
        }
        article.append(heading, frames); $('strips').append(article);
    }
}
choices();
class AuditScene extends Phaser.Scene {
    constructor() { super('CombatAudit'); }
    preload() {
        const assets = new Map();
        for (const id of ids) for (const asset of getGameplayAssetList(id)) {
            if (/^(char_skill_|basic_attack_|char_.*_(idle|attack|walk|hit)_|motion_player_)/.test(asset.key)) {
                const key = asset.key.replace(/^motion_/, '');
                assets.set(key, `${asset.path}?v=${asset.cacheVersion || 'audit-20261010'}`);
            }
        }
        for (const [key, path] of assets) this.load.image(key, `../${path}`);
        this.load.on('loaderror', file => { $('status').textContent = `LOAD ERROR: ${file.key}`; });
    }
    create() {
        scene = this;
        this.physics.world.setBounds(-2000,-2000,5000,5000);
        this.soundManager = {play() {}};
        // Player's optional aura is hidden in production as well.
        this.textures.addImage('player_aura', this.textures.get('player_idle_0').getSourceImage());
        this.reset();
        $('fire').disabled = $('record').disabled = false;
        $('status').textContent = 'Ready. Select a character, action and direction.';
    }
    reset() {
        this.manager?.destroy();
        this.player?.destroy();
        this.tweens.killAll();
        this.time.removeAllEvents();
        this.children.removeAll(true);
        const grid = this.add.grid(500,350,1000,700,50,50,0x111722,1,0x30435e,.4);
        grid.setDepth(-10);
        this.player = new Player(this,500,350,$('character').value);
        this.enemies = [];
        const angle = Number($('direction').value)*Math.PI/180;
        for (const distance of [145,260,410]) {
            const x = 500 + Math.cos(angle)*distance, y = 350 + Math.sin(angle)*distance;
            const dummy = this.add.circle(x,y,14,0x738396,.8);
            dummy.takeDamage = () => { dummy.setFillStyle(0xffcf77); this.hits++; return true; };
            dummy.applySlow = () => {};
            this.enemies.push(dummy);
        }
        this.enemyManager = {getActiveEnemies:()=>this.enemies, getGroup:()=>null};
        this.player.facingRight = Math.cos(angle) >= 0;
        this.player.lastMoveAngle = angle;
        this.player.moveDirection = this.player._directionFromAngle(angle);
        this.manager = new WeaponManager(this,this.player);
        this.manager.addWeapon($('action').value);
        this.weapon = this.manager.weapons.get($('action').value);
        this.weapon.cooldownTimer = 1e9;
        this.hits = 0;
        this.started = this.time.now;
        this.frameKeys = new Set();
    }
    fire() { this.reset(); this.weapon.fire(); }
    update(time,delta) {
        if (!this.player) return;
        this.player.update(time,delta);
        this.weapon?.update(time,delta);
        this.frameKeys.add(this.player.texture.key);
        $('status').textContent = `${$('action').value} · ${Math.round(time-this.started)} ms · hits ${this.hits} · ${this.player.texture.key}`;
    }
}
const game = new Phaser.Game({type:Phaser.WEBGL,parent:'stage',width:1000,height:700,backgroundColor:'#111722',render:{preserveDrawingBuffer:true},physics:{default:'arcade',arcade:{debug:false}},audio:{noAudio:true},scene:[AuditScene]});
$('character').addEventListener('change',()=>{choices(); scene?.reset();});
$('action').addEventListener('change',()=>scene?.reset());
$('direction').addEventListener('change',()=>scene?.reset());
$('fire').addEventListener('click',()=>scene?.fire());
$('record').addEventListener('click',async()=>{
    if (!scene || recording) return;
    recording = true;
    // Fixed 60 Hz production steps keep diagnostic captures repeatable even
    // when the browser throttles a background tab. Live play uses normal RAF.
    game.loop.stop();
    let simulationTime = game.loop.now;
    // Phaser's TweenManager uses Date.now rather than Game.step's delta.
    // Supply the same diagnostic clock to tweens and scene timers.
    const tweenDelta = scene.tweens.getDelta;
    scene.tweens.getDelta = () => 1000/60;
    for (const id of ['fire','record','character','action','direction']) $(id).disabled = true;
    $('capture').replaceChildren();
    try {
    for (const key of getCharacterWeaponKeys($('character').value)) {
        $('action').value = key;
        const article = document.createElement('article');
        const heading = document.createElement('h2'); heading.textContent = key;
        const timeline = document.createElement('div'); timeline.className='timeline';
        article.append(heading,timeline); $('capture').append(article);
        scene.fire();
        let elapsed = 0;
        for (const at of [50,100,150,250,400,700,1100,1600]) {
            while (elapsed + .01 < at) {
                elapsed += 1000/60;
                simulationTime += 1000/60;
                game.step(simulationTime, 1000/60);
            }
            const img = new Image(); img.src = game.canvas.toDataURL('image/png'); img.alt=`${key} at ${at} ms`;
            const figure = document.createElement('figure'); figure.style.margin='0';
            const caption = document.createElement('figcaption'); caption.textContent=`${at} ms / ${scene.player.texture.key}`;
            figure.append(img,caption); timeline.append(figure);
        }
        heading.textContent += ` — ${scene.hits} hits; ${scene.frameKeys.size} body frames seen`;
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    } finally {
    for (const id of ['fire','record','character','action','direction']) $(id).disabled = false;
    recording = false;
    scene.tweens.getDelta = tweenDelta;
    scene.tweens.prevTime = Date.now();
    game.loop.start(game.step.bind(game));
    }
});
