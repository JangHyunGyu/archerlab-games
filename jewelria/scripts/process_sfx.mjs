// 쥬얼리아 SFX 일괄 가공기
// - 앞/뒤 무음 트림
// - 라우드니스 정규화(-14 LUFS, TP -1dB)
// - 이벤트별 최대 길이 캡(초과 시 부드러운 페이드아웃)
// - 시작/끝 클릭 방지 페이드
// - 스테레오 44.1kHz / 256kbps mp3
// 원본은 _raw/ 로 백업 후 제자리 덮어쓰기.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, renameSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const FFMPEG = require('ffmpeg-static');
const FFPROBE = require('ffprobe-static').path;

const __dirname = dirname(fileURLToPath(import.meta.url));
const SFX_DIR = join(__dirname, '..', 'assets', 'sounds', 'sfx');
const RAW_DIR = join(SFX_DIR, '_raw');

// 이벤트별 [최대 길이(초), 끝 페이드(초)]
const CAPS = {
  swap:     [0.35, 0.04],
  invalid:  [0.50, 0.05],
  match:    [0.70, 0.06],
  combo:    [1.10, 0.10],
  special:  [1.60, 0.14],
  cascade:  [0.70, 0.08],
  clear:    [2.40, 0.20],
  fail:     [1.80, 0.18],
  button:   [0.25, 0.03],
};

function probe(file) {
  const out = execFileSync(FFPROBE, [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=channels,sample_rate',
    '-of', 'default=noprint_wrappers=1:nokey=1', file,
  ]).toString().trim().split(/\r?\n/);
  // 순서: sample_rate, channels, duration (스트림 먼저, 포맷 나중)
  return out;
}

function durationOf(file) {
  const out = execFileSync(FFPROBE, [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', file,
  ]).toString().trim();
  return parseFloat(out);
}

if (!existsSync(RAW_DIR)) mkdirSync(RAW_DIR, { recursive: true });

const names = Object.keys(CAPS);
const report = [];

for (const name of names) {
  const src = join(SFX_DIR, `${name}.mp3`);
  if (!existsSync(src)) { report.push(`${name}: (파일 없음 — 건너뜀)`); continue; }

  // 원본 백업(최초 1회만)
  const raw = join(RAW_DIR, `${name}.mp3`);
  if (!existsSync(raw)) copyFileSync(src, raw);

  const before = durationOf(raw);
  const [cap, fade] = CAPS[name];

  // 1단계: 무음 트림 + 정규화 + 스테레오 (캡 적용 전 길이 측정용)
  const tmp1 = join(SFX_DIR, `_tmp1_${name}.wav`);
  execFileSync(FFMPEG, [
    '-hide_banner', '-y', '-i', raw,
    '-af', [
      'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02:detection=peak',
      'areverse',
      'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03:detection=peak',
      'areverse',
      'afade=t=in:st=0:d=0.005',
      'aresample=44100',
      'aformat=channel_layouts=stereo',
      'loudnorm=I=-14:TP=-1:LRA=11',
    ].join(','),
    '-ar', '44100', '-ac', '2', tmp1,
  ], { stdio: 'pipe' });

  const trimmed = durationOf(tmp1);
  const finalLen = Math.min(trimmed, cap);

  // 2단계: 길이 캡 + 끝 페이드아웃 → 최종 mp3
  const tmp2 = join(SFX_DIR, `_tmp2_${name}.mp3`);
  const fadeStart = Math.max(0, finalLen - fade);
  execFileSync(FFMPEG, [
    '-hide_banner', '-y', '-i', tmp1,
    '-af', [
      `atrim=0:${finalLen.toFixed(3)}`,
      `afade=t=out:st=${fadeStart.toFixed(3)}:d=${fade.toFixed(3)}`,
    ].join(','),
    '-c:a', 'libmp3lame', '-b:a', '256k', '-ar', '44100', '-ac', '2', tmp2,
  ], { stdio: 'pipe' });

  rmSync(tmp1, { force: true });
  renameSync(tmp2, src); // 제자리 덮어쓰기

  const after = durationOf(src);
  report.push(`${name}: ${before.toFixed(2)}s → ${after.toFixed(2)}s` + (trimmed > cap ? `  (캡 ${cap}s 적용)` : '  (무음만 트림)'));
}

console.log('=== SFX 가공 완료 ===');
report.forEach((r) => console.log(' - ' + r));
