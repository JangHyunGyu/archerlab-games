import { WATER_COLORS } from './glass-renderer.ts';
import type { RewardBottle } from './reward-effects.ts';

const TAU = Math.PI * 2;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const random = (n: number) => { const x = Math.sin(n * 127.1 + 78.23) * 43758.5453; return x - Math.floor(x); };
type Reaction = { x: number; y: number; color: string; chain: number; started: number; finale: boolean; seed: number };

function star(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(x - size, y); ctx.quadraticCurveTo(x, y, x, y - size * 1.5);
  ctx.quadraticCurveTo(x, y, x + size, y); ctx.quadraticCurveTo(x, y, x, y + size * 1.5);
  ctx.quadraticCurveTo(x, y, x - size, y); ctx.fill();
}

/** Bounded, time-based celebrations. Only the finale survives the 450ms board handoff. */
export class ReactionSpectacle {
  private events: Reaction[] = [];
  private serial = 0;
  private textures = new Map<string, CanvasImageSource>();
  private glow(ctx: CanvasRenderingContext2D, color: string, radius: number, ring: boolean) {
    const key = `${color}:${ring}`;
    let texture = this.textures.get(key);
    if (!texture) {
      const surface = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256)
        : typeof document !== 'undefined' && typeof document.createElement === 'function' ? document.createElement('canvas') : null;
      if (surface) {
        surface.width = surface.height = 256;
        const paint = surface.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
        if (paint) {
          this.paintGlow(paint, color, 128, ring, 128, 128);
          texture = surface; this.textures.set(key, texture);
        }
      }
    }
    // Small prepainted light textures avoid evaluating large radial gradients every frame.
    if (texture) ctx.drawImage(texture, -radius, -radius, radius * 2, radius * 2);
    else this.paintGlow(ctx, color, radius, ring, 0, 0);
  }
  private paintGlow(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, color: string, radius: number, ring: boolean, x: number, y: number) {
    const gradient = ctx.createRadialGradient(x, y, ring ? radius * .72 : 0, x, y, radius);
    if (ring) {
      gradient.addColorStop(0, color + '00'); gradient.addColorStop(.55, color + '44');
      gradient.addColorStop(.85, '#ffffffcc'); gradient.addColorStop(1, color + '00');
    } else {
      gradient.addColorStop(0, '#ffffffdd'); gradient.addColorStop(.12, '#fff5c4bb');
      gradient.addColorStop(.32, color + '88'); gradient.addColorStop(.65, color + '33'); gradient.addColorStop(1, color + '00');
    }
    ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  get active() { return this.events.length > 0; }
  get count() { return this.events.length; }
  bottle(b: RewardBottle, chain: number, now: number) {
    this.events.push({ x: b.x, y: b.y + b.height * .28, color: WATER_COLORS[b.color] ?? '#8d59d2', chain, started: now, finale: false, seed: ++this.serial });
    this.events = this.events.slice(-4);
  }
  clear(x: number, y: number, now: number) {
    this.events = [{ x, y, color: '#a343ed', chain: 6, started: now, finale: true, seed: ++this.serial }];
  }
  finishStage() { this.events = this.events.filter(event => event.finale); }
  reset() { this.events = []; }
  draw(ctx: CanvasRenderingContext2D, now: number, width: number, height: number) {
    this.events = this.events.filter(event => now - event.started < (event.finale ? 1900 : 1400));
    if (!this.events.length) return;
    const latest = this.events.at(-1)!;
    const age = (now - latest.started) / 1000;
    if (age < 0) return;
    // A single soft exposure change gives saturated light contrast on the pale laboratory.
    const envelope = Math.min(1, age / .07) * (1 - clamp((age - .22) / (latest.finale ? 1.2 : .65)));
    ctx.save(); ctx.globalAlpha = envelope * (latest.finale ? .13 : .07);
    ctx.fillStyle = '#281244'; ctx.fillRect(0, 0, width, height); ctx.restore();
    for (const event of this.events) {
      const t = (now - event.started) / 1000;
      if (t < 0) continue;
      this.nova(ctx, event, t, width, height);
      if (event.finale) this.finale(ctx, event, t, width, height);
    }
  }
  private nova(ctx: CanvasRenderingContext2D, e: Reaction, t: number, width: number, height: number) {
    const size = Math.min(width, height), scale = Math.min(1.25, size / 390);
    const radius = (e.finale ? size * .7 : 112 + e.chain * 16) * (1 - (1 - clamp(t / .65)) ** 3);
    const fade = Math.min(1, t / .045) * (1 - clamp((t - .25) / .85));
    ctx.save(); ctx.translate(e.x, e.y); ctx.lineCap = 'round';
    // Volumetric color behind the sharp geometry gives the burst a luminous body.
    const bloomRadius = Math.max(1, (80 + e.chain * 14) * scale * (.5 + clamp(t / .3)));
    ctx.globalAlpha = fade * (1 - clamp(t / .85)); this.glow(ctx, e.color, bloomRadius, false);
    // Broad, rising ribbons unravel in opposite directions around the completed potion.
    for (let ribbon = 0; ribbon < 3; ribbon++) {
      ctx.beginPath();
      for (let i = 0; i <= 50; i++) {
        const p = i / 50, a = p * TAU * 1.4 + ribbon * TAU / 3 + t * 5;
        const reach = (26 + p * 65) * scale * (.65 + clamp(t / .45) * .35);
        const x = Math.cos(a) * reach, y = Math.sin(a) * reach * .45 - p * (75 + t * 60) * scale;
        if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      const ribbonInk = ctx.createLinearGradient(0, 10, 0, -170 * scale);
      ribbonInk.addColorStop(0, e.color + '00'); ribbonInk.addColorStop(.3, e.color + 'bb');
      ribbonInk.addColorStop(.65, ribbon === 1 ? '#ffe07dbb' : '#8feeffaa'); ribbonInk.addColorStop(1, '#ffffff00');
      ctx.globalAlpha = fade * .6; ctx.strokeStyle = ribbonInk; ctx.lineWidth = (12 - ribbon * 2) * scale; ctx.stroke();
      ctx.globalAlpha = fade * .85; ctx.lineWidth = 1.5 * scale; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    }
    // Three independent wavefronts, with an electric white edge and a broad colored wake.
    for (let k = 0; k < 3; k++) {
      const p = (t - k * .095) / .8;
      if (p <= 0 || p >= 1) continue;
      const r = Math.max(1, radius * (1 - k * .15)), alpha = (1 - p) ** 2;
      ctx.globalAlpha = alpha; this.glow(ctx, e.color, r, true);
      ctx.globalAlpha = alpha * .8; ctx.strokeStyle = k === 1 ? '#fff0a3' : e.color; ctx.lineWidth = k ? 2 : 4;
      ctx.beginPath(); ctx.ellipse(0, 0, r * .92, r * (.72 + k * .09), k * .7, 0, TAU); ctx.stroke();
    }
    // A fan of long, tapered light shards makes the impact read even at phone size.
    for (let i = 0; i < 28; i++) {
      const a = i * TAU / 28 + e.seed * .7, n = random(i + e.seed * 83);
      const r = radius * (.8 + n * .9), inner = r * (.32 + clamp(t) * .5), spread = .014 + n * .035;
      ctx.globalAlpha = fade * (.2 + n * .55); ctx.fillStyle = i % 3 ? e.color : '#ffc83e';
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(Math.cos(a - spread) * inner, Math.sin(a - spread) * inner);
      ctx.lineTo(Math.cos(a + spread) * inner, Math.sin(a + spread) * inner); ctx.closePath(); ctx.fill();
    }
    // Launch trails first, then a second glitter detonation at their tips.
    const count = e.finale ? 90 : 38 + e.chain * 4;
    for (let i = 0; i < count; i++) {
      const n = random(i * 7 + e.seed * 113), a = i * 2.39996 + e.seed;
      const life = .8 + n * .55, p = t / life;
      if (p >= 1) continue;
      const speed = (85 + n * (e.finale ? 340 : 180)) * scale;
      const travel = speed * (1 - Math.exp(-t * 2.5)) / 2.5;
      const x = Math.cos(a) * travel, y = Math.sin(a) * travel + t * t * 38;
      const color = i % 4 === 0 ? '#ffd34e' : i % 4 === 1 ? '#34d8f4' : e.color;
      ctx.globalAlpha = Math.min(1, t * 18) * (1 - p) ** .6;
      ctx.strokeStyle = color; ctx.lineWidth = (1.5 + n * 2) * (1 - p); ctx.beginPath();
      ctx.moveTo(x * .7, y * .7); ctx.lineTo(x, y); ctx.stroke();
      star(ctx, x, y, (2 + n * 4) * (1 - p) * scale, i % 3 ? '#ffffff' : color);
      if (t > .26 && i % 3 === 0) {
        const pop = (t - .26) * 42;
        for (let j = 0; j < 3; j++) {
          const angle = a + j * TAU / 3;
          star(ctx, x + Math.cos(angle) * pop, y + Math.sin(angle) * pop, 2 * (1 - p) * scale, color);
        }
      }
    }
    // The core opens into an anamorphic flare, rather than a full-screen white flash.
    ctx.globalAlpha = fade * (1 - clamp(t / .6));
    const span = Math.min(width * .8, 230 + e.chain * 22);
    const flare = ctx.createLinearGradient(-span, 0, span, 0);
    flare.addColorStop(0, e.color + '00'); flare.addColorStop(.3, e.color + '88');
    flare.addColorStop(.5, '#ffffff'); flare.addColorStop(.7, '#ffe39baa'); flare.addColorStop(1, e.color + '00');
    ctx.fillStyle = flare; ctx.beginPath(); ctx.ellipse(0, 0, span, 7 * scale, -.08, 0, TAU); ctx.fill();
    ctx.restore();
  }
  private finale(ctx: CanvasRenderingContext2D, e: Reaction, t: number, width: number, height: number) {
    const scale = Math.min(1.3, Math.min(width, height) / 390);
    const fade = Math.min(1, t / .12) * (1 - clamp((t - .9) / 1));
    const r = Math.min(width * .38, height * .36, 240) * (.6 + .4 * (1 - (1 - clamp(t / .5)) ** 3));
    ctx.save(); ctx.translate(e.x, e.y); ctx.globalAlpha = fade;
    // Counter-rotating rainbow arcs orbit the board while the next stage remains playable.
    for (let ring = 0; ring < 3; ring++) {
      const radius = r * (1 + ring * .19), rotate = t * (ring % 2 ? -.9 : .65);
      for (let k = 0; k < 8; k++) {
        const a = k * TAU / 8 + rotate;
        ctx.strokeStyle = WATER_COLORS[k] + 'aa'; ctx.lineWidth = (ring ? 3 : 11) * scale;
        ctx.beginPath(); ctx.arc(0, 0, radius, a, a + .52); ctx.stroke();
        if (!ring) { ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 2 * scale; ctx.stroke(); }
        star(ctx, Math.cos(a) * radius, Math.sin(a) * radius, (ring ? 3 : 6) * scale, '#ffffff');
      }
    }
    // Two staggered fireworks fill the upper corners, clear of the primary touch controls.
    for (let side = 0; side < 2; side++) {
      const p = (t - .18 - side * .16) / 1.15;
      if (p <= 0 || p >= 1) continue;
      const x = (side ? 1 : -1) * Math.min(width * .28, 220), y = -Math.min(height * .2, 145);
      const spread = (1 - (1 - p) ** 3) * 100 * scale;
      ctx.globalAlpha = Math.sin(p * Math.PI) * fade;
      for (let i = 0; i < 28; i++) {
        const a = i * TAU / 28;
        ctx.strokeStyle = WATER_COLORS[(i + side * 3) % 8]; ctx.lineWidth = 2 * (1 - p);
        ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * spread * .7, y + Math.sin(a) * spread * .7 + p * p * 30);
        ctx.lineTo(x + Math.cos(a) * spread, y + Math.sin(a) * spread + p * p * 30); ctx.stroke();
        star(ctx, x + Math.cos(a) * spread, y + Math.sin(a) * spread + p * p * 30, 3 * (1 - p), '#fff2ad');
      }
    }
    // A celebratory word is visual decoration; the existing localized clear UI is retained.
    const pop = 1 + Math.sin(clamp(t / .24) * Math.PI) * .2;
    ctx.globalAlpha = fade; ctx.translate(0, Math.max(height * .23 - e.y, -r * .85) - t * 12); ctx.scale(pop, pop); ctx.rotate(-.07);
    ctx.font = `1000 ${Math.round(48 * scale)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#7134a8'; ctx.lineWidth = 12 * scale; ctx.strokeText('WOW!', 0, 0);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 7 * scale; ctx.strokeText('WOW!', 0, 0);
    const gold = ctx.createLinearGradient(0, -28 * scale, 0, 28 * scale);
    gold.addColorStop(0, '#fff9bd'); gold.addColorStop(.5, '#ffe358'); gold.addColorStop(1, '#ff8a34');
    ctx.fillStyle = gold; ctx.fillText('WOW!', 0, 0); ctx.restore();
  }
}
