import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SAMPLE_RATE = 44100;
const TEMP_DIR = join(ROOT, "assets", "audio", ".generated-wav-temp");
const SFX_DIR = join(ROOT, "assets", "audio", "sfx");
const STINGER_DIR = join(ROOT, "assets", "audio", "music", "stingers");

mkdirSync(SFX_DIR, { recursive: true });
mkdirSync(STINGER_DIR, { recursive: true });
mkdirSync(TEMP_DIR, { recursive: true });

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeBuffer(seconds) {
  const frames = Math.max(1, Math.ceil(seconds * SAMPLE_RATE));
  return {
    left: new Float32Array(frames),
    right: new Float32Array(frames),
  };
}

function envelope(t, duration, attack = 0.005, release = 0.06) {
  const a = attack <= 0 ? 1 : clamp(t / attack, 0, 1);
  const r = release <= 0 ? 1 : clamp((duration - t) / release, 0, 1);
  return Math.sin(Math.min(a, r) * Math.PI * 0.5);
}

function addTone(buffer, opts) {
  const {
    start = 0,
    duration = 0.2,
    from = 440,
    to = from,
    amp = 0.4,
    attack = 0.005,
    release = 0.08,
    pan = 0,
    wave = "sine",
  } = opts;
  const begin = Math.max(0, Math.floor(start * SAMPLE_RATE));
  const end = Math.min(buffer.left.length, Math.floor((start + duration) * SAMPLE_RATE));
  let phase = 0;
  const panL = Math.cos((pan + 1) * Math.PI * 0.25);
  const panR = Math.sin((pan + 1) * Math.PI * 0.25);
  for (let i = begin; i < end; i += 1) {
    const local = (i - begin) / SAMPLE_RATE;
    const p = clamp(local / duration, 0, 1);
    const freq = from + (to - from) * p;
    phase += (Math.PI * 2 * freq) / SAMPLE_RATE;
    const raw = wave === "triangle"
      ? (2 / Math.PI) * Math.asin(Math.sin(phase))
      : wave === "square"
        ? Math.sign(Math.sin(phase))
        : Math.sin(phase);
    const v = raw * amp * envelope(local, duration, attack, release);
    buffer.left[i] += v * panL;
    buffer.right[i] += v * panR;
  }
}

function addNoise(buffer, opts = {}) {
  const {
    start = 0,
    duration = 0.15,
    amp = 0.25,
    attack = 0.002,
    release = 0.06,
    pan = 0,
    color = 0.82,
  } = opts;
  const begin = Math.max(0, Math.floor(start * SAMPLE_RATE));
  const end = Math.min(buffer.left.length, Math.floor((start + duration) * SAMPLE_RATE));
  const panL = Math.cos((pan + 1) * Math.PI * 0.25);
  const panR = Math.sin((pan + 1) * Math.PI * 0.25);
  let last = 0;
  for (let i = begin; i < end; i += 1) {
    const local = (i - begin) / SAMPLE_RATE;
    const white = Math.random() * 2 - 1;
    last = last * color + white * (1 - color);
    const v = (white * 0.45 + last * 0.55) * amp * envelope(local, duration, attack, release);
    buffer.left[i] += v * panL;
    buffer.right[i] += v * panR;
  }
}

function addChord(buffer, start, notes, duration, amp, spread = 0.36) {
  notes.forEach((freq, index) => {
    const pan = notes.length === 1 ? 0 : -spread + (spread * 2 * index) / (notes.length - 1);
    addTone(buffer, {
      start,
      duration,
      from: freq,
      to: freq * 1.006,
      amp,
      attack: 0.035,
      release: Math.min(0.9, duration * 0.55),
      pan,
      wave: "sine",
    });
  });
}

