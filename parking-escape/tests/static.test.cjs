"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "css", "style.css"), "utf8");
const main = fs.readFileSync(path.join(root, "js", "main.js"), "utf8");

const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), match => match[1]);
assert.equal(new Set(ids).size, ids.length, "HTML ids must be unique");

const domIds = Array.from(main.matchAll(/\$\("([^"]+)"\)/g), match => match[1]);
for (const id of domIds) {
  assert.ok(ids.includes(id), `main.js references missing #${id}`);
}
assert.ok(ids.includes("par-label"), "HUD must expose the verified minimum move count");
assert.ok(!ids.includes("left-label"), "the static vehicle count HUD must stay removed");
const shellMarkup = html.match(/<main id="game-shell">([\s\S]*?)<\/main>/)?.[1] || "";
assert.ok(shellMarkup.includes('class="archerlab-link"'), "global link must share the modal stacking context");
assert.match(html, /id="complete-modal"[^>]*tabindex="-1"/);
assert.match(html, /id="rank-modal"[^>]*tabindex="-1"/);
assert.match(main, /element\.inert = true/);
assert.match(main, /handleDialogKeydown/);
assert.match(html, /id="best-moves-label">30초\+<\/b>/);
assert.match(css, /menu-bg-mobile-v2\.webp/);
assert.match(main, /ensureGameTextures\(\)/);
assert.match(main, /Lv \$\{this\.bestLevel\} 계속하기/);
assert.match(main, /Math\.ceil\(18 \+ parMoves \* 1\.5\)/);
assert.match(main, /rankLevel:\s*isFinalLevel \? MAX_LEVEL \+ 1 : clearedLevel/);
assert.match(main, /displayLevel:\s*this\.level,[\s\S]*?allClear:\s*false/);
assert.match(main, /if \(!continuesRun\) this\.startRankSession\(\)/);

const scripts = Array.from(html.matchAll(/<script[^>]+src="([^"]+)"/g), match => match[1]);
const catalogIndex = scripts.findIndex(src => src.includes("PuzzleCatalog.js"));
const mainIndex = scripts.findIndex(src => src.includes("main.js"));
assert.ok(catalogIndex >= 0 && mainIndex > catalogIndex, "PuzzleCatalog.js must load before main.js");

const references = [];
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  references.push({ base: root, value: match[1] });
}
for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
  references.push({ base: path.join(root, "css"), value: match[1] });
}
for (const reference of references) {
  if (/^(?:https?:|data:|#)/.test(reference.value)) continue;
  const target = path.resolve(reference.base, reference.value.split("?")[0]);
  assert.ok(fs.existsSync(target), `missing local asset ${reference.value}`);
}

const viewport = html.match(/<meta\s+name="viewport"\s+content="([^"]+)"/i)?.[1] || "";
assert.ok(viewport.includes("viewport-fit=cover"));
assert.ok(!viewport.includes("user-scalable=no"), "page zoom must not be disabled");
assert.match(css, /#game-container canvas[\s\S]*?touch-action:\s*none/);
assert.match(css, /html,[\s\S]*?body[\s\S]*?overflow:\s*hidden/);
assert.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length, "CSS braces must balance");

console.log(`static shell verified: ${ids.length} ids, ${references.length} local/remote references`);
