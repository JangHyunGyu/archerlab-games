import { loadSoundEnabled, saveSoundEnabled } from './storage.js';

// 쥬얼리아 효과음은 전부 WebAudio 실시간 합성(tones)으로 생성한다.
// 바이너리 SFX 에셋 의존 없음 → 0바이트, 무한 변주, 무한 튜닝.
// BGM 루프만 mp3 파일을 사용한다.
const MUSIC_ASSETS = {
  main: 'assets/sounds/bgm_main_loop.mp3',
  game: 'assets/sounds/bgm_game_loop.mp3'
};

// 외부 실음원 SFX. 파일이 있으면 합성 대신 이 샘플을 재생하고,
// 로드 실패 시 해당 이벤트는 자동으로 기존 합성으로 폴백한다.
const SFX_ASSETS = {
  swap: 'assets/sounds/sfx/swap.mp3',
  invalid: 'assets/sounds/sfx/invalid.mp3',
  match: 'assets/sounds/sfx/match.mp3',
  combo: 'assets/sounds/sfx/combo.mp3',
  special: 'assets/sounds/sfx/special.mp3',
  cascade: 'assets/sounds/sfx/cascade.mp3',
  clear: 'assets/sounds/sfx/clear.mp3',
  fail: 'assets/sounds/sfx/fail.mp3',
  button: 'assets/sounds/sfx/button.mp3'
};

// 강도에 따라 음량이 커지는 이벤트(샘플 재생 시 게인 스케일).
const DYNAMIC_SFX = new Set(['match', 'combo', 'special', 'cascade']);

