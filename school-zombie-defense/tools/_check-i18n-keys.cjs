"use strict";
const fs = require("node:fs");
const path = require("node:path");
const i18n = fs.readFileSync(path.join(__dirname, "..", "js", "i18n.js"), "utf8");
const keyRe = /"([A-Za-z0-9_.-]+)"\s*:/g;
const keys = new Set();
let match;
while ((match = keyRe.exec(i18n))) keys.add(match[1]);
const used = new Set();
const useRe = /SchoolI18n\.t\(\s*["']([^"']+)["']/g;
for (const name of ["game.js", "shop-ui.js"]) {
  const source = fs.readFileSync(path.join(__dirname, "..", "js", name), "utf8");
  let usedMatch;
  while ((usedMatch = useRe.exec(source))) used.add(usedMatch[1]);
}
const missing = [...used].filter((key) => !keys.has(key)).sort();
console.log("dict", keys.size, "used", used.size, "missing", missing.length);
console.log(missing.join("\n"));
