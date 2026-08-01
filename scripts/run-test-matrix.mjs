import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/games.json'), 'utf8'));
const selected = process.argv.find((arg) => arg.startsWith('--game='))?.slice('--game='.length);
const games = selected ? config.games.filter((game) => game.id === selected) : config.games;

if (!games.length) {
  console.error(`Unknown game: ${selected}`);
  process.exit(2);
}

for (const game of games) {
  console.log(`\n=== ${game.id} ===`);
  const commands = [`node scripts/smoke-game.mjs ${game.id}`, ...game.tests];
  for (const command of commands) {
    console.log(`> ${command}`);
    const result = spawnSync(command, { cwd: root, shell: true, stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}

console.log(`\n✓ ${games.length} game test target(s) passed`);
