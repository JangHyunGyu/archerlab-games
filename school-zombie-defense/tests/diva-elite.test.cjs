"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const source = fs.readFileSync(path.join(__dirname, "../js/game.js"), "utf8");
const motion = require("../js/zombie-motion-data.js");
const configs = vm.runInNewContext(`(${source.match(/const ZOMBIE_TYPE_CONFIGS = (\{[^]*?\n  \});/)[1]})`);
const pickBody = source.match(/function pickZombieType\(level, eliteRoll\) \{([^]*?)\n  \}/)[1];
let roll = 0;
const pick = vm.runInNewContext(`(function(level, eliteRoll) {${pickBody}})`, {
  ZOMBIE_TYPE_CONFIGS: configs, Math: Object.assign(Object.create(Math), { random: () => roll })
});
for (const level of [1, 2, 3, 6, 12, 30]) {
  const counts = new Map();
  for (let i = 0; i < 2000; i++) {
    roll = (i + 0.5) / 2000;
    const type = pick(level, false);
    assert.ok(type && configs[type.id], `valid spawn at level ${level}`);
    counts.set(type.id, (counts.get(type.id) || 0) + 1);
    assert.equal(pick(level, true).id, "elite", "new civilian must not replace elite rolls");
  }
  assert.equal(counts.has("diva"), level >= 3, "Diva enters the actual weighted pool at level 3");
  if (level >= 3) assert.ok(counts.get("diva") / 2000 < 0.12, "Diva must remain a mixed-horde addition");
}
for (const name of ["ZOMBIE_DEATH_TYPES", "ZOMBIE_TEXTURE_TYPES"]) {
  const entries = vm.runInNewContext(source.match(new RegExp(`const ${name} = (\\[[^]*?\\]);`))[1]);
  assert.equal(entries.filter(type => type === "diva").length, 1, `${name} registers Diva exactly once`);
}
assert.equal(motion.walk.diva.length, 16, "all random variant/frame keys have walk anchors");
assert.equal(motion.death["zombie-death-diva-sheet"].length, 8, "full collapse sequence reaches the final corpse");

// Check the shipped pixels, including the original reported one-leg gait.
// These foot windows cover the boots, below the coat. Contact frames must
// alternate which boot reaches farther toward the bottom of the screen.
const python = String.raw`
import sys
from pathlib import Path
from PIL import Image
root=Path(sys.argv[1])
for name in ['zombie-walk-elite','zombie-walk-diva','zombie-death-diva-sheet']:
    png=Image.open(root/(name+'.png')).convert('RGBA')
    webp=Image.open(root/(name+'.webp')).convert('RGBA')
    assert png.size==webp.size and png.getchannel('A').tobytes()==webp.getchannel('A').tobytes(), name+' alpha parity'
    for y in range(0,png.height,512):
        for x in range(0,png.width,512):
            cell=png.crop((x,y,x+512,y+512))
            a=cell.getchannel('A')
            b=a.point(lambda v:255 if v>8 else 0).getbbox()
            assert b and min(b[:2])>=3 and max(b[2:])<=509, name+' cell clipping'
            assert not any(r>160 and b>160 and g<80 and a>96 for r,g,b,a in cell.getdata()), name+' matte spill'
elite=Image.open(root/'zombie-walk-elite.png').convert('RGBA')
for row in range(4):
    differences=[]
    for frame in [0,2]:
        alpha=elite.crop((frame*512,row*512,frame*512+512,row*512+512)).getchannel('A')
        toes=[]
        for left,right in [(128,250),(262,384)]:
            box=alpha.crop((left,380,right,510)).point(lambda a:255 if a>32 else 0).getbbox()
            assert box, 'both boots must remain visible'
            toes.append(box[3])
        differences.append(toes[0]-toes[1])
    assert differences[0]>20 and differences[1]<-20, 'elite must alternate leading feet'
`;
let result = spawnSync("python", ["-c", python, path.join(__dirname, "../assets/images")], { encoding: "utf8" });
if (result.error?.code === "ENOENT") result = spawnSync("py", ["-3", "-c", python, path.join(__dirname, "../assets/images")], { encoding: "utf8" });
assert.ifError(result.error);
assert.equal(result.status, 0, result.stderr || result.stdout);
console.log("Diva spawn/atlas integration and elite alternating foot contacts verified");
