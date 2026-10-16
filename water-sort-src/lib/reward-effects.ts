import { WATER_COLORS } from './glass-renderer.ts';

export type RewardPoint = { x: number; y: number };
export type RewardBottle = RewardPoint & { width: number; height: number; color: number };
type Burst = RewardBottle & { started: number; chain: number; finale: boolean };
type Mote = RewardPoint & { vx: number; vy: number; size: number; color: string; born: number; life: number; kind: number; seed: number };
type Flight = { from: RewardPoint; to: RewardPoint; color: string; started: number; delay: number };
type Score = { from: RewardPoint; to: RewardPoint; amount: number; started: number };
const TAU = Math.PI * 2;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => 1 - (1 - clamp(v)) ** 3;
const noise = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

function sigil(ctx: CanvasRenderingContext2D, radius: number, color: string, rotation: number) {
  ctx.save(); ctx.rotate(rotation); ctx.strokeStyle = color; ctx.lineWidth = 1.2;
  for (const factor of [1, .93, .72, .39]) {
    ctx.beginPath(); ctx.arc(0, 0, radius * factor, 0, TAU); ctx.stroke();
  }
  for (let i = 0; i < 24; i++) {
    ctx.save(); ctx.rotate(i * TAU / 24);
    const y = -radius * .96, length = radius * (i % 3 ? .035 : .085);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(0, y + length);
    if (!(i % 3)) { ctx.moveTo(-2, y + 2); ctx.lineTo(2, y + 2); ctx.moveTo(-2, y + 5); ctx.lineTo(2, y + 5); }
    ctx.stroke(); ctx.restore();
  }
  for (let tri = 0; tri < 2; tri++) {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const angle = i * TAU / 3 - Math.PI / 2 + tri * Math.PI;
      const x = Math.cos(angle) * radius * .72, y = Math.sin(angle) * radius * .72;
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(-radius * .2, 0); ctx.lineTo(radius * .2, 0);
  ctx.moveTo(0, -radius * .2); ctx.lineTo(0, radius * .2); ctx.stroke(); ctx.restore();
}

/** A settled bottle earns one reward per stage; returning to a saved board earns none. */
export class RewardChain {
  scope = '';
  private bottles = new Set<string>();
  private last = -Infinity;
  private count = 0;
  private cleared = false;
  enter(scope: string) {
    if (this.scope === scope) return;
    this.scope = scope; this.bottles.clear(); this.last = -Infinity; this.count = 0; this.cleared = false;
  }
  bottle(scope: string, id: string, now: number) {
    this.enter(scope);
    if (this.bottles.has(id)) return 0;
    this.bottles.add(id);
    this.count = now - this.last <= 4200 ? Math.min(6, this.count + 1) : 1;
    this.last = now;
    return this.count;
  }
  clear(scope: string) {
    this.enter(scope);
    if (this.cleared) return false;
    this.cleared = true;
    return true;
  }
}

/** Time-based trajectories stay identical at 60/90/120 Hz. One bounded canvas sleeps when idle. */
export class RewardPainter {
  private bursts: Burst[] = [];
  private motes: Mote[] = [];
  private flights: Flight[] = [];
  private score: Score | null = null;
  private ritual: { x: number; y: number; radius: number; started: number } | null = null;
  private serial = 0;
  get active() { return !!(this.bursts.length || this.motes.length || this.flights.length || this.score || this.ritual); }
  get particles() { return this.motes.length; }
  finishStage() { this.bursts = []; this.motes = []; this.ritual = null; }
  reset() { this.bursts = []; this.motes = []; this.flights = []; this.score = null; this.ritual = null; }
  bottle(bottle: RewardBottle, chain: number, now: number, finale = false) {
    this.bursts.push({ ...bottle, chain, started: now, finale });
    this.bursts = this.bursts.slice(-12);
    const count = finale ? 22 : 32 + chain * 4;
    const scale = Math.max(.65, Math.min(1.25, bottle.width / 52));
    for (let i = 0; i < count; i++) {
      const seed = ++this.serial, angle = -Math.PI + noise(seed) * Math.PI;
      const speed = (55 + noise(seed + 7) * 130) * scale * (1 + chain * .05);
      this.motes.push({ x: bottle.x, y: bottle.y + 4, vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 28 * scale, size: (2 + noise(seed + 3) * 6) * scale,
        color: i % 5 === 0 ? '#ffd76b' : WATER_COLORS[bottle.color] ?? '#b485ef',
        born: now + 70 + noise(seed + 9) * 140, life: 650 + noise(seed + 11) * 540,
        kind: i % 4, seed });
    }
    this.motes = this.motes.slice(-280);
  }
  clear(bottles: RewardBottle[], target: RewardPoint, amount: number, now: number) {
    if (!bottles.length) return;
    const center = { x: bottles.reduce((sum, b) => sum + b.x, 0) / bottles.length,
      y: Math.max(105, Math.min(...bottles.map(b => b.y)) - 68) };
    bottles.forEach((bottle, i) => {
      this.bottle(bottle, 2, now + i * 25, true);
      for (let k = 0; k < 3; k++) this.flights.push({ from: { x: bottle.x, y: bottle.y + bottle.height * .4 },
        to: target, color: WATER_COLORS[bottle.color], started: now, delay: i * 24 + k * 65 });
    });
    this.flights = this.flights.slice(-30);
    this.score = { from: center, to: target, amount, started: now };
    this.ritual = { x: center.x, y: bottles.reduce((sum, b) => sum + b.y + b.height * .5, 0) / bottles.length,
      radius: Math.min(250, Math.max(110, (Math.max(...bottles.map(b => b.x)) - Math.min(...bottles.map(b => b.x))) * .65)), started: now };
  }
  draw(ctx: CanvasRenderingContext2D, now: number, width: number, height: number) {
    ctx.clearRect(0, 0, width, height);
    this.bursts = this.bursts.filter(b => now - b.started < (b.finale ? 650 : 1050));
    this.motes = this.motes.filter(p => now - p.born < p.life);
    this.flights = this.flights.filter(p => now - p.started - p.delay < 900);
    if (this.ritual) {
      const age = now - this.ritual.started, p = age / 450;
      if (p >= 1) this.ritual = null;
      else {
        const r = this.ritual, radius = r.radius * (.65 + ease(p * 2) * .35);
        ctx.save(); ctx.translate(r.x, r.y); ctx.globalAlpha = Math.sin(p * Math.PI) * .65;
        sigil(ctx, radius, '#ac78df', -p * .18); ctx.scale(.88, .88);
        sigil(ctx, radius, '#eab66b', p * .35); ctx.restore();
      }
    }
    for (const burst of this.bursts) this.drawBurst(ctx, burst, now);
    for (const mote of this.motes) this.drawMote(ctx, mote, now);
    for (const flight of this.flights) this.drawFlight(ctx, flight, now);
    if (this.score) {
      if (now - this.score.started > 1120) this.score = null;
      else this.drawScore(ctx, this.score, now, width);
    }
    ctx.globalAlpha = 1;
  }
  private drawBurst(ctx: CanvasRenderingContext2D, b: Burst, now: number) {
    const age = now - b.started;
    if (age < 0) return;
    const t = age / 1000, color = WATER_COLORS[b.color] ?? '#b485ef';
    const scale = Math.max(.65, Math.min(1.3, b.width / 52));
    ctx.save(); ctx.translate(b.x, b.y);
    const sealFade = Math.min(1, t / .08) * (1 - clamp((t - .38) / .55));
    ctx.save(); ctx.translate(0, b.height - 2); ctx.scale(1, .34);
    ctx.globalAlpha = sealFade * .85;
    sigil(ctx, b.width * (1.05 + ease(t / .3) * .35), color, t * .45);
    ctx.globalAlpha = sealFade * .7;
    sigil(ctx, b.width * .83, '#e6ac45', -t * .6); ctx.restore();
    if (t > .07 && t < .34) {
      ctx.globalAlpha = Math.sin((t - .07) / .27 * Math.PI) * .85;
      for (let bolt = 0; bolt < 2; bolt++) {
        ctx.beginPath();
        for (let i = 0; i <= 9; i++) {
          const y = b.height * (1 - i / 9) - i * 3;
          const x = (bolt ? 1 : -1) * (b.width * .4 + Math.sin(i * 4.7 + t * 25) * b.width * .16);
          if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color + '99'; ctx.lineWidth = 4; ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.stroke();
      }
    }
    // A saturated core and soft outer bloom remain legible over the pastel scenery.
    if (t < .5) {
      const alpha = Math.sin(clamp(t / .5) * Math.PI) * .68;
      const radius = (22 + ease(t / .38) * 66) * scale;
      const glow = ctx.createRadialGradient(0, 5, 1, 0, 5, radius);
      glow.addColorStop(0, '#ffffff'); glow.addColorStop(.18, color + 'dd'); glow.addColorStop(.5, color + '66'); glow.addColorStop(1, color + '00');
      ctx.globalAlpha = alpha; ctx.fillStyle = glow; ctx.fillRect(-radius, 5 - radius, radius * 2, radius * 2);
    }
    if (t < .46) {
      const rise = ease(t / .35), beamHeight = b.height * rise;
      const beam = ctx.createLinearGradient(0, b.height, 0, b.height - beamHeight - 15);
      beam.addColorStop(0, color + '00'); beam.addColorStop(.65, color + '80'); beam.addColorStop(1, '#ffffff');
      ctx.globalAlpha = (1 - clamp((t - .22) / .24)) * .8;
      ctx.fillStyle = beam; ctx.beginPath(); ctx.roundRect(-b.width * .29, b.height - beamHeight, b.width * .58, beamHeight, b.width * .22); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, b.height - beamHeight, b.width * .3, 3 * scale, 0, 0, TAU); ctx.fill();
    }
    for (let ring = 0; ring < 2; ring++) {
      const p = (t - .08 - ring * .09) / .55;
      if (p <= 0 || p >= 1) continue;
      const r = (16 + ease(p) * (55 + b.chain * 5)) * scale;
      ctx.globalAlpha = (1 - p) ** 2 * .9; ctx.lineWidth = (2.5 - p) * scale;
      ctx.strokeStyle = ring ? '#ffffff' : color;
      ctx.beginPath(); ctx.ellipse(0, 9, r, r * .37, -.14, 0, TAU); ctx.stroke();
    }
    if (!b.finale && b.chain > 1 && t < .95) {
      const a = Math.min(1, t / .1) * (1 - clamp((t - .6) / .35));
      ctx.globalAlpha = a;
      ctx.translate(0, -48 * scale - ease(t / .8) * 18);
      ctx.rotate(-.08); ctx.font = `900 ${Math.round((19 + b.chain) * scale)}px system-ui,sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.lineWidth = 6 * scale; ctx.strokeStyle = '#ffffff'; ctx.strokeText(`✦ ×${b.chain}`, 0, 0);
      ctx.fillStyle = color; ctx.fillText(`✦ ×${b.chain}`, 0, 0);
    }
    ctx.restore();
  }
  private drawMote(ctx: CanvasRenderingContext2D, p: Mote, now: number) {
    const elapsed = now - p.born;
    if (elapsed < 0) return;
    const t = elapsed / 1000, life = elapsed / p.life;
    const x = p.x + p.vx * t * (1 - life * .32), y = p.y + p.vy * t + 85 * t * t;
    const size = p.size * (1 - life * .55);
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha = Math.min(1, life * 12) * (1 - life) ** .7;
    if (p.kind === 0 || p.kind === 3) {
      const gradient = ctx.createRadialGradient(-size * .3, -size * .35, 0, 0, 0, size);
      gradient.addColorStop(0, '#ffffffee'); gradient.addColorStop(.3, '#ffffff55');
      gradient.addColorStop(.72, p.color + '44'); gradient.addColorStop(1, p.color + 'dd');
      ctx.fillStyle = gradient; ctx.strokeStyle = p.color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, size, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(.8, size * .2);
      ctx.beginPath(); ctx.arc(-size * .13, -size * .13, size * .65, -2.8, -1.2); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(size * .35, size * .4, size * .15, 0, TAU); ctx.fill();
    } else {
      ctx.rotate(t * (p.seed % 2 ? 2 : -2) + p.seed);
      ctx.fillStyle = p.kind === 1 ? p.color : '#fff2b2'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const r = k % 2 ? size * .27 : size * 1.35, angle = k * Math.PI / 4;
        if (!k) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r); else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  private flightPoint(f: Flight, t: number) {
    const p = ease(t), bend = Math.sin(p * Math.PI);
    return { x: f.from.x + (f.to.x - f.from.x) * p + bend * 30,
      y: f.from.y + (f.to.y - f.from.y) * p - bend * 65 };
  }
  private drawFlight(ctx: CanvasRenderingContext2D, f: Flight, now: number) {
    const t = (now - f.started - f.delay) / 850;
    if (t < 0 || t > 1) return;
    const head = this.flightPoint(f, t);
    ctx.save(); ctx.globalAlpha = Math.min(1, t * 8, (1 - t) * 9);
    ctx.lineCap = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = f.color + '99'; ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const point = this.flightPoint(f, Math.max(0, t - .13 + .013 * i));
      if (!i) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke(); ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(head.x, head.y, 4.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(head.x - 1, head.y - 1, 2, 0, TAU); ctx.fill(); ctx.restore();
  }
  private drawScore(ctx: CanvasRenderingContext2D, score: Score, now: number, width: number) {
    const age = now - score.started, flight = ease((age - 380) / 650);
    const x = score.from.x + (score.to.x - score.from.x) * flight;
    const y = score.from.y + (score.to.y - score.from.y) * flight - Math.sin(flight * Math.PI) * 25;
    const scale = (1 + Math.sin(clamp(age / 260) * Math.PI) * .18) * (1 - flight * .55);
    ctx.save(); ctx.globalAlpha = Math.min(1, age / 80) * (1 - clamp((age - 880) / 240));
    ctx.translate(Math.max(65, Math.min(width - 65, x)), y); ctx.scale(scale, scale);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `900 ${width < 600 ? 30 : 40}px system-ui,sans-serif`;
    ctx.lineJoin = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = '#ffffff'; ctx.strokeText(`+${score.amount.toLocaleString()}`, 0, 0);
    ctx.fillStyle = '#9361d8'; ctx.fillText(`+${score.amount.toLocaleString()}`, 0, 0); ctx.restore();
  }
}
