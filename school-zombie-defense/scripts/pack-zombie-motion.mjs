// Mechanical sprite import: chroma extraction, uniform resize, cell packing.
// Artwork uses the built-in image tool; see design/zombie-motion-v1.json and nurse-design-v1.json.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [type, source, mode] = process.argv.slice(2);
const walkOnly = mode === '--walk-only';
const sourceColumns = walkOnly ? 2 : 4;
const profiles = {
  runner: { height: 0.923828125, bottom: 0.952 },
  athlete: { height: 0.923828125, bottom: 0.952 },
  nurse: { height: 0.88671875, bottom: 0.953125 },
  charger: { height: 0.8984375, bottom: 0.968 },
  crawler: { height: 0.65655, bottom: 0.795 },
  spider: { height: 0.730469, bottom: 0.785 }
};
if (!profiles[type] || !source) throw new Error('Usage: node pack-zombie-motion.mjs TYPE GENERATED_PNG');
const work = path.join(root, '..', 'tmp', 'zombie-motion-import', type);
fs.mkdirSync(work, { recursive: true });
const magick = (...args) => execFileSync('magick', args.map(String), { maxBuffer: 32 * 1024 * 1024 });
const [width, height] = magick('identify', '-format', '%w %h', source).toString().split(' ').map(Number);
const pixels = magick(source, '-alpha', 'on', '-fuzz', '25%', '-transparent', '#ff00ff', '-depth', 8, 'RGBA:-');
// Remove residual magenta at antialiased edges; keep the dark ink outline.
for (let i = 0; i < pixels.length; i += 4) {
  const excess = Math.min(pixels[i], pixels[i + 2]) - pixels[i + 1];
  if (excess > 50 && pixels[i + 1] < 100) {
    pixels[i] -= excess;
    pixels[i + 2] -= excess;
    pixels[i + 3] = Math.round(pixels[i + 3] * Math.max(0, 1 - excess / 255));
  }
}
const raw = path.join(work, 'keyed.rgba');
const keyed = path.join(work, 'keyed.png');
fs.writeFileSync(raw, pixels);
magick('-size', `${width}x${height}`, '-depth', 8, `RGBA:${raw}`, `PNG32:${keyed}`);
const occupied = Array.from({ length: height }, (_, y) => {
  let count = 0;
  for (let x = 0; x < width; x++) if (pixels[(y * width + x) * 4 + 3] > 32) count++;
  return count > 8;
});
const bands = [];
for (let y = 0; y < height; y++) {
  if (!occupied[y]) continue;
  const top = y;
  let last = y;
  while (++y < height) {
    if (occupied[y]) last = y;
    else if (y - last > 6) break;
  }
  bands.push([top, last + 1]);
}
if (bands.length !== (walkOnly ? 2 : 4)) throw new Error(`Unexpected sprite rows: ${JSON.stringify(bands)}`);
function bounds(row, column) {
  const [top, bottom] = bands[row];
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = top; y < bottom; y++) for (let x = Math.round(column * width / sourceColumns); x < Math.round((column + 1) * width / sourceColumns); x++) {
    if (pixels[(y * width + x) * 4 + 3] <= 8) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (maxX < 0) throw new Error(`Empty frame ${row},${column}`);
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
const walks = [0, 1, 2, 3].map(frame => bounds(Math.floor(frame / sourceColumns), frame % sourceColumns));
const heights = walks.map(b => b.height).sort((a, b) => a - b);
const scale = profiles[type].height * 512 / ((heights[1] + heights[2]) / 2);
const bottom = Math.round(profiles[type].bottom * 512);
const packFrame = (box, name) => {
  const w = Math.round(box.width * scale), h = Math.round(box.height * scale);
  const x = Math.round((512 - w) / 2), y = bottom - h;
  if (x < 2 || y < 2 || x + w > 510 || y + h > 510) throw new Error(`${type} ${name} clips its cell: ${x},${y},${w},${h}`);
  const crop = path.join(work, `${name}-crop.png`), cell = path.join(work, `${name}.png`);
  magick(keyed, '-crop', `${box.width}x${box.height}+${box.x}+${box.y}`, '+repage', '-resize', `${w}x${h}!`, `PNG32:${crop}`);
  magick('-size', '512x512', 'canvas:none', crop, '-geometry', `+${x}+${y}`, '-composite', `PNG32:${cell}`);
  return cell;
};
const cells = walks.map((box, i) => packFrame(box, `walk-${i}`));
const deathCells = walkOnly ? [] : [2, 3].flatMap(row => [0, 1, 2, 3].map(col => packFrame(bounds(row, col), `death-${(row - 2) * 4 + col}`)));
const imageRoot = path.join(root, 'assets', 'images');
for (const [name, frames, rows] of [
  [`zombie-walk-${type}`, Array.from({ length: 4 }, () => cells).flat(), 4],
  [`zombie-death-${type}-sheet`, deathCells, 2]
]) {
  if (!frames.length) continue;
  const png = path.join(imageRoot, `${name}.png`);
  const strips = Array.from({ length: rows }, (_, row) => {
    const strip = path.join(work, `${name}-row-${row}.png`);
    magick(...frames.slice(row * 4, row * 4 + 4), '+append', `PNG32:${strip}`);
    return strip;
  });
  magick(...strips, '-append', `PNG32:${png}`);
  magick(png, '-quality', 88, '-define', 'webp:alpha-quality=100', '-define', 'webp:method=6', path.join(imageRoot, `${name}.webp`));
}
console.log(JSON.stringify({ type, sourceSize: [width, height], bands, scale, bottom, walkFrames: 4, deathFrames: deathCells.length }));
