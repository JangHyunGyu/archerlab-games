import { cpSync, readdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const source = fileURLToPath(new URL('../dist/', import.meta.url));
const destination = fileURLToPath(new URL('../../water-sort/', import.meta.url));
// Only the dedicated generated bundle directory is replaced. Source and public assets stay intact.
const assets = path.resolve(destination, 'assets');
if (path.dirname(assets) !== path.resolve(destination) || path.basename(assets) !== 'assets') throw new Error('Unexpected asset target');
rmSync(assets, { recursive: true, force: true });
for (const name of readdirSync(source)) cpSync(path.join(source, name), path.join(destination, name), { recursive: true });
const entry = path.join(destination, 'index.html');
writeFileSync(entry, readFileSync(entry, 'utf8').replace(/\r\n?/g, '\n'));
