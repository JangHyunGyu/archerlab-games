import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, 'asset-manifest.json');
const extensions = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif', '.svg', '.mp3', '.wav', '.ogg', '.m4a', '.wasm']);
const ignored = new Set(['.git', 'node_modules', 'tmp', 'test-results', 'playwright-report', '.wrangler']);

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, files);
    else if (extensions.has(path.extname(entry.name).toLowerCase())) files.push(absolute);
  }
  return files;
}

const assets = walk(root).sort((a, b) => a.localeCompare(b)).map((absolute) => {
  const data = fs.readFileSync(absolute);
  return {
    path: path.relative(root, absolute).replaceAll('\\', '/'),
    bytes: data.length,
    sha256: crypto.createHash('sha256').update(data).digest('hex')
  };
});
const manifest = `${JSON.stringify({ version: 1, algorithm: 'sha256', assets }, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (current !== manifest) {
    console.error('asset-manifest.json is stale; run npm run assets:build');
    process.exit(1);
  }
  console.log(`✓ asset manifest verified (${assets.length} files, no transcoding)`);
} else {
  fs.writeFileSync(outputPath, manifest);
  console.log(`✓ asset manifest generated (${assets.length} files, no transcoding)`);
}