// 샘플 재생을 더 풍성하게: 이벤트별 리버브 센드 + 스테레오 더블링 폭 +
// 샘플 위에 얹는 합성 악센트(반짝임/크리스털 링/서브 임팩트) 설정.
// width: 살짝 디튠된 좌우 복사본 게인(두께·공간감). sparkle: 반짝임 그레인 수.
// crystal/sub: 해당 power, crystalMin/subMin: 발동 최소 강도 레벨.
const SFX_RICH = {
  swap:    { send: 0.16, width: 0.18 },
  invalid: { send: 0.10, width: 0.10 },
  match:   { send: 0.22, width: 0.30, sparkle: 6, sparkleAmt: 0.30, crystal: 0.55, crystalMin: 2, sub: 0.4, subMin: 3 },
  combo:   { send: 0.28, width: 0.34, sparkle: 9, sparkleAmt: 0.40, crystal: 0.7, crystalMin: 2, sub: 0.4, subMin: 4 },
  special: { send: 0.36, width: 0.42, sparkle: 16, sparkleAmt: 0.60, crystal: 0.9, crystalMin: 1, sub: 0.55, subMin: 1 },
  cascade: { send: 0.18, width: 0.26, sparkle: 5, sparkleAmt: 0.26 },
  clear:   { send: 0.32, width: 0.30, sparkle: 14, sparkleAmt: 0.55, crystal: 0.7, crystalMin: 1 },
  fail:    { send: 0.24, width: 0.18 },
  button:  { send: 0.10, width: 0.14 }
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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
    this.sfxBuffers = new Map(); // 이벤트명 -> 디코드된 AudioBuffer
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
    // 시그널 체인: 마스터 → 에어(고역 쉘프) → 글루 컴프레서 → 출력 리미터 → 출력
    this.master = ctx.createGain();
    this.master.gain.value = 0.4;

    // "에어": 상단을 살짝 들어 보석 특유의 영롱한 광택을 더한다.
    const air = ctx.createBiquadFilter();
    air.type = 'highshelf';
    air.frequency.value = 7200;
    air.gain.value = 4.5;

    // 글루 컴프레서: 전체를 부드럽게 묶어준다(과하지 않게).
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 28;
    this.compressor.ratio.value = 6;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.2;

    // 출력 리미터: 피크를 잡아 클리핑을 막고 라우드니스를 안정화.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;

    this.master.connect(air);
    air.connect(this.compressor);
    this.compressor.connect(limiter);
    limiter.connect(ctx.destination);

    // ---- 공간계: 진짜 컨볼루션 리버브 + 크리스털 shimmer 딜레이 ----
    // 모든 보이스는 voiceOut(pan, send)에서 shimmerIn으로 센드된다.
    this.shimmerIn = ctx.createGain();
    this.shimmerIn.gain.value = 1;

    // 센드단 하이패스: 저역 진흙을 빼 리버브를 맑고 영롱하게 유지.
    const sendHP = ctx.createBiquadFilter();
    sendHP.type = 'highpass';
    sendHP.frequency.value = 700;
    this.shimmerIn.connect(sendHP);

    // 1) 절차적 임펄스 응답으로 만든 스테레오 컨볼루션 홀.
    const reverb = ctx.createConvolver();
    reverb.buffer = this._makeReverbIR(2.4, 2.6);
    const reverbWet = ctx.createGain();
    reverbWet.gain.value = 0.34;
    sendHP.connect(reverb);
    reverb.connect(reverbWet);
    reverbWet.connect(this.master);

    // 2) shimmer 딜레이: 피드백 루프에 고역 통과 + 미세 디튠으로 반짝이는 꼬리.
    const delayL = ctx.createDelay(0.6);
    const delayR = ctx.createDelay(0.6);
    delayL.delayTime.value = 0.13;
    delayR.delayTime.value = 0.17; // 좌우 다른 탭 → 스테레오 확산
    const feedback = ctx.createGain();
    feedback.gain.value = 0.36;
    const tone = ctx.createBiquadFilter();
    tone.type = 'highpass';
    tone.frequency.value = 1600;
    const merge = ctx.createChannelMerger(2);
    const shimmerWet = ctx.createGain();
    shimmerWet.gain.value = 0.12;
    sendHP.connect(delayL);
    sendHP.connect(delayR);
    delayL.connect(merge, 0, 0);
    delayR.connect(merge, 0, 1);
    merge.connect(tone);
    tone.connect(feedback);
    feedback.connect(delayL);
    feedback.connect(delayR);
    merge.connect(shimmerWet);
    shimmerWet.connect(this.master);

    // 느린 LFO로 딜레이 타임을 미세하게 흔들어 코러스/shimmer 효과.
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.18;
    lfoGain.gain.value = 0.0016;
    lfo.connect(lfoGain);
    lfoGain.connect(delayL.delayTime);
    lfoGain.connect(delayR.delayTime);
    lfo.start();

    // 외부 SFX 샘플을 백그라운드로 프리로드(첫 렌더/재생 비차단).
    this._preloadSfx();
  }

  // 외부 SFX 파일을 디코드해 캐시. 실패(파일 없음)는 조용히 무시 → 합성 폴백.
  _preloadSfx() {
    if (!this.ctx) return;
    Object.entries(SFX_ASSETS).forEach(([name, url]) => {
      if (this.sfxBuffers.has(name)) return;
      fetch(url)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error('no sfx'))))
        .then((data) => this.ctx.decodeAudioData(data))
        .then((buf) => { this.sfxBuffers.set(name, buf); })
        .catch(() => {});
    });
  }

  // 외부 SFX 샘플 원샷 재생(마스터 에어/컴프/리미터 + 리버브 센드 경유).
  // width>0이면 살짝 디튠된 좌우 복사본을 깔아 두께와 스테레오 폭을 더한다.
  playSample(name, when, { gain = 0.9, send = 0.1, pan = 0, width = 0, rate = 1 } = {}) {
    const buffer = this.sfxBuffers.get(name);
    if (!buffer || !this.ctx || !this.master) return;
    const one = (p, g, r) => {
      const out = this.voiceOut(p, send);
      const src = this.ctx.createBufferSource();
      const gn = this.ctx.createGain();
      src.buffer = buffer;
      src.playbackRate.value = r;
      gn.gain.value = g;
      src.connect(gn);
      gn.connect(out);
      src.start(when);
      this.cleanupOnEnded(src, [src, gn], out);
    };
    one(pan, gain, rate);
    // 스테레오 더블링: 좌우로 벌린 미세 디튠 복사본 → 코러스 두께 + 공간감.
    if (width > 0) {
      one(clamp(pan - 0.55, -1, 1), gain * width, rate * 0.994);
      one(clamp(pan + 0.55, -1, 1), gain * width, rate * 1.006);
    }
  }

  // 샘플을 메인으로 깔고 그 위에 합성 악센트(반짝임/크리스털 링/서브 임팩트)를
  // 규모에 맞춰 얹어 더 풍성하고 입체적으로 들리게 한다.
  playSampleRich(name, now, level, detail) {
    const cfg = SFX_RICH[name] || {};
    const dyn = DYNAMIC_SFX.has(name);
    const lv = Math.max(1, Number(level) || 1);
    const gain = dyn ? Math.min(1.0, 0.72 + (lv - 1) * 0.05) : 0.9;
    const pan = rnd(-0.28, 0.28);
    this.playSample(name, now, { gain, send: cfg.send || 0.12, width: cfg.width || 0, pan: pan * 0.4 });
    // --- 합성 sweetener 레이어(게인 낮게, 리미터가 클리핑 방지) ---
    if (cfg.sparkle) {
      const dens = Math.round(cfg.sparkle * (dyn ? (1 + (lv - 1) * 0.22) : 1));
      this.sparkleTail(now + 0.02, dens, cfg.sparkleAmt || 0.3, pan);
    }
    if (cfg.crystal && lv >= (cfg.crystalMin || 1)) this.crystalRing(now + 0.012, cfg.crystal, pan);
    if (cfg.sub && lv >= (cfg.subMin || 1)) this.subImpact(now, cfg.sub);
  }

  // 절차적 임펄스 응답(IR): 지수 감쇠하는 필터드 노이즈로 만든 스테레오 홀.
  // 초반은 고역이 많고 꼬리로 갈수록 어두워지는 자연스러운 잔향.
  _makeReverbIR(seconds = 2.4, decay = 2.6) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * seconds));
    const ir = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = ir.getChannelData(ch);
      let lp = 0;
      // 짧은 프리딜레이로 공간을 더 넓게 느끼게.
      const preDelay = Math.floor(rate * (ch === 0 ? 0.012 : 0.017));
      for (let i = 0; i < length; i += 1) {
        if (i < preDelay) { data[i] = 0; continue; }
        const t = (i - preDelay) / length;
        const env = Math.pow(1 - t, decay);
        const white = Math.random() * 2 - 1;
        // 1차 로우패스 → 꼬리가 점점 어두워지게(공기 흡수 모사).
        lp = lp * (0.18 + 0.5 * t) + white * (1 - (0.18 + 0.5 * t));
        // 초반 고역 디테일을 위해 노이즈와 필터드 성분을 섞는다.
        data[i] = (white * (1 - t) * 0.55 + lp * 0.85) * env;
      }
    }
    return ir;
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
      // 외부 샘플이 로드돼 있으면 합성 대신 실음원을 풍성하게 재생.
      if (this.sfxBuffers.has(name)) {
        return this.playSampleRich(name, now, level, detail);
      }
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
    // 콤보 단계만큼 음정이 올라가는 반짝이는 아르페지오(밝은 고음역).
    const root = 659.25 * Math.pow(2, Math.min(level, 9) / 12);
    for (let i = 0; i < steps; i += 1) {
      const t = now + 0.02 + i * 0.045;
      this.gemBell(t, root * Math.pow(2, i / 7), 0.3, 0.1 - i * 0.006, pan, 0.42);
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
      node._sendTap = tap;
    }
    return node;
  }

  disconnectNodes(nodes) {
    for (const node of nodes) {
      try { node?.disconnect?.(); } catch {}
    }
  }

  retainVoice(out) {
    if (!out) return;
    out._voiceRefs = (out._voiceRefs || 0) + 1;
  }

  releaseVoice(out) {
    if (!out) return;
    out._voiceRefs = Math.max(0, (out._voiceRefs || 1) - 1);
    if (out._voiceRefs > 0) return;
    this.disconnectNodes([out._sendTap, out]);
    out._sendTap = null;
  }

  cleanupOnEnded(source, nodes, out = null) {
    if (!source) return;
    if (out) this.retainVoice(out);
    source.onended = () => {
      source.onended = null;
      this.disconnectNodes(nodes);
      if (out) this.releaseVoice(out);
    };
  }

  // 비정수배 배음으로 만든 보석/크리스털 종소리.
  gemBell(start, baseFreq, duration, peak, pan = 0, send = 0) {
    if (!this.ctx || !this.master) return;
    const out = this.voiceOut(pan, send);
    GEM_PARTIALS.forEach((ratio, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = i === 0 ? 'sine' : i < 3 ? 'triangle' : 'sine';
      const freq = Math.max(20, baseFreq * ratio * rnd(0.998, 1.002));
      osc.frequency.value = freq;
      // 기음을 약하게(0.45) 시작해 저음 "퍽" 느낌을 줄이고 배음의 영롱함을 살린다.
      const weight = i === 0 ? 0.45 : Math.pow(0.7, i - 1);
      const partialPeak = Math.max(0.0001, peak * weight);
      const partialDur = duration * (1 - i * 0.06);
      // 낮은 음일수록 어택을 부드럽게 → 타악기성 "퍽" 제거.
      const attack = Math.min(0.045, Math.max(0.006, 90 / freq));
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(partialPeak, start + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.06, partialDur));
      osc.connect(gain);
      gain.connect(out);
      osc.start(start);
      osc.stop(start + partialDur + 0.05);
      this.cleanupOnEnded(osc, [osc, gain], out);
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
    let filter = null;
    if (filterFreq > 0) {
      filter = this.ctx.createBiquadFilter();
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
    this.cleanupOnEnded(osc, filter ? [osc, filter, gain] : [osc, gain], out);
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
    this.cleanupOnEnded(osc, [osc, gain], out);
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
    this.cleanupOnEnded(osc, [osc, gain], out);
  }

  // 유리/보석 깨짐: 날카로운 크랙 트랜지언트 + 잘게 흩어지는 파편 짤랑임.
  glassShatter(start, power = 1, pan = 0, color = 'pink') {
    // 1) 초기 크랙 — 아주 짧고 밝은 고역 파열(저음 없음).
    this.glassNoise(start, 0.012, 0.3 * power, 5200, 'highpass', pan, 'white');
    // 2) 쪼개짐 — 짧은 고역 노이즈 바디.
    this.glassNoise(start + 0.004, 0.04 + power * 0.02, 0.1 * power, 3200, 'highpass', -pan * 0.5, 'white');
    // 3) 크리스털 링 — 크랙 직후 고Q 공진으로 울리는 영롱한 "팅"(고급 크리스털 질감).
    this.crystalRing(start + 0.002, power, pan);
    // 4) 파편 짤랑임 — 진짜 "깨지는 소리"의 핵심.
    const shardCount = Math.round(10 + power * 16);
    this.glassShards(start + 0.006, shardCount, 0.14 + power * 0.28, 0.18 * power, pan);
  }

  // 크리스털 공진 링: 짧은 노이즈 임펄스를 여러 고Q 밴드패스로 울려
  // 유리잔을 톡 친 듯한 비정수배 "팅~" 잔향을 만든다.
  crystalRing(start, power = 1, pan = 0) {
    if (!this.ctx || !this.master) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * 0.02));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    // 유리잔 특유의 비정수배 모드 비율.
    const baseFreq = rnd(2400, 3200);
    const modes = [1, 2.76, 5.4, 8.93];
    modes.forEach((ratio, i) => {
      const freq = baseFreq * ratio * rnd(0.99, 1.01);
      const dur = (0.5 - i * 0.09) * (0.7 + power * 0.5);
      const peak = 0.12 * power * Math.pow(0.62, i);
      const out = this.voiceOut(pan + rnd(-0.25, 0.25), 0.6);
      const source = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      source.buffer = buffer;
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = 60 + i * 30; // 매우 높은 Q → 길고 맑은 링
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), start + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.08, dur));
      source.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      source.start(start);
      source.stop(start + dur + 0.05);
      this.cleanupOnEnded(source, [source, filter, gain], out);
    });
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
      this.cleanupOnEnded(source, [source, filter, gain], out);
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
    this.cleanupOnEnded(source, [source, filter, gain], out);
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
    this.cleanupOnEnded(osc, [osc, filter, gain], out);
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
      source.onended = null;
      this.disconnectNodes([source, gain]);
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
