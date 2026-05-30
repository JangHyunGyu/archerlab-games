import { loadSoundEnabled, saveSoundEnabled } from './storage.js';

// 쥬얼리아 효과음은 전부 WebAudio 실시간 합성(tones)으로 생성한다.
// 바이너리 SFX 에셋 의존 없음 → 0바이트, 무한 변주, 무한 튜닝.
// BGM 루프만 mp3 파일을 사용한다.
const MUSIC_ASSETS = {
  main: 'assets/sounds/bgm_main_loop.mp3',
  game: 'assets/sounds/bgm_game_loop.mp3'
};

// 보석/크리스털 질감을 만드는 비정수배(inharmonic) 배음 비율.
const GEM_PARTIALS = [1, 2.01, 3.03, 4.18, 5.47, 6.83, 8.21];
const rnd = (min, max) => min + Math.random() * (max - min);

export class AudioManager {
  constructor() {
    this.enabled = loadSoundEnabled();
    this.ctx = null;
    this.master = null;
    this.compressor = null;
    this.shimmerIn = null;
    this.music = null;
    this.desiredMusic = null;
    this.buffers = new Map();
    this.loading = new Map();
  }

  async unlock() {
    if (!this.enabled) return;
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.ctx = new AudioContext();
      this.buildGraph();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
  }

  buildGraph() {
    const ctx = this.ctx;
    // 마스터 → 컴프레서(리미터 역할) → 출력
    this.master = ctx.createGain();
    this.master.gain.value = 0.4;
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 26;
    this.compressor.ratio.value = 9;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.18;
    this.master.connect(this.compressor);
    this.compressor.connect(ctx.destination);

    // 크리스털 잔향(shimmer) 센드: 피드백 딜레이 + 하이패스 → 공기감 있는 꼬리.
    this.shimmerIn = ctx.createGain();
    this.shimmerIn.gain.value = 1;
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.16;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.34;
    const tone = ctx.createBiquadFilter();
    tone.type = 'highpass';
    tone.frequency.value = 1300;
    const wet = ctx.createGain();
    wet.gain.value = 0.16;
    this.shimmerIn.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(tone);
    tone.connect(wet);
    wet.connect(this.master);
  }

  toggle() {
    this.enabled = !this.enabled;
    saveSoundEnabled(this.enabled);
    if (!this.enabled) this.fadeOutMusic(0.34);
    else if (this.desiredMusic) this.startAmbient(this.desiredMusic);
    return this.enabled;
  }

  play(name, intensity = 1, detail = {}) {
    if (!this.enabled) return;
    this.unlock().then(() => {
      if (!this.ctx || !this.master) return;
      const now = this.ctx.currentTime + 0.005;
      const level = Math.max(1, Number(intensity) || 1);
      switch (name) {
        case 'swap': return this.playSwap(now);
        case 'invalid': return this.playInvalid(now);
        case 'match': return this.playMatch(now, level, detail);
        case 'combo': return this.playCombo(now, level, detail);
        case 'special': return this.playSpecial(now, level, detail);
        case 'cascade': return this.playCascade(now, level, detail);
        case 'clear': return this.playClear(now);
        case 'fail': return this.playFail(now);
        case 'button': return this.playButton(now);
        default: return undefined;
      }
    });
  }

  // ---- 이벤트별 사운드 디자인 -------------------------------------------

  playSwap(now) {
    this.glassNoise(now, 0.13, 0.05, 5200, 'highpass');
    this.glide(now + 0.005, 520, 660, 0.09, 'triangle', 0.05, rnd(-0.3, 0.3));
  }

  playInvalid(now) {
    this.partial(now, 196, 0.16, 0.075, 'sawtooth', -0.1, 0, 520);
    this.partial(now + 0.04, 150, 0.2, 0.06, 'triangle', 0.1);
    this.glassNoise(now, 0.08, 0.02, 800, 'lowpass');
  }

