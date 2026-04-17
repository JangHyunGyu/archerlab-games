// 고양이 타워 — 사운드 매니저
// 컨셉: 가죽(dry) 베이스 + 유리(wet) 악센트
// 블록팡 SoundManager 구조 차용, 음색 팔레트는 전면 재설계.
// 전 레이어 Tone.js 합성 (외부 오디오 파일 없음).
//
// 주파수 대역 배치:
//   Sub  40~80Hz   — bass, membrane 저옥타브
//   Low  80~200Hz  — membrane, bass
//   Body 200~800Hz — poly, fm
//   Mid  800~2kHz  — bell, click
//   Hi   2~6kHz    — bell 상행, metal
//   Air  6k+       — noise pink, metal shimmer

(function (global) {
  'use strict';

  class SoundManager {
    constructor() {
      this.enabled = this._loadEnabled();
      this.volume = 1.0;
      this._initialized = false;

      // Synth references — 10종 전부 활용
      this._membrane = null; // 가죽 바운스 (Sub/Low)
      this._bass = null;     // 서브 베이스 (Sub)
      this._click = null;    // 가죽 "톡" (Mid)
      this._bell = null;     // 유리 "딩" (Mid/Hi)
      this._poly = null;     // 코드 (Body)
      this._fm = null;       // 하모닉/팡파레 (Body/Hi)
      this._am = null;       // 트레몰로 꼬리 (Body)
      this._metal = null;    // shimmer 탑 (Air)
      this._noise = null;    // 천 마찰 / 공기 (Air)
      this._sweep = null;    // 필터 스윕 (Body)

      // Effects
      this._reverb = null;
      this._compressor = null;
      this._limiter = null;
      this._dryChannel = null;   // 가죽: 직격
      this._wetChannel = null;   // 유리: 리버브 경로

      this._visibilityHandler = () => {
        if (!document.hidden && this.enabled && this._initialized) {
          this.ensureContext();
        }
      };
      document.addEventListener('visibilitychange', this._visibilityHandler);
    }

    // ── localStorage persistence ──────────────────────────────────
    _loadEnabled() {
      try {
        const raw = localStorage.getItem('cat-tower.sound');
        if (raw === null) return true;
        return raw === '1';
      } catch { return true; }
    }
    _saveEnabled() {
      try { localStorage.setItem('cat-tower.sound', this.enabled ? '1' : '0'); } catch {}
    }

    // ── Initialization ────────────────────────────────────────────
    init() {
      if (this._initialized) return;
      if (typeof Tone === 'undefined') {
        console.warn('[SoundManager] Tone.js not loaded — sound disabled');
        this._initialized = true;
        return;
      }

      try {
        const volDb = 20 * Math.log10(Math.max(0.01, this.volume));
        Tone.Destination.volume.value = volDb;
        Tone.Destination.mute = !this.enabled;

        // ── Effects chain ──
        this._limiter = new Tone.Limiter(-1).toDestination();
        this._compressor = new Tone.Compressor({
          threshold: -18, knee: 24, ratio: 6,
          attack: 0.003, release: 0.12,
        }).connect(this._limiter);

        this._reverb = new Tone.Reverb({
          decay: 2.2, wet: 0.22, preDelay: 0.012,
        }).connect(this._compressor);
        this._reverb.generate();

        this._dryChannel = new Tone.Channel({ volume: 0 }).connect(this._compressor);
        this._wetChannel = new Tone.Channel({ volume: -2 }).connect(this._reverb);

        // ── 가죽 톤 신스 (dry 채널) ──

        // MembraneSynth: 가죽 북 바운스 — 따뜻한 sine, 긴 pitchDecay
        this._membrane = new Tone.MembraneSynth({
          pitchDecay: 0.08,
          octaves: 3.5,
          oscillator: { type: 'sine' },
          envelope: { attack: 0.002, decay: 0.22, sustain: 0, release: 0.12 },
        }).connect(this._dryChannel);
        this._membrane.volume.value = -4;

        // Bass: 서브 베이스 (가죽 무게감)
        this._bass = new Tone.MonoSynth({
          oscillator: { type: 'sine' },
          filter: { type: 'lowpass', frequency: 600, Q: 0.8 },
          envelope: { attack: 0.008, decay: 0.25, sustain: 0.2, release: 0.35 },
          filterEnvelope: {
            attack: 0.008, decay: 0.2, sustain: 0.15, release: 0.25,
            baseFrequency: 60, octaves: 2.2,
          },
        }).connect(this._dryChannel);
        this._bass.volume.value = -8;

        // NoiseSynth: 천/가죽 마찰 (pink/brown)
        this._noise = new Tone.NoiseSynth({
          noise: { type: 'pink' },
          envelope: { attack: 0.002, decay: 0.08, sustain: 0, release: 0.04 },
        }).connect(this._dryChannel);
        this._noise.volume.value = -22;

        // Click: 가죽 "톡" (Mid) — triangle 부드러움
        this._click = new Tone.Synth({
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.0015, decay: 0.02, sustain: 0.04, release: 0.025 },
        }).connect(this._dryChannel);
        this._click.volume.value = -10;

        // ── 유리 톤 신스 (wet 채널) ──

        // Bell: 유리 구슬 "딩" — sine 깨끗
        this._bell = new Tone.Synth({
          oscillator: { type: 'sine' },
          envelope: { attack: 0.001, decay: 0.1, sustain: 0.25, release: 0.5 },
        }).connect(this._wetChannel);
        this._bell.volume.value = -8;

        // PolySynth: 메이저 코드 블룸
        this._poly = new Tone.PolySynth(Tone.Synth, {
          maxPolyphony: 10,
          oscillator: { type: 'sine' },
          envelope: { attack: 0.006, decay: 0.15, sustain: 0.35, release: 0.5 },
        }).connect(this._wetChannel);
        this._poly.volume.value = -10;

        // FMSynth: 하모닉 팡파레 (유리 배음)
        this._fm = new Tone.FMSynth({
          harmonicity: 3,
          modulationIndex: 8,
          oscillator: { type: 'sine' },
          envelope: { attack: 0.004, decay: 0.18, sustain: 0.3, release: 0.3 },
          modulation: { type: 'sine' },
          modulationEnvelope: { attack: 0.006, decay: 0.2, sustain: 0.3, release: 0.25 },
        }).connect(this._wetChannel);
        this._fm.volume.value = -14;

        // AMSynth: 트레몰로 꼬리 (여운)
        this._am = new Tone.AMSynth({
          harmonicity: 2,
          oscillator: { type: 'sine' },
          envelope: { attack: 0.012, decay: 0.25, sustain: 0.3, release: 0.6 },
          modulation: { type: 'sine' },
          modulationEnvelope: { attack: 0.02, decay: 0.3, sustain: 0.3, release: 0.5 },
        }).connect(this._wetChannel);
        this._am.volume.value = -12;

        // MetalSynth: 유리 shimmer 탑
        this._metal = new Tone.MetalSynth({
          frequency: 320,
          envelope: { attack: 0.001, decay: 0.12, release: 0.08 },
          harmonicity: 4.2,
          modulationIndex: 14,
          resonance: 3600,
          octaves: 1.3,
        }).connect(this._wetChannel);
        this._metal.volume.value = -22;

        // Sweep: 필터 스윕 (상승/하강 트랜지션)
        this._sweep = new Tone.MonoSynth({
          oscillator: { type: 'sawtooth' },
          filter: { type: 'lowpass', frequency: 400, rolloff: -24, Q: 2.5 },
          envelope: { attack: 0.008, decay: 0.2, sustain: 0.1, release: 0.2 },
          filterEnvelope: {
            attack: 0.015, decay: 0.25, sustain: 0.1, release: 0.2,
            baseFrequency: 180, octaves: 4.5,
          },
        }).connect(this._wetChannel);
        this._sweep.volume.value = -16;

        this._patchSynths();
        this._initialized = true;
      } catch (e) {
        console.warn('[SoundManager] init 실패:', e.message);
        this._initialized = true;
      }
    }

    _patchSynths() {
      const synths = [this._membrane, this._bass, this._click, this._bell,
                      this._poly, this._fm, this._am, this._metal, this._sweep];
      for (const s of synths) {
        if (!s || !s.triggerAttackRelease) continue;
        const orig = s.triggerAttackRelease.bind(s);
        s.triggerAttackRelease = (...args) => {
          try { return orig(...args); } catch (e) { /* 스케줄 충돌 무시 */ }
        };
      }
      if (this._noise && this._noise.triggerAttackRelease) {
        const origN = this._noise.triggerAttackRelease.bind(this._noise);
        this._noise.triggerAttackRelease = (...args) => {
          try { return origN(...args); } catch (e) { /* */ }
        };
      }
    }

    ensureContext() {
      if (typeof Tone === 'undefined') return;
      Tone.start().catch(() => {});
      if (Tone.context && Tone.context.state === 'suspended') {
        Tone.context.resume().catch(() => {});
      }
      if (!this._initialized) this.init();
    }

    // ── Helpers ─────────────────────────────────────────────────────
    _canPlay() { return this.enabled && this._initialized; }
    _hasTone() { return this._canPlay() && this._membrane !== null; }

    _at(offsetSec, fn) {
      if (offsetSec <= 0.005) {
        try { fn(); } catch (e) {}
      } else {
        setTimeout(() => { try { fn(); } catch (e) {} }, offsetSec * 1000);
      }
    }

    _safeTime(t) { return Math.max(t, Tone.now()); }

    // ±percent 피치 랜덤화 (cents 단위로 환산)
    _jitter(pct) {
      return 1 + (Math.random() * 2 - 1) * pct;
    }

    // 0~maxMs 범위 시간 지연 jitter
    _timeJit(maxMs) {
      return Math.random() * maxMs / 1000;
    }

    // Note → frequency(Hz), 피치 jitter 적용
    _jitNote(note, pct = 0.02) {
      const baseHz = Tone.Frequency(note).toFrequency();
      return baseHz * this._jitter(pct);
    }

    // ═══════════════════════════════════════════════════════════════
    // 이벤트 사운드들
    // ═══════════════════════════════════════════════════════════════

    // ── DROP: 가죽 "툭" 3 레이어 (티어별 피치) ───────────────────
    // 티어 커질수록 낮고 묵직함
    playDrop(tier) {
      if (!this._canPlay()) return;
      this.ensureContext();
      if (!this._hasTone()) return;
      const now = Tone.now();
      const t = Math.max(0, Math.min(9, tier));

      try {
        // 티어에 따라 피치 내림: C3(낮은 큰 고양이) ~ G3(새끼)
        const dropNotes = ['G3', 'F#3', 'F3', 'E3', 'D#3', 'D3', 'C#3', 'C3', 'B2', 'A2'];
        const baseNote = dropNotes[t];
        const freq = this._jitNote(baseNote, 0.025);

        // L1: Membrane 바운스 (Low) — 주역
        this._membrane.pitchDecay = 0.06 + t * 0.008;
        this._membrane.octaves = 3.2;
        this._membrane.envelope.decay = 0.12 + t * 0.015;
        this._membrane.volume.value = -4 - t * 0.2;
        this._membrane.triggerAttackRelease(freq, 0.12, now);

        // L2: Noise pink 천 마찰 (Air) — 어택 꾸밈
        this._at(this._timeJit(8), () => {
          this._noise.noise.type = 'pink';
          this._noise.envelope.attack = 0.001;
          this._noise.envelope.decay = 0.04 + t * 0.004;
          this._noise.volume.value = -26 + t * 0.6;
          this._noise.triggerAttackRelease('32n', this._safeTime(now));
        });

        // L3: Bass sub — 상위 티어만 (무게감)
        if (t >= 3) {
          this._at(this._timeJit(6), () => {
            const subNote = Tone.Frequency(freq / 2, 'hz').toNote();
            this._bass.envelope.attack = 0.005;
            this._bass.envelope.decay = 0.15 + t * 0.01;
            this._bass.envelope.release = 0.2;
            this._bass.volume.value = -14 + t * 0.4;
            this._bass.triggerAttackRelease(subNote, 0.18, this._safeTime(now));
          });
        }
      } catch (e) {}
    }

    // ── MERGE: 가죽 "뿅" + 유리 "딩" 5 레이어 (진화 단계별 음계) ──
    playMerge(newTier) {
      if (!this._canPlay()) return;
      this.ensureContext();
      if (!this._hasTone()) return;
      const now = Tone.now();
      const t = Math.max(0, Math.min(9, newTier));

      try {
        // C major pentatonic 상행 — 티어가 올라갈수록 높은 음
        const mergeNotes = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6', 'A6'];
        const baseNote = mergeNotes[t];
        const freq = this._jitNote(baseNote, 0.015);

        // L1: Membrane 가죽 뿅 (Low)
        this._membrane.pitchDecay = 0.05;
        this._membrane.octaves = 3;
        this._membrane.envelope.decay = 0.1;
        this._membrane.volume.value = -6;
        this._membrane.triggerAttackRelease(this._jitNote('G3', 0.02), 0.08, now);

        // L2: Bell 유리 딩 (Mid/Hi) — 주역
        this._at(0.008 + this._timeJit(4), () => {
          this._bell.envelope.attack = 0.001;
          this._bell.envelope.decay = 0.08;
          this._bell.envelope.sustain = 0.3;
          this._bell.envelope.release = 0.4;
          this._bell.volume.value = -6 - t * 0.2;
          this._bell.triggerAttackRelease(freq, 0.3, this._safeTime(now + 0.008));
        });

        // L3: FM 하모닉 블룸 (Body/Hi)
        this._at(0.02 + this._timeJit(5), () => {
          this._fm.harmonicity.value = 3 + t * 0.2;
          this._fm.modulationIndex.value = 6 + t * 0.8;
          this._fm.volume.value = -16 - t * 0.2;
          this._fm.triggerAttackRelease(freq, 0.22, this._safeTime(now + 0.02));
        });

        // L4: PolySynth 메이저 3화음 (Body) — 진화감
        this._at(0.012, () => {
          const freqFifth = freq * 1.498;    // 완전5도
          const freqThird = freq * 1.26;     // 장3도
          const chord = [
            Tone.Frequency(freq, 'hz').toNote(),
            Tone.Frequency(freqThird, 'hz').toNote(),
            Tone.Frequency(freqFifth, 'hz').toNote(),
          ];
          this._poly.set({ envelope: { attack: 0.004, decay: 0.14, sustain: 0.35, release: 0.45 } });
          this._poly.volume.value = -12 - t * 0.2;
          this._poly.triggerAttackRelease(chord, 0.32, this._safeTime(now + 0.012));
        });

        // L5: Noise pink "파프" (Air) — 공기 질감
        this._at(0.003, () => {
          this._noise.noise.type = 'pink';
          this._noise.envelope.attack = 0.001;
          this._noise.envelope.decay = 0.06;
          this._noise.volume.value = -24;
          this._noise.triggerAttackRelease('16n', this._safeTime(now + 0.003));
        });

        // 상위 티어 보너스: Metal shimmer (Air)
        if (t >= 5) {
          this._at(0.05 + this._timeJit(8), () => {
            this._metal.frequency.value = this._jitNote('E6', 0.03);
            this._metal.volume.value = -28 + t * 0.5;
            this._metal.triggerAttackRelease('E6', 0.1, this._safeTime(now + 0.05));
          });
        }
      } catch (e) {}
    }

    // ── COMBO: 상승 5 레이어 ─────────────────────────────────────
    playCombo(level) {
      if (!this._canPlay()) return;
      this.ensureContext();
      if (!this._hasTone()) return;
      const now = Tone.now();
      const n = Math.max(2, Math.min(8, level));

      try {
        // 콤보 레벨마다 반음씩 상승
        const semitonesUp = n - 2;
        const baseFreq = 523.25 * Math.pow(2, semitonesUp / 12); // C5 기준 상행
        const thirdFreq = baseFreq * 1.26;
        const fifthFreq = baseFreq * 1.498;
        const octaveFreq = baseFreq * 2;

        // L1: Bell 상행 아르페지오 (Mid/Hi)
        const arp = [baseFreq, thirdFreq, fifthFreq, octaveFreq];
        arp.forEach((f, i) => {
          this._at(i * 0.04, () => {
            const note = Tone.Frequency(f * this._jitter(0.01), 'hz').toNote();
            this._bell.envelope.attack = 0.001;
            this._bell.envelope.decay = 0.07;
            this._bell.envelope.sustain = 0.25;
            this._bell.envelope.release = 0.25;
            this._bell.volume.value = -6;
            this._bell.triggerAttackRelease(note, 0.2, this._safeTime(now + i * 0.04));
          });
        });

        // L2: Poly 파워 코드 (Body)
        this._at(0.005, () => {
          const chord = [
            Tone.Frequency(baseFreq, 'hz').toNote(),
            Tone.Frequency(fifthFreq, 'hz').toNote(),
            Tone.Frequency(octaveFreq, 'hz').toNote(),
          ];
          this._poly.set({ envelope: { attack: 0.003, decay: 0.12, sustain: 0.4, release: 0.25 } });
          this._poly.volume.value = -8;
          this._poly.triggerAttackRelease(chord, 0.3, this._safeTime(now));
        });

        // L3: FM 그리트 (Body) — 에너지
        this._at(0.015, () => {
          this._fm.harmonicity.value = 2.5 + n * 0.25;
          this._fm.modulationIndex.value = 5 + n * 1.5;
          this._fm.volume.value = -14 + n * 0.4;
          this._fm.triggerAttackRelease(
            Tone.Frequency(baseFreq, 'hz').toNote(), 0.22, this._safeTime(now + 0.015)
          );
        });

        // L4: AM 트레몰로 (Body) — 진동감 (콤보 3+)
        if (n >= 3) {
          this._at(0.025, () => {
            this._am.harmonicity.value = 2 + n * 0.15;
            this._am.volume.value = -16 + n * 0.5;
            this._am.triggerAttackRelease(
              Tone.Frequency(octaveFreq, 'hz').toNote(), 0.25, this._safeTime(now + 0.025)
            );
          });
        }

        // L5: Sweep 필터 상승 (Body) — 고조감 (콤보 4+)
        if (n >= 4) {
          this._at(0.01, () => {
            this._sweep.filterEnvelope.octaves = 3 + n * 0.3;
            this._sweep.volume.value = -18 + n * 0.5;
            this._sweep.triggerAttackRelease(
              Tone.Frequency(baseFreq / 2, 'hz').toNote(), 0.25, this._safeTime(now + 0.01)
            );
          });
        }
      } catch (e) {}
    }

    // ── FINAL MERGE (사바나 소멸): 7 레이어 피날레 ────────────────
    playFinalMerge() {
      if (!this._canPlay()) return;
      this.ensureContext();
      if (!this._hasTone()) return;
      const now = Tone.now();

      try {
        // L1: Membrane 대형 임팩트
        this._membrane.pitchDecay = 0.1;
        this._membrane.octaves = 5;
        this._membrane.envelope.decay = 0.2;
        this._membrane.volume.value = -2;
        this._membrane.triggerAttackRelease('C2', '8n', now);

        // L2: Bass 서브 하강
        this._at(0.005, () => {
          this._bass.envelope.attack = 0.005;
          this._bass.envelope.decay = 0.3;
          this._bass.envelope.release = 0.4;
          this._bass.volume.value = -6;
          this._bass.triggerAttackRelease('C2', 0.5, this._safeTime(now + 0.005));
        });

        // L3: Bell 상행 스케일 (유리 팡파레)
        const scale = ['C5', 'E5', 'G5', 'C6', 'E6', 'G6'];
        scale.forEach((note, i) => {
          this._at(0.04 + i * 0.05, () => {
            const jitNote = Tone.Frequency(this._jitNote(note, 0.01), 'hz').toNote();
            this._bell.envelope.attack = 0.002;
            this._bell.envelope.decay = 0.09;
            this._bell.envelope.sustain = 0.4;
            this._bell.envelope.release = 0.35;
            this._bell.volume.value = -6;
            this._bell.triggerAttackRelease(jitNote, 0.28, this._safeTime(now + 0.04 + i * 0.05));
          });
        });

        // L4: Poly 대형 메이저 코드
        this._at(0.02, () => {
          this._poly.set({ envelope: { attack: 0.01, decay: 0.3, sustain: 0.45, release: 0.7 } });
          this._poly.volume.value = -8;
          this._poly.triggerAttackRelease(['C5', 'E5', 'G5', 'C6'], 0.8, this._safeTime(now + 0.02));
        });

        // L5: FM 팡파레
        this._at(0.06, () => {
          this._fm.harmonicity.value = 4;
          this._fm.modulationIndex.value = 10;
          this._fm.volume.value = -12;
          this._fm.triggerAttackRelease('G5', 0.5, this._safeTime(now + 0.06));
        });

        // L6: AM 꼬리 여운
        this._at(0.1, () => {
          this._am.harmonicity.value = 2;
          this._am.volume.value = -14;
          this._am.triggerAttackRelease('C6', 0.9, this._safeTime(now + 0.1));
        });

        // L7: Metal shimmer 탑 (Air)
        this._at(0.08, () => {
          this._metal.frequency.value = 880;
          this._metal.volume.value = -24;
          this._metal.triggerAttackRelease('A5', 0.2, this._safeTime(now + 0.08));
        });
      } catch (e) {}
    }

    // ── LEGEND (사바나 최초 달성): 8 레이어 최고조 ───────────────
    playLegend() {
      if (!this._canPlay()) return;
      this.ensureContext();
      if (!this._hasTone()) return;
      const now = Tone.now();

      try {
        // L1: Membrane 거대 임팩트
        this._membrane.pitchDecay = 0.12;
        this._membrane.octaves = 6;
        this._membrane.envelope.decay = 0.25;
        this._membrane.volume.value = 0;
        this._membrane.triggerAttackRelease('B1', '8n', now);

        // L2: Bass 영웅 서브
        this._at(0.01, () => {
          this._bass.envelope.attack = 0.008;
          this._bass.envelope.decay = 0.4;
          this._bass.envelope.release = 0.8;
          this._bass.volume.value = -4;
          this._bass.triggerAttackRelease('C2', 1.0, this._safeTime(now + 0.01));
        });

        // L3: Bell 유포릭 상행 (8개)
        const scale = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6'];
        scale.forEach((note, i) => {
          this._at(0.05 + i * 0.04, () => {
            this._bell.envelope.attack = 0.001;
            this._bell.envelope.decay = 0.1;
            this._bell.envelope.sustain = 0.45;
            this._bell.envelope.release = 0.4;
            this._bell.volume.value = -5;
            this._bell.triggerAttackRelease(
              Tone.Frequency(this._jitNote(note, 0.01), 'hz').toNote(),
              0.35, this._safeTime(now + 0.05 + i * 0.04)
            );
          });
        });

        // L4: Poly 그랜드 코드 (C major7)
        this._at(0.03, () => {
          this._poly.set({ envelope: { attack: 0.012, decay: 0.35, sustain: 0.5, release: 0.9 } });
          this._poly.volume.value = -6;
          this._poly.triggerAttackRelease(['C5', 'E5', 'G5', 'B5', 'C6'], 1.3, this._safeTime(now + 0.03));
        });

        // L5: FM 영웅 팡파레
        this._at(0.08, () => {
          this._fm.harmonicity.value = 5;
          this._fm.modulationIndex.value = 14;
          this._fm.volume.value = -10;
          this._fm.triggerAttackRelease('G5', 0.7, this._safeTime(now + 0.08));
        });
        this._at(0.25, () => {
          this._fm.harmonicity.value = 3;
          this._fm.modulationIndex.value = 8;
          this._fm.volume.value = -12;
          this._fm.triggerAttackRelease('C6', 0.6, this._safeTime(now + 0.25));
        });

        // L6: AM 긴 여운
        this._at(0.12, () => {
          this._am.harmonicity.value = 2.5;
          this._am.volume.value = -12;
          this._am.triggerAttackRelease('E6', 1.2, this._safeTime(now + 0.12));
        });

        // L7: Metal shimmer — 여러 번
        [0.1, 0.28, 0.55].forEach((off) => {
          this._at(off, () => {
            this._metal.frequency.value = this._jitNote('A6', 0.03);
            this._metal.volume.value = -22;
            this._metal.triggerAttackRelease('A6', 0.18, this._safeTime(now + off));
          });
        });

        // L8: Sweep 엔딩 필터 업
        this._at(0.4, () => {
          this._sweep.filterEnvelope.octaves = 5;
          this._sweep.envelope.decay = 0.6;
          this._sweep.envelope.release = 0.4;
          this._sweep.volume.value = -14;
          this._sweep.triggerAttackRelease('C3', 0.6, this._safeTime(now + 0.4));
        });
      } catch (e) {}
    }

    // ── GAME OVER: 하강 마이너 6 레이어 ──────────────────────────
    playGameOver() {
      if (!this._canPlay()) return;
      this.ensureContext();
      if (!this._hasTone()) return;
      const now = Tone.now();

      try {
        // L1: Poly 하강 마이너 진행 5단
        const progression = [
          { notes: ['A4', 'C5', 'E5'], delay: 0 },
          { notes: ['G4', 'Bb4', 'D5'], delay: 0.32 },
          { notes: ['F4', 'Ab4', 'C5'], delay: 0.64 },
          { notes: ['D4', 'F4', 'A4'], delay: 0.96 },
          { notes: ['A3', 'C4', 'E4'], delay: 1.28 },
        ];
        progression.forEach(({ notes, delay }) => {
          this._at(delay, () => {
            this._poly.set({ envelope: { attack: 0.02, decay: 0.28, sustain: 0.32, release: 0.4 } });
            this._poly.volume.value = -10;
            this._poly.triggerAttackRelease(notes, 0.55, this._safeTime(now + delay));
          });
        });

        // L2: Bass 서브 하강
        const bassNotes = ['A1', 'G1', 'F1', 'D1', 'A0'];
        bassNotes.forEach((note, i) => {
          const d = i * 0.32;
          this._at(d, () => {
            this._bass.envelope.attack = 0.03;
            this._bass.envelope.decay = 0.35;
            this._bass.envelope.release = 0.4;
            this._bass.volume.value = -10;
            this._bass.triggerAttackRelease(note, 0.7, this._safeTime(now + d));
          });
        });

        // L3: Membrane 최종 럼블
        this._at(1.5, () => {
          this._membrane.pitchDecay = 0.35;
          this._membrane.octaves = 6;
          this._membrane.envelope.decay = 1.6;
          this._membrane.envelope.release = 0.9;
          this._membrane.volume.value = -4;
          this._membrane.triggerAttackRelease('F0', 2.0, this._safeTime(now + 1.5));
        });

        // L4: FM 다크 드론
        this._at(1.6, () => {
          this._fm.harmonicity.value = 1.5;
          this._fm.modulationIndex.value = 22;
          this._fm.volume.value = -14;
          this._fm.triggerAttackRelease('A0', 1.6, this._safeTime(now + 1.6));
        });

        // L5: AM 짧은 꼬리
        this._at(1.4, () => {
          this._am.harmonicity.value = 1.5;
          this._am.volume.value = -16;
          this._am.triggerAttackRelease('A2', 1.2, this._safeTime(now + 1.4));
        });

        // L6: Noise brown — 긴 잔향
        this._at(1.3, () => {
          this._noise.noise.type = 'brown';
          this._noise.envelope.attack = 0.15;
          this._noise.envelope.decay = 1.4;
          this._noise.volume.value = -20;
          this._noise.triggerAttackRelease(1.8, this._safeTime(now + 1.3));
        });
      } catch (e) {}
    }

    // ── NEW RECORD: 4 레이어 팡파레 (짧고 화려) ────────────────
    playNewRecord() {
      if (!this._canPlay()) return;
      this.ensureContext();
      if (!this._hasTone()) return;
      const now = Tone.now();

      try {
        // L1: Bell 상행
        const up = ['G5', 'C6', 'E6', 'G6'];
        up.forEach((note, i) => {
          this._at(i * 0.06, () => {
            this._bell.envelope.attack = 0.001;
            this._bell.envelope.decay = 0.08;
            this._bell.envelope.sustain = 0.35;
            this._bell.envelope.release = 0.3;
            this._bell.volume.value = -6;
            this._bell.triggerAttackRelease(note, 0.28, this._safeTime(now + i * 0.06));
          });
        });

        // L2: Poly 팡파레 코드
        this._at(0.01, () => {
          this._poly.set({ envelope: { attack: 0.008, decay: 0.2, sustain: 0.4, release: 0.5 } });
          this._poly.volume.value = -8;
          this._poly.triggerAttackRelease(['C5', 'E5', 'G5', 'C6'], 0.7, this._safeTime(now + 0.01));
        });

        // L3: FM shimmer
        this._at(0.15, () => {
          this._fm.harmonicity.value = 3.5;
          this._fm.modulationIndex.value = 7;
          this._fm.volume.value = -12;
          this._fm.triggerAttackRelease('G6', 0.4, this._safeTime(now + 0.15));
        });

        // L4: AM 꼬리
        this._at(0.25, () => {
          this._am.harmonicity.value = 2;
          this._am.volume.value = -14;
          this._am.triggerAttackRelease('E6', 0.6, this._safeTime(now + 0.25));
        });
      } catch (e) {}
    }

    // ── BUTTON: UI 클릭 2 레이어 ────────────────────────────────
    playButton() {
      if (!this._canPlay()) return;
      this.ensureContext();
      if (!this._hasTone()) return;
      const now = Tone.now();

      try {
        // L1: Click 가죽 톡 (dry)
        this._click.oscillator.type = 'triangle';
        this._click.envelope.attack = 0.001;
        this._click.envelope.decay = 0.025;
        this._click.envelope.sustain = 0.04;
        this._click.envelope.release = 0.025;
        this._click.volume.value = -12;
        this._click.triggerAttackRelease(
          Tone.Frequency(this._jitNote('A4', 0.02), 'hz').toNote(), 0.04, now
        );

        // L2: Bell 짧은 ting (wet)
        this._at(0.005, () => {
          this._bell.envelope.attack = 0.001;
          this._bell.envelope.decay = 0.03;
          this._bell.envelope.sustain = 0.12;
          this._bell.envelope.release = 0.08;
          this._bell.volume.value = -20;
          this._bell.triggerAttackRelease('E6', 0.05, this._safeTime(now + 0.005));
        });
      } catch (e) {}
    }

    // ── PAUSE/RESUME: 1 레이어 스윕 ─────────────────────────────
    playPause() {
      if (!this._canPlay()) return;
      this.ensureContext();
      if (!this._hasTone()) return;
      const now = Tone.now();
      try {
        this._sweep.filterEnvelope.octaves = 2.5;
        this._sweep.envelope.decay = 0.15;
        this._sweep.volume.value = -14;
        this._sweep.triggerAttackRelease('E3', 0.2, now);
      } catch (e) {}
    }
    playResume() {
      if (!this._canPlay()) return;
      this.ensureContext();
      if (!this._hasTone()) return;
      const now = Tone.now();
      try {
        this._sweep.filterEnvelope.octaves = 3.5;
        this._sweep.envelope.decay = 0.12;
        this._sweep.volume.value = -14;
        this._sweep.triggerAttackRelease('G3', 0.18, now);
      } catch (e) {}
    }

    // ── DANGER: 위험선 진입 2 레이어 (tick + 긴장 드론) ─────────
    // game.js가 이미 아래에서 throttle로 호출 제어해야 함
    playDanger() {
      if (!this._canPlay()) return;
      this.ensureContext();
      if (!this._hasTone()) return;
      const now = Tone.now();
      try {
        // L1: Bell 반복 티크
        this._bell.envelope.attack = 0.002;
        this._bell.envelope.decay = 0.04;
        this._bell.envelope.sustain = 0.1;
        this._bell.envelope.release = 0.1;
        this._bell.volume.value = -16;
        this._bell.triggerAttackRelease('A5', 0.08, now);

        // L2: AM 긴장 드론
        this._at(0.008, () => {
          this._am.harmonicity.value = 2.5;
          this._am.volume.value = -20;
          this._am.triggerAttackRelease('A3', 0.3, this._safeTime(now + 0.008));
        });
      } catch (e) {}
    }

    // ── Toggle / Destroy ─────────────────────────────────────────
    toggle() {
      this.enabled = !this.enabled;
      if (typeof Tone !== 'undefined') {
        Tone.Destination.mute = !this.enabled;
      }
      this._saveEnabled();
      return this.enabled;
    }

    destroy() {
      if (this._visibilityHandler) {
        document.removeEventListener('visibilitychange', this._visibilityHandler);
      }
      const synths = [this._membrane, this._bass, this._click, this._bell,
                      this._poly, this._fm, this._am, this._metal, this._sweep, this._noise];
      for (const s of synths) { try { s?.dispose?.(); } catch {} }
      for (const node of [this._reverb, this._compressor, this._limiter, this._dryChannel, this._wetChannel]) {
        try { node?.dispose?.(); } catch {}
      }
    }
  }

  global.SoundManager = SoundManager;
})(window);
