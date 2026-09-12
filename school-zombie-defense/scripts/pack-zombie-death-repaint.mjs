// Mechanical import of a repaint of the established collapse poses.
// Artwork comes from image_gen. This script only keys, measures, resizes and packs.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [type, source] = process.argv.slice(2);
const baseline = '46c0b9bd';
const variant = /^normal-([1-4])$/.exec(type)?.[1];
const kind = variant ? 'normal' : type;
const profiles = {
  normal: { count: 12, columns: 4, oldSize: 1.04, size: 1.35 },
  teacher: { count: 4, columns: 2, oldSize: 1.11, size: 1.35, scales: [1, .94, .89, 1.23] },
  guard: { count: 4, columns: 2, oldSize: 1.1, size: 1.35, scales: [.88, .90, 1, 1.18] },
  janitor: { count: 4, columns: 2, oldSize: 1.27, size: 1.5, scales: [.82, .80, .93, 1.17] },
  athlete: { count: 8, columns: 4, oldSize: 1, size: 1.35, scales: [1, 1, 1, 1.02, 1.02, 1.06, 1.10, 1.10] }
};
const profile = profiles[kind];
if (!profile || !source) throw new Error('Usage: node pack-zombie-death-repaint.mjs TYPE GENERATED_PNG');
const work = path.join(root, '..', 'tmp', 'death-repaint-import', type);
fs.mkdirSync(work, { recursive: true });
const magick = (...args) => execFileSync('magick', args.map(String), { maxBuffer: 40 * 1024 * 1024 });
const imageRoot = path.join(root, 'assets', 'images');
const name = `zombie-death-${variant ? `normal-variant-${variant}` : kind}-sheet`;
function original(asset) {
  const file = path.join(work, `original-${asset}.png`);
  fs.writeFileSync(file, execFileSync('git', ['show', `${baseline}:school-zombie-defense/assets/images/${asset}.png`], { cwd: root, maxBuffer: 40 * 1024 * 1024 }));
  return file;
}
function read(file, key = false) {
  const [width, height] = magick('identify', '-format', '%w %h', file).toString().split(' ').map(Number);
  const pixels = magick(file, ...(key ? ['-alpha', 'on', '-fuzz', '25%', '-transparent', '#ff00ff'] : []), '-depth', 8, 'RGBA:-');
  if (key) for (let i = 0; i < pixels.length; i += 4) {
    const excess = Math.min(pixels[i], pixels[i + 2]) - pixels[i + 1];
    if (excess > 50 && pixels[i + 1] < 100) {
      pixels[i] -= excess; pixels[i + 2] -= excess;
      pixels[i + 3] = Math.round(pixels[i + 3] * Math.max(0, 1 - excess / 255));
    }
  }
  return { width, height, pixels };
}
function measure(image, x, y, width, height) {
  let minX = image.width, minY = image.height, maxX = -1, maxY = -1, area = 0;
  for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) {
    const a = image.pixels[(py * image.width + px) * 4 + 3];
    if (a <= 8) continue;
    minX = Math.min(minX, px); minY = Math.min(minY, py);
    maxX = Math.max(maxX, px); maxY = Math.max(maxY, py); area += a / 255;
  }
  if (!area) throw new Error(`Empty frame at ${x},${y}`);
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, area };
}
const repaint = read(source, true), legacy = read(original(name));
const oldWalk = read(original(`zombie-walk-${kind}`));
const newWalk = read(path.join(imageRoot, `zombie-walk-${kind}.png`));
const row = variant ? Number(variant) - 1 : 0;
const walkArea = image => {
  const w = image.width / 4, h = image.height / 4;
  return [0, 1, 2, 3].map(i => measure(image, i * w, row * h, w, h).area / (w * h)).reduce((a, b) => a + b) / 4;
};
const walkRatio = walkArea(newWalk) / walkArea(oldWalk);
const raw = path.join(work, 'keyed.rgba'), keyed = path.join(work, 'keyed.png');
fs.writeFileSync(raw, repaint.pixels);
magick('-size', `${repaint.width}x${repaint.height}`, '-depth', 8, `RGBA:${raw}`, `PNG32:${keyed}`);
const rows = profile.count / profile.columns;
const cells = [], measurements = [];
for (let i = 0; i < profile.count; i++) {
  const sx = Math.round(i % profile.columns * repaint.width / profile.columns);
  const sy = Math.round(Math.floor(i / profile.columns) * repaint.height / rows);
  const sw = Math.round((i % profile.columns + 1) * repaint.width / profile.columns) - sx;
  const sh = Math.round((Math.floor(i / profile.columns) + 1) * repaint.height / rows) - sy;
  const box = measure(repaint, sx, sy, sw, sh);
  const old = measure(legacy, i % 4 * 512, Math.floor(i / 4) * 512, 512, 512);
  // Preserve the original pose's relative coverage, with its already-reviewed
  // anatomy corrections baked into the PNG. Compare head/limbs visually too;
  // coverage alone cannot establish anatomical continuity.
  const scale = Math.sqrt(old.area * walkRatio / box.area) * profile.oldSize * (profile.scales?.[i] || 1) / profile.size;
  const w = Math.round(box.width * scale), h = Math.round(box.height * scale);
  if (w > 508 || h > 508) throw new Error(`${type} frame ${i} needs a larger atlas size: ${w}x${h}`);
  const cx = old.x % 512 + old.width / 2, cy = old.y % 512 + old.height / 2;
  const x = Math.round(Math.max(2, Math.min(510 - w, cx - w / 2)));
  const y = Math.round(Math.max(2, Math.min(510 - h, cy - h / 2)));
  const crop = path.join(work, `crop-${i}.png`), cell = path.join(work, `frame-${i}.png`);
  magick(keyed, '-crop', `${box.width}x${box.height}+${box.x}+${box.y}`, '+repage', '-resize', `${w}x${h}!`, `PNG32:${crop}`);
  magick('-size', '512x512', 'canvas:none', crop, '-geometry', `+${x}+${y}`, '-composite', `PNG32:${cell}`);
  cells.push(cell); measurements.push({ frame: i, width: w, height: h, scale });
}
const strips = [];
for (let i = 0; i < cells.length; i += 4) {
  const strip = path.join(work, `row-${i / 4}.png`);
  magick(...cells.slice(i, i + 4), '+append', `PNG32:${strip}`); strips.push(strip);
}
const png = path.join(imageRoot, `${name}.png`);
magick(...strips, '-append', `PNG32:${png}`);
magick(png, '-quality', 88, '-define', 'webp:alpha-quality=100', '-define', 'webp:method=6', path.join(imageRoot, `${name}.webp`));
console.log(JSON.stringify({ type, baseline, deathSize: profile.size, walkRatio, measurements }));
