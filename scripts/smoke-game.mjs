import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gameId = process.argv[2];
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/games.json'), 'utf8'));
const game = config.games.find((item) => item.id === gameId);

if (!game) {
  console.error(`Unknown game: ${gameId || '(missing)'}`);
  process.exit(2);
}

const entryPath = path.join(root, game.entry);
if (!fs.existsSync(entryPath)) {
  console.error(`${game.id}: missing entry ${game.entry}`);
  process.exit(1);
}

const html = fs.readFileSync(entryPath, 'utf8');
const refs = [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
const missing = [];
for (const ref of refs) {
  if (/^(?:[a-z]+:|\/\/|#)/i.test(ref)) continue;
  const clean = ref.split(/[?#]/, 1)[0];
  if (!clean || clean.endsWith('/')) continue;
  const target = clean.startsWith('/')
    ? path.join(root, clean.replace(/^\/+/, ''))
    : path.resolve(path.dirname(entryPath), clean);
  if (!fs.existsSync(target)) missing.push(ref);
}

if (missing.length) {
  console.error(`${game.id}: ${missing.length} missing local reference(s)`);
  missing.forEach((ref) => console.error(`  - ${ref}`));
  process.exit(1);
}

console.log(`✓ ${game.id}: entry and ${refs.length} HTML references verified`);