  playMatch(now, level, detail) {
    const lineCount = Number(detail.lineCount || 1);
    const longest = Number(detail.longest || 3);
    const removed = Number(detail.removedCount || longest || 3);
    const big = lineCount > 1 || longest >= 4;
    const huge = lineCount >= 3 || longest >= 5 || removed >= 6;
    const base = rnd(498, 542) * (huge ? 1.18 : big ? 1.08 : 1);
    const pan = rnd(-0.35, 0.35);

    // 보석 3개 이상이 깨지는 소리가 주인공. 매치 규모만큼 더 크고 파편이 많아진다.
    const shatterPower = huge ? 1.7 : big ? 1.3 : 1.0;
    this.glassShatter(now, shatterPower, pan);
    // 깨짐 직후의 보석 잔향 종소리(고역에서 은은하게 받쳐줌).
    this.gemBell(now + 0.014, base * 1.5, huge ? 0.42 : big ? 0.34 : 0.26, huge ? 0.1 : big ? 0.08 : 0.06, pan, huge ? 0.5 : big ? 0.4 : 0.3);
    // 저역 펀치는 아주 약하게만(유리는 베이스가 거의 없음).
    if (huge) this.subImpact(now, 0.5);
    this.sparkleTail(now + 0.02, huge ? 12 : big ? 8 : 5, huge ? 0.5 : big ? 0.4 : 0.3, pan);
    if (big) this.gemBell(now + 0.05, base * 1.5, 0.3, 0.075, pan, 0.5);
  }

  playCombo(now, level, detail) {
    const pan = rnd(-0.3, 0.3);
    const steps = Math.min(8, 2 + level);
    this.glassShatter(now, 1.2 + level * 0.08, pan);
    // 저역 펀치는 큰 콤보에서만 아주 약하게(유리는 베이스가 거의 없음).
    if (level >= 4) this.subImpact(now, 0.45);
    this.sweep(now, 480 + level * 30, 2400 + level * 240, 0.26, 0.1, pan);
    // 콤보 단계만큼 음정이 올라가는 반짝이는 아르페지오.
    const root = 392 * Math.pow(2, Math.min(level, 9) / 12);
    for (let i = 0; i < steps; i += 1) {
      const t = now + 0.02 + i * 0.045;
      this.gemBell(t, root * Math.pow(2, i / 7), 0.32, 0.12 - i * 0.008, pan, 0.42);
    }
    this.sparkleTail(now + 0.05, 8 + level, 0.6, pan);
    if (level >= 3) this.glide(now + 0.04, root, root * 2, 0.4, 'triangle', 0.07, pan);
  }

  playSpecial(now, level, detail) {
    const pan = rnd(-0.2, 0.2);
    this.glassShatter(now, 1.75, pan, 'white');
    // 특수 보석은 화려함이 핵심 — 저역은 살짝만.
    this.subImpact(now, 0.6);
    this.sweep(now, 320, 3600, 0.34, 0.14, pan);
    this.sweep(now + 0.16, 3600, 700, 0.3, 0.08, -pan);
    // 프리즘: 6음 화려한 상승 + 긴 반짝임 블룸.
    const root = rnd(414, 430);
    [0, 4, 7, 12, 16, 19].forEach((semi, i) => {
      this.gemBell(now + 0.03 + i * 0.05, root * Math.pow(2, semi / 12), 0.6, 0.15 - i * 0.012, pan, 0.6);
    });
    this.sparkleTail(now + 0.06, 18, 0.95, pan);
  }

  playCascade(now, level, detail) {
    const fallCount = Math.max(1, Number(detail.fallCount || 1));
    const strength = Math.min(1, fallCount / 28);
    const landDelay = Math.min(0.46, 0.2 + fallCount * 0.006);
    // 가벼운 하강 스윽 + 보석 착지 딸깍/반짝임.
    this.glide(now, 720, 360, 0.22 + strength * 0.12, 'triangle', 0.045 + strength * 0.03, rnd(-0.4, 0.4));
    const drops = Math.min(5, 2 + Math.round(strength * 4));
    for (let i = 0; i < drops; i += 1) {
      const t = now + landDelay + i * 0.035;
      this.partial(t, rnd(680, 1080), 0.12, 0.05 + strength * 0.03, 'sine', rnd(-0.5, 0.5), 0.18);
    }
    this.sparkleTail(now + landDelay, 3 + Math.round(strength * 4), 0.3 + strength * 0.2, 0);
  }