function normalize(buffer, peak = 0.92) {
  let max = 0;
  for (let i = 0; i < buffer.left.length; i += 1) {
    max = Math.max(max, Math.abs(buffer.left[i]), Math.abs(buffer.right[i]));
  }
  const gain = max > peak ? peak / max : 1;
  for (let i = 0; i < buffer.left.length; i += 1) {
    buffer.left[i] = clamp(buffer.left[i] * gain, -1, 1);
    buffer.right[i] = clamp(buffer.right[i] * gain, -1, 1);
  }
}

function writeWav(path, buffer) {
  normalize(buffer);
  const frames = buffer.left.length;
  const bytes = Buffer.alloc(44 + frames * 4);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + frames * 4, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(SAMPLE_RATE, 24);
  bytes.writeUInt32LE(SAMPLE_RATE * 4, 28);
  bytes.writeUInt16LE(4, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i += 1) {
    bytes.writeInt16LE(Math.round(clamp(buffer.left[i], -1, 1) * 32767), 44 + i * 4);
    bytes.writeInt16LE(Math.round(clamp(buffer.right[i], -1, 1) * 32767), 46 + i * 4);
  }
  writeFileSync(path, bytes);
}

function exportMp3(relativePath, seconds, painter) {
  const target = join(ROOT, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  const wav = join(TEMP_DIR, relativePath.replace(/[\\/]/g, "__").replace(/\.mp3$/i, ".wav"));
  const buffer = makeBuffer(seconds);
  painter(buffer);
  writeWav(wav, buffer);
  const result = spawnSync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    wav,
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "192k",
    target,
  ], { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${relativePath}`);
  }
}

const sfx = [
  ["assets/audio/sfx/piece-move-01.mp3", 0.12, (b) => {
    addTone(b, { duration: 0.095, from: 620, to: 880, amp: 0.24, release: 0.045, pan: -0.12 });
    addNoise(b, { duration: 0.045, amp: 0.075, release: 0.025 });
  }],
  ["assets/audio/sfx/piece-move-02.mp3", 0.12, (b) => {
    addTone(b, { duration: 0.095, from: 780, to: 560, amp: 0.22, release: 0.045, pan: 0.14 });
    addNoise(b, { duration: 0.04, amp: 0.065, release: 0.02 });
  }],
  ["assets/audio/sfx/piece-rotate-01.mp3", 0.18, (b) => {
    addTone(b, { duration: 0.15, from: 420, to: 1120, amp: 0.25, release: 0.06, pan: 0.1 });
    addTone(b, { start: 0.03, duration: 0.11, from: 840, to: 1280, amp: 0.12, release: 0.04, pan: -0.18 });
  }],
  ["assets/audio/sfx/piece-rotate-02.mp3", 0.18, (b) => {
    addTone(b, { duration: 0.15, from: 980, to: 460, amp: 0.22, release: 0.055, pan: -0.08 });
    addTone(b, { start: 0.025, duration: 0.12, from: 1320, to: 760, amp: 0.11, release: 0.04, pan: 0.2 });
  }],
  ["assets/audio/sfx/piece-soft-drop-tick.mp3", 0.08, (b) => {
    addTone(b, { duration: 0.055, from: 210, to: 180, amp: 0.16, release: 0.025, wave: "triangle" });
    addNoise(b, { duration: 0.035, amp: 0.08, release: 0.018, color: 0.65 });
  }],
  ["assets/audio/sfx/piece-hold.mp3", 0.22, (b) => {
    addTone(b, { duration: 0.19, from: 720, to: 260, amp: 0.24, attack: 0.01, release: 0.08, pan: -0.12 });
    addTone(b, { start: 0.04, duration: 0.13, from: 1180, to: 620, amp: 0.12, release: 0.06, pan: 0.24 });
  }],
  ["assets/audio/sfx/lumen-charge-small.mp3", 0.28, (b) => {
    addTone(b, { duration: 0.24, from: 520, to: 980, amp: 0.18, attack: 0.012, release: 0.09 });
    addTone(b, { start: 0.08, duration: 0.16, from: 1040, to: 1560, amp: 0.1, release: 0.08, pan: 0.2 });
  }],
  ["assets/audio/sfx/lumen-charge-full.mp3", 1.05, (b) => {
    addTone(b, { duration: 0.92, from: 260, to: 1040, amp: 0.2, attack: 0.04, release: 0.24 });
    addChord(b, 0.38, [523.25, 783.99, 1046.5], 0.55, 0.15);
    addNoise(b, { start: 0.52, duration: 0.38, amp: 0.08, attack: 0.05, release: 0.18 });
  }],
  ["assets/audio/sfx/lumen-zone-start.mp3", 1.35, (b) => {
    addTone(b, { duration: 1.0, from: 130.81, to: 261.63, amp: 0.24, attack: 0.02, release: 0.34, wave: "triangle" });
    addChord(b, 0.42, [523.25, 659.25, 783.99, 1046.5], 0.78, 0.17);
    addNoise(b, { start: 0.15, duration: 0.9, amp: 0.12, attack: 0.15, release: 0.3 });
  }],
  ["assets/audio/sfx/lumen-zone-line-bank.mp3", 0.36, (b) => {
    addTone(b, { duration: 0.24, from: 740, to: 1360, amp: 0.18, release: 0.1 });
    addTone(b, { start: 0.08, duration: 0.18, from: 1110, to: 1660, amp: 0.12, release: 0.08, pan: 0.16 });
  }],
  ["assets/audio/sfx/lumen-zone-burst.mp3", 1.65, (b) => {
    addTone(b, { duration: 0.28, from: 98, to: 64, amp: 0.35, release: 0.18, wave: "triangle" });
    addChord(b, 0.18, [261.63, 392, 523.25, 659.25, 783.99], 1.08, 0.16);
    addNoise(b, { start: 0.05, duration: 1.2, amp: 0.18, attack: 0.02, release: 0.55, color: 0.78 });
    addTone(b, { start: 0.66, duration: 0.5, from: 1568, to: 2489, amp: 0.08, attack: 0.02, release: 0.26, pan: -0.22 });
  }],
  ["assets/audio/sfx/lumen-zone-loop.mp3", 8.0, (b) => {
    for (let i = 0; i < 32; i += 1) {
      const start = i * 0.25;
      addTone(b, { start, duration: 0.18, from: 523.25 + (i % 4) * 65, to: 540 + (i % 4) * 75, amp: 0.025, release: 0.11, pan: Math.sin(i) * 0.48 });
    }
    addChord(b, 0, [130.81, 196, 261.63], 7.9, 0.06, 0.5);
    addNoise(b, { duration: 7.95, amp: 0.035, attack: 0.8, release: 0.8, color: 0.94 });
  }],
  ["assets/audio/sfx/ui-click.mp3", 0.1, (b) => {
    addTone(b, { duration: 0.07, from: 900, to: 1260, amp: 0.18, release: 0.03 });
  }],
  ["assets/audio/sfx/ui-start.mp3", 0.52, (b) => {
    addTone(b, { duration: 0.22, from: 392, to: 784, amp: 0.18, release: 0.08 });
    addChord(b, 0.16, [523.25, 783.99, 1046.5], 0.28, 0.13);
  }],
  ["assets/audio/sfx/ui-back.mp3", 0.18, (b) => {
    addTone(b, { duration: 0.14, from: 620, to: 330, amp: 0.16, release: 0.06 });
  }],
  ["assets/audio/sfx/ui-pause.mp3", 0.22, (b) => {
    addTone(b, { duration: 0.14, from: 440, to: 330, amp: 0.14, release: 0.08, wave: "triangle" });
    addTone(b, { start: 0.04, duration: 0.12, from: 554.37, to: 415.3, amp: 0.12, release: 0.06 });
  }],
  ["assets/audio/sfx/ui-resume.mp3", 0.22, (b) => {
    addTone(b, { duration: 0.14, from: 330, to: 440, amp: 0.14, release: 0.08, wave: "triangle" });
    addTone(b, { start: 0.04, duration: 0.12, from: 415.3, to: 554.37, amp: 0.12, release: 0.06 });
  }],
  ["assets/audio/sfx/ui-submit.mp3", 0.42, (b) => {
    addTone(b, { duration: 0.14, from: 523.25, to: 659.25, amp: 0.14, release: 0.06 });
    addTone(b, { start: 0.12, duration: 0.18, from: 659.25, to: 987.77, amp: 0.13, release: 0.08 });
  }],
  ["assets/audio/sfx/ui-ranking-open.mp3", 0.48, (b) => {
    addTone(b, { duration: 0.16, from: 392, to: 587.33, amp: 0.12, release: 0.06, pan: -0.2 });
    addTone(b, { start: 0.12, duration: 0.18, from: 587.33, to: 880, amp: 0.11, release: 0.08, pan: 0.2 });
    addNoise(b, { start: 0.08, duration: 0.24, amp: 0.04, release: 0.12 });
  }],
  ["assets/audio/sfx/ui-error.mp3", 0.34, (b) => {
    addTone(b, { duration: 0.14, from: 190, to: 170, amp: 0.18, release: 0.06, wave: "triangle" });
    addTone(b, { start: 0.13, duration: 0.16, from: 160, to: 125, amp: 0.16, release: 0.08, wave: "triangle" });
  }],
  ["assets/audio/sfx/game-over.mp3", 2.2, (b) => {
    addChord(b, 0, [392, 466.16, 587.33], 0.9, 0.13);
    addChord(b, 0.62, [261.63, 311.13, 392], 1.25, 0.12);
    addTone(b, { start: 0.2, duration: 1.7, from: 110, to: 55, amp: 0.18, release: 0.4, wave: "triangle" });
  }],
];

const stageStingers = [
  ["assets/audio/music/stingers/stage-02-enter.mp3", [293.66, 440, 587.33, 880], 1.7],
  ["assets/audio/music/stingers/stage-03-enter.mp3", [349.23, 523.25, 698.46, 1046.5], 1.8],
  ["assets/audio/music/stingers/stage-04-enter.mp3", [246.94, 369.99, 493.88, 739.99], 1.9],
  ["assets/audio/music/stingers/stage-05-enter.mp3", [261.63, 392, 523.25, 783.99, 1046.5], 2.2],
  ["assets/audio/music/stingers/zone-ready.mp3", [523.25, 783.99, 1174.66], 1.1],
  ["assets/audio/music/stingers/zone-start.mp3", [261.63, 392, 523.25, 783.99], 1.45],
  ["assets/audio/music/stingers/zone-end-success.mp3", [261.63, 392, 523.25, 659.25, 783.99], 2.0],
  ["assets/audio/music/stingers/zone-end-empty.mp3", [196, 246.94, 293.66], 1.15],
  ["assets/audio/music/stingers/game-over.mp3", [196, 233.08, 293.66], 2.2],
];

sfx.forEach(([path, seconds, painter]) => exportMp3(path, seconds, painter));

stageStingers.forEach(([path, notes, seconds], index) => {
  exportMp3(path, seconds, (b) => {
    addTone(b, { duration: seconds * 0.72, from: notes[0] / 2, to: notes[0], amp: 0.16, attack: 0.02, release: seconds * 0.22, wave: "triangle" });
    addChord(b, seconds * 0.18, notes, seconds * 0.62, 0.12 + Math.min(0.05, index * 0.005));
    addNoise(b, { start: seconds * 0.1, duration: seconds * 0.76, amp: 0.07, attack: seconds * 0.14, release: seconds * 0.25, color: 0.88 });
    if (notes.length >= 4) {
      addTone(b, { start: seconds * 0.55, duration: seconds * 0.3, from: notes.at(-1), to: notes.at(-1) * 1.5, amp: 0.06, release: seconds * 0.18, pan: 0.18 });
    }
  });
});

rmSync(TEMP_DIR, { recursive: true, force: true });
console.log(`Generated ${sfx.length + stageStingers.length} LUMEN SHIFT audio assets.`);