  playClear(now) {
    // 짧은 승리 팡파르: 메이저 상승 아르페지오 + 반짝임 블룸.
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, i) => {
      this.gemBell(now + 0.05 + i * 0.085, freq, 0.7, 0.16 - i * 0.012, rnd(-0.3, 0.3), 0.55);
    });
    this.subImpact(now + 0.04, 1.0);
    this.glassShatter(now + 0.02, 0.8, 0);
    this.sparkleTail(now + 0.18, 16, 1.1, 0);
  }

  playFail(now) {
    // 너무 우울하지 않은 하강 스팅어.
    const notes = [392, 311.1, 261.6];
    notes.forEach((freq, i) => {
      this.gemBell(now + 0.04 + i * 0.13, freq, 0.5, 0.12 - i * 0.02, rnd(-0.2, 0.2), 0.22);
    });
    this.glassNoise(now + 0.08, 0.24, 0.03, 520, 'lowpass');
  }

  playButton(now) {
    this.partial(now, 880, 0.09, 0.06, 'triangle', rnd(-0.2, 0.2), 0.12);
    this.partial(now + 0.012, 1320, 0.06, 0.035, 'sine', 0, 0.1);
    this.glassNoise(now, 0.04, 0.015, 4200, 'highpass');
  }

  // ---- 합성 빌딩 블록 ----------------------------------------------------

  voiceOut(pan, send) {
    const ctx = this.ctx;
    const node = (typeof ctx.createStereoPanner === 'function') ? ctx.createStereoPanner() : ctx.createGain();
    if (node.pan) node.pan.value = Math.max(-1, Math.min(1, pan || 0));
    node.connect(this.master);
    if (send > 0 && this.shimmerIn) {
      const tap = ctx.createGain();
      tap.gain.value = send;
      node.connect(tap);
      tap.connect(this.shimmerIn);
    }
    return node;
  }

  // 비정수배 배음으로 만든 보석/크리스털 종소리.
  gemBell(start, baseFreq, duration, peak, pan = 0, send = 0) {
    if (!this.ctx || !this.master) return;
    const out = this.voiceOut(pan, send);
    GEM_PARTIALS.forEach((ratio, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = i === 0 ? 'sine' : i < 3 ? 'triangle' : 'sine';
      osc.frequency.value = Math.max(20, baseFreq * ratio * rnd(0.998, 1.002));
      const partialPeak = Math.max(0.0001, peak * Math.pow(0.62, i));
      const partialDur = duration * (1 - i * 0.07);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(partialPeak, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.05, partialDur));
      osc.connect(gain);
      gain.connect(out);
      osc.start(start);
      osc.stop(start + partialDur + 0.05);
    });
  }

  // 단일 배음 톤.
  partial(start, freq, duration, peak, type = 'sine', pan = 0, send = 0, filterFreq = 0) {
    if (!this.ctx || !this.master) return;
    const out = this.voiceOut(pan, send);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = Math.max(20, freq);
    const safe = Math.max(0.0001, Math.min(0.6, peak));
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(safe, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    if (filterFreq > 0) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(out);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  // 음정이 미끄러지는 글라이드 톤.
  glide(start, from, to, duration, type = 'triangle', peak = 0.06, pan = 0) {
    if (!this.ctx || !this.master) return;
    const out = this.voiceOut(pan, 0);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, from), start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(21, to), start + duration);
    const safe = Math.max(0.0001, Math.min(0.6, peak));
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(safe, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(out);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  // 저역 바디 임팩트(피치 드롭).
  subImpact(start, power = 1) {
    if (!this.ctx || !this.master) return;
    const out = this.voiceOut(0, 0);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, start);
    osc.frequency.exponentialRampToValueAtTime(48, start + 0.14);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.min(0.5, 0.26 * power), start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
    osc.connect(gain);
    gain.connect(out);
    osc.start(start);
    osc.stop(start + 0.26);
  }

  // 유리/보석 깨짐: 날카로운 크랙 트랜지언트 + 잘게 흩어지는 파편 짤랑임.
  glassShatter(start, power = 1, pan = 0, color = 'pink') {
    // 1) 초기 크랙 — 아주 짧고 밝은 고역 파열(저음 없음).
    this.glassNoise(start, 0.012, 0.3 * power, 5200, 'highpass', pan, 'white');
    // 2) 쪼개짐 — 짧은 고역 노이즈 바디.
    this.glassNoise(start + 0.004, 0.04 + power * 0.02, 0.1 * power, 3200, 'highpass', -pan * 0.5, 'white');
    // 3) 파편 짤랑임 — 진짜 "깨지는 소리"의 핵심.
    const shardCount = Math.round(8 + power * 14);
    this.glassShards(start + 0.006, shardCount, 0.12 + power * 0.26, 0.18 * power, pan);
  }

  // 깨진 파편이 사방으로 튀며 짤랑이는 소리.
  // 톤이 아니라 노이즈를 고Q 밴드패스로 울려 유리 특유의 "쨍/클링"을 만든다.
  glassShards(start, count, spread, amount, pan = 0) {
    if (!this.ctx || !this.master) return;
    const n = Math.max(2, Math.round(count));
    // 짧은 화이트 노이즈 버퍼 1개를 공유해 각 파편의 여기(excitation)로 사용.
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * 0.05));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    for (let i = 0; i < n; i += 1) {
      // 초반에 몰리고 뒤로 갈수록 듬성해지는 자연스러운 흩어짐.
      const t = start + Math.pow(Math.random(), 1.7) * spread;
      const freq = rnd(3200, 9500);
      const dur = rnd(0.025, 0.085);
      const peak = amount * rnd(0.05, 0.14);
      const out = this.voiceOut(pan + rnd(-0.7, 0.7), 0.55);
      const source = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      source.buffer = buffer;
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = rnd(18, 38); // 고Q → 유리/금속성 "쨍" 링
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      source.start(t);
      source.stop(t + dur + 0.02);
    }
  }

  glassNoise(start, duration, peak, freq, type = 'highpass', pan = 0, color = 'white') {
    if (!this.ctx || !this.master) return;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      if (color === 'pink') {
        last = 0.82 * last + 0.18 * white;
        data[i] = last * 1.4;
      } else {
        data[i] = white;
      }
    }
    const out = this.voiceOut(pan, 0);
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = type === 'bandpass' ? 1.6 : 0.7;
    const attack = Math.min(0.004, duration * 0.12);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, Math.min(0.6, peak)), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  // 고역 반짝임 꼬리(랜덤 사인 그레인).
  sparkleTail(start, density, amount = 0.5, pan = 0) {
    const count = Math.max(1, Math.round(density));
    for (let i = 0; i < count; i += 1) {
      const t = start + i * rnd(0.012, 0.05);
      const freq = rnd(1800, 5200);
      this.partial(t, freq, rnd(0.08, 0.18), amount * rnd(0.02, 0.05), 'sine', pan + rnd(-0.4, 0.4), 0.5);
    }
  }

  // 필터 스윕(에너지 상승감).
  sweep(start, from, to, duration, peak, pan = 0) {
    if (!this.ctx || !this.master) return;
    const out = this.voiceOut(pan, 0.3);
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(Math.max(20, from), start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(21, to), start + duration);
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(Math.max(80, from * 1.4), start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(100, to * 1.1), start + duration);
    filter.Q.value = 3.4;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, Math.min(0.5, peak)), start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  // ---- BGM (mp3 루프) ----------------------------------------------------

  loadBuffer(name, url) {
    if (!url) return Promise.resolve(null);
    if (!this.ctx || this.buffers.has(name)) return Promise.resolve(this.buffers.get(name));
    if (this.loading.has(name)) return this.loading.get(name);
    const promise = fetch(url)
      .then((res) => res.ok ? res.arrayBuffer() : Promise.reject(new Error(`sound ${res.status}`)))
      .then((data) => this.ctx.decodeAudioData(data))
      .then((buffer) => {
        this.buffers.set(name, buffer);
        return buffer;
      })
      .catch(() => null)
      .finally(() => this.loading.delete(name));
    this.loading.set(name, promise);
    return promise;
  }

  startAmbient(track = 'main') {
    const musicKey = MUSIC_ASSETS[track] ? track : 'main';
    this.desiredMusic = musicKey;
    if (!this.enabled) return;
    this.unlock().then(() => this.playMusic(musicKey));
  }

  stopAmbient() {
    this.desiredMusic = null;
    this.fadeOutMusic(0.34);
  }

  async playMusic(track) {
    if (!this.ctx || !this.master || !this.enabled) return;
    if (this.music?.track === track) return;
    const buffer = await this.loadBuffer(`music:${track}`, MUSIC_ASSETS[track]);
    if (!buffer || !this.ctx || !this.master || !this.enabled || this.desiredMusic !== track) return;
    const now = this.ctx.currentTime;
    this.fadeOutMusic(0.52);
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const targetVolume = track === 'game' ? 0.105 : 0.088;
    source.buffer = buffer;
    source.loop = true;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(targetVolume, now + 0.9);
    source.connect(gain);
    gain.connect(this.master);
    source.start(now);
    source.onended = () => {
      try { source.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
    };
    this.music = { track, source, gain };
  }

  fadeOutMusic(duration = 0.42) {
    if (!this.music || !this.ctx) return;
    const { source, gain } = this.music;
    const now = this.ctx.currentTime;
    const stopAt = now + Math.max(0.08, duration);
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
    try { source.stop(stopAt + 0.03); } catch {}
    this.music = null;
  }
}
