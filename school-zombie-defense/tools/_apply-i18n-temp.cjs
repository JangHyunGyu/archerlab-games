"use strict";

const fs = require("node:fs");
const path = require("node:path");
const file = path.join(__dirname, "..", "js", "game.js");
let source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

function replaceOnce(oldText, newText, label) {
  const index = source.indexOf(oldText);
  if (index < 0) throw new Error("missing: " + label);
  if (source.indexOf(oldText, index + oldText.length) >= 0) throw new Error("ambiguous: " + label);
  source = source.slice(0, index) + newText + source.slice(index + oldText.length);
}

const skills = [
  ["c-impact", "tag.pistol", 'SchoolI18n.t("skill.stat.damage", {\n          from: this.formatPercent(pistol.damageBoost),\n          to: this.formatPercent(pistol.damageBoost * 1.12)\n        })'],
  ["c-rapid", "tag.pistol", 'SchoolI18n.t("skill.stat.interval", {\n          from: this.formatSeconds(pistol.rate),\n          to: this.formatSeconds(Math.max(pistol.baseRate * 0.52, pistol.rate * 0.82))\n        })'],
  ["c-multishot", "tag.pistol", 'SchoolI18n.t("skill.stat.followup", {\n          from: pistol.burstCount,\n          to: Math.min(4, pistol.burstCount + 1)\n        })'],
  ["c-pierce", "tag.pistol", 'SchoolI18n.t("skill.stat.pierceDamage", {\n          pierceFrom: pistol.pierce,\n          pierceTo: pistol.pierce + 1,\n          from: this.formatPercent(pistol.damageBoost),\n          to: this.formatPercent(pistol.damageBoost * 1.08)\n        })'],
  ["a-force", "tag.crossbow", 'SchoolI18n.t("skill.stat.damage", {\n          from: this.formatPercent(bow.damageBoost),\n          to: this.formatPercent(bow.damageBoost * 1.1)\n        })'],
  ["a-rally", "tag.crossbow", 'SchoolI18n.t("skill.stat.crit", {\n          critFrom: this.formatPercent(bow.critChance),\n          critTo: this.formatPercent(Math.min(0.72, bow.critChance + 0.14)),\n          dmgFrom: this.formatPercent(bow.critMultiplier),\n          dmgTo: this.formatPercent(bow.critMultiplier + 0.35)\n        })'],
  ["a-mark", "tag.crossbow", 'SchoolI18n.t("skill.stat.mark", {\n          from: this.formatBonus(bow.markDamageBonus),\n          to: this.formatBonus(bow.markDamageBonus + 0.12),\n          timeFrom: this.formatSeconds(bow.markDuration),\n          timeTo: this.formatSeconds(bow.markDuration + 1.8)\n        })'],
  ["a-pin", "tag.crossbow", 'SchoolI18n.t("skill.stat.slowMark", {\n          slowFrom: this.formatSeconds(bow.slowDuration),\n          slowTo: this.formatSeconds(bow.slowDuration + 0.75),\n          markFrom: this.formatBonus(bow.markDamageBonus),\n          markTo: this.formatBonus(bow.markDamageBonus + 0.04)\n        })'],
  ["a-pierce", "tag.crossbow", 'SchoolI18n.t("skill.stat.pierceDamage", {\n          pierceFrom: bow.pierce,\n          pierceTo: bow.pierce + 1,\n          from: this.formatPercent(bow.damageBoost),\n          to: this.formatPercent(bow.damageBoost * 1.1)\n        })'],
  ["b-caliber", "tag.rifle", 'SchoolI18n.t("skill.stat.damage", {\n          from: this.formatPercent(rifle.damageBoost),\n          to: this.formatPercent(rifle.damageBoost * 1.09)\n        })'],
  ["b-rifle", "tag.rifle", 'SchoolI18n.t("skill.stat.burstControl", {\n          from: rifle.burstCount,\n          to: Math.min(6, rifle.burstCount + rifleBurstGain),\n          gapFrom: this.formatMs(rifle.burstDelay),\n          gapTo: this.formatMs(Math.max(MIN_CHAIN_SHOT_DELAY, rifle.burstDelay * 0.86))\n        })'],
  ["b-suppress", "tag.rifle", 'SchoolI18n.t("skill.stat.slowDamage", {\n          slowFrom: this.formatSeconds(rifle.slowDuration),\n          slowTo: this.formatSeconds(rifle.slowDuration + 0.22),\n          from: this.formatPercent(rifle.damageBoost),\n          to: this.formatPercent(rifle.damageBoost * 1.08)\n        })'],
  ["d-warhead", "tag.rocket", 'SchoolI18n.t("skill.stat.rocketDamage", {\n          from: this.formatPercent(rocket.damageBoost),\n          to: this.formatPercent(rocket.damageBoost * 1.14)\n        })'],
  ["d-frost", "tag.rocket", 'SchoolI18n.t("skill.stat.slowDirect", {\n          slowFrom: this.formatSeconds(rocket.slowDuration),\n          slowTo: this.formatSeconds(rocket.slowDuration + 1.4),\n          from: this.formatPercent(rocket.damageBoost),\n          to: this.formatPercent(rocket.damageBoost * 1.22)\n        })'],
  ["d-rocket", "tag.rocket", 'SchoolI18n.t("skill.stat.radiusBlast", {\n          from: Math.round(rocket.splashRadius * rocket.splashRadiusBoost),\n          to: Math.round(rocket.splashRadius * rocket.splashRadiusBoost * 1.12),\n          dmgFrom: this.formatPercent(rocket.splashDamageScale * rocket.splashDamageBoost),\n          dmgTo: this.formatPercent(rocket.splashDamageScale * rocket.splashDamageBoost * 1.16)\n        })'],
  ["d-impact", "tag.rocket", 'SchoolI18n.t("skill.stat.direct", {\n          from: this.formatPercent(rocket.damageBoost),\n          to: this.formatPercent(rocket.damageBoost * 1.28)\n        })'],
  ["d-reload", "tag.rocket", 'SchoolI18n.t("skill.stat.interval", {\n          from: this.formatSeconds(rocket.rate),\n          to: this.formatSeconds(Math.max(rocket.baseRate * 0.58, rocket.rate * 0.82))\n        })'],
  ["e-caliber", "tag.sniper", 'SchoolI18n.t("skill.stat.sniperDamage", {\n          from: this.formatPercent(sniper.damageBoost),\n          to: this.formatPercent(sniper.damageBoost * 1.13)\n        })'],
  ["e-weakpoint", "tag.sniper", 'SchoolI18n.t("skill.stat.crit", {\n          critFrom: this.formatPercent(sniper.critChance),\n          critTo: this.formatPercent(Math.min(0.78, sniper.critChance + 0.1)),\n          dmgFrom: this.formatPercent(sniper.critMultiplier),\n          dmgTo: this.formatPercent(sniper.critMultiplier + 0.45)\n        })'],
  ["e-sniper", "tag.sniper", 'SchoolI18n.t("skill.stat.pierceSniper", {\n          pierceFrom: sniper.pierce,\n          pierceTo: sniper.pierce + 1,\n          from: this.formatPercent(sniper.damageBoost),\n          to: this.formatPercent(sniper.damageBoost * 1.16)\n        })'],
  ["e-reload", "tag.sniper", 'SchoolI18n.t("skill.stat.interval", {\n          from: this.formatSeconds(sniper.rate),\n          to: this.formatSeconds(Math.max(sniper.baseRate * 0.58, sniper.rate * 0.82))\n        })'],
  ["f-fuel", "tag.fire", 'SchoolI18n.t("skill.stat.flame", {\n          from: this.formatPercent(fire.fireZoneDamageScale),\n          to: this.formatPercent(fire.fireZoneDamageScale + 0.045)\n        })'],
  ["f-zone", "tag.fire", 'SchoolI18n.t("skill.stat.radiusZone", {\n          from: Math.round(fire.fireZoneRadius),\n          to: Math.round(fire.fireZoneRadius + 12),\n          dmgFrom: this.formatPercent(fire.fireZoneDamageScale),\n          dmgTo: this.formatPercent(fire.fireZoneDamageScale + 0.03)\n        })'],
  ["f-bottle", "tag.fire", 'SchoolI18n.t("skill.stat.burnBase", {\n          from: this.formatPercent(fire.damageBoost),\n          to: this.formatPercent(fire.damageBoost * 1.14),\n          dmgFrom: this.formatPercent(fire.fireZoneDamageScale),\n          dmgTo: this.formatPercent(fire.fireZoneDamageScale + 0.02)\n        })'],
  ["f-sticky", "tag.fire", 'SchoolI18n.t("skill.stat.slowHold", {\n          slowFrom: this.formatSeconds(fire.slowDuration),\n          slowTo: this.formatSeconds(fire.slowDuration + 0.35),\n          timeFrom: this.formatSeconds(fire.fireZoneDuration),\n          timeTo: this.formatSeconds(fire.fireZoneDuration + 0.45)\n        })'],
  ["g-amplifier", "tag.shock", 'SchoolI18n.t("skill.stat.shock", {\n          from: this.formatPercent(shock.damageBoost),\n          to: this.formatPercent(shock.damageBoost * 1.1)\n        })'],
  ["g-voltage", "tag.shock", 'SchoolI18n.t("skill.stat.stunChain", {\n          stunFrom: this.formatSeconds(shock.stunDuration),\n          stunTo: this.formatSeconds(Math.min(SHOCK_STUN_SKILL_MAX, shock.stunDuration + SHOCK_STUN_SKILL_GAIN)),\n          from: this.formatPercent(shock.chainDamageScale),\n          to: this.formatPercent(shock.chainDamageScale + 0.05)\n        })'],
  ["g-chain", "tag.shock", 'SchoolI18n.t("skill.stat.chainRadius", {\n          from: shock.chainJumps,\n          to: shock.chainJumps + 1,\n          radiusFrom: Math.round(shock.chainRadius),\n          radiusTo: Math.round(shock.chainRadius + 18)\n        })'],
  ["g-overload", "tag.shock", 'SchoolI18n.t("skill.stat.crit", {\n          critFrom: this.formatPercent(shock.critChance),\n          critTo: this.formatPercent(Math.min(0.64, shock.critChance + 0.09)),\n          dmgFrom: this.formatPercent(shock.critMultiplier),\n          dmgTo: this.formatPercent(shock.critMultiplier + 0.3)\n        })'],
  ["h-nail", "tag.engineer", 'SchoolI18n.t("skill.stat.nail", {\n          from: this.formatPercent(engineer.damageBoost),\n          to: this.formatPercent(engineer.damageBoost * 1.12)\n        })'],
  ["h-barricade", "tag.engineer", 'SchoolI18n.t("skill.stat.barricade", {\n          hpFrom: Math.round(this.coreHp),\n          hpTo: Math.min(Math.round(this.maxCoreHp), Math.round(this.coreHp + barricadeRepair)),\n          hpMax: Math.round(this.maxCoreHp),\n          shieldFrom: Math.round(this.shield),\n          shieldTo: Math.round(this.shield + barricadeShield)\n        })']
];

for (const [id, tagKey, statExpr] of skills) {
  const pattern = new RegExp(
    `(id: "${id}",\\n\\s*icon: "[^"]+",\\n\\s*)tag: "[^"]+",\\n\\s*title: "[^"]+",\\n\\s*desc: "[^"]*",\\n\\s*stat: (?:\`[^\`]+\`|[^\\n]+)`
  );
  const match = source.match(pattern);
  if (!match) throw new Error("skill missing " + id);
  const replacement = `${match[1]}tag: SchoolI18n.t("${tagKey}"),\n        title: SchoolI18n.t("skill.${id}.title"),\n        desc: SchoolI18n.t("skill.${id}.desc"),\n        stat: ${statExpr}`;
  source = source.replace(pattern, replacement);
}

replaceOnce(
`        tag: "소총",
        title: "하부 유탄",
        desc: "연발 중간마다\\n소형 폭발을 섞습니다.",
        stat: rifle.rocketEvery === 0
          ? \`유탄 없음 → \${RIFLE_GRENADE_INITIAL_INTERVAL}세트\\n폭발 \${this.formatPercent(rifleGrenadeDamageBoost)}→\${this.formatPercent(rifleGrenadeDamageBoost * 1.2)} · 범위 \${this.formatPercent(rifleGrenadeRadiusBoost)}→\${this.formatPercent(rifleGrenadeRadiusBoost * 1.1)}\`
          : \`유탄 \${rifle.rocketEvery}→\${getNextRifleGrenadeEvery(rifle.rocketEvery)}세트\\n폭발 \${this.formatPercent(rifleGrenadeDamageBoost)}→\${this.formatPercent(rifleGrenadeDamageBoost * 1.2)} · 범위 \${this.formatPercent(rifleGrenadeRadiusBoost)}→\${this.formatPercent(rifleGrenadeRadiusBoost * 1.1)}\`,`,
`        tag: SchoolI18n.t("tag.rifle"),
        title: SchoolI18n.t("skill.b-barrage.title"),
        desc: SchoolI18n.t("skill.b-barrage.desc"),
        stat: rifle.rocketEvery === 0
          ? SchoolI18n.t("skill.stat.grenadeUnlock", {
            sets: RIFLE_GRENADE_INITIAL_INTERVAL,
            blastFrom: this.formatPercent(rifleGrenadeDamageBoost),
            blastTo: this.formatPercent(rifleGrenadeDamageBoost * 1.2),
            areaFrom: this.formatPercent(rifleGrenadeRadiusBoost),
            areaTo: this.formatPercent(rifleGrenadeRadiusBoost * 1.1)
          })
          : SchoolI18n.t("skill.stat.grenade", {
            from: rifle.rocketEvery,
            to: getNextRifleGrenadeEvery(rifle.rocketEvery),
            blastFrom: this.formatPercent(rifleGrenadeDamageBoost),
            blastTo: this.formatPercent(rifleGrenadeDamageBoost * 1.2),
            areaFrom: this.formatPercent(rifleGrenadeRadiusBoost),
            areaTo: this.formatPercent(rifleGrenadeRadiusBoost * 1.1)
          }),`,
  "grenade skill"
);

replaceOnce(
`        tag: "공병",
        title: (this.turrets?.length || 0) > 0 ? "터렛 출력 강화" : "휴대 터렛",
        desc: "방어선 앞에 자동 터렛을\\n설치하거나 강화합니다.",
        stat: \`\${(this.turrets?.length || 0) > 0 ? "터렛 설치됨" : "터렛 0/1 → 1/1"}\\n출력 \${this.formatPercent(engineer.turretDamageBoost)} → \${this.formatPercent(engineer.turretDamageBoost * 1.08)}\`,`,
`        tag: SchoolI18n.t("tag.engineer"),
        title: (this.turrets?.length || 0) > 0 ? SchoolI18n.t("skill.h-turret.titleOwned") : SchoolI18n.t("skill.h-turret.title"),
        desc: SchoolI18n.t("skill.h-turret.desc"),
        stat: SchoolI18n.t((this.turrets?.length || 0) > 0 ? "skill.stat.turretOwned" : "skill.stat.turretNew", {
          from: this.formatPercent(engineer.turretDamageBoost),
          to: this.formatPercent(engineer.turretDamageBoost * 1.08)
        }),`,
  "turret skill"
);

replaceOnce(
`        tag: "공병",
        title: this.barbedWire ? "철조망 보강" : "가시철조망",
        desc: "진입로에 철조망을 깔아\\n접근한 좀비를 늦춥니다.",
        stat: \`피해 \${this.formatPercent(engineer.wireDamageBoost)} → \${this.formatPercent(engineer.wireDamageBoost * 1.12)}\\n둔화 \${this.formatPercent(engineer.wireSlowBoost)} → \${this.formatPercent(engineer.wireSlowBoost * 1.08)}\`,`,
`        tag: SchoolI18n.t("tag.engineer"),
        title: this.barbedWire ? SchoolI18n.t("skill.h-wire.titleOwned") : SchoolI18n.t("skill.h-wire.title"),
        desc: SchoolI18n.t("skill.h-wire.desc"),
        stat: SchoolI18n.t("skill.stat.wire", {
          from: this.formatPercent(engineer.wireDamageBoost),
          to: this.formatPercent(engineer.wireDamageBoost * 1.12),
          slowFrom: this.formatPercent(engineer.wireSlowBoost),
          slowTo: this.formatPercent(engineer.wireSlowBoost * 1.08)
        }),`,
  "wire skill"
);

replaceOnce(
`          tag: "방어",
          title: "완전 복구",
          desc: "방어선을 즉시\\n최대 HP까지 수리",`,
`          tag: SchoolI18n.t("tag.defense"),
          title: SchoolI18n.t("skill.core.title"),
          desc: SchoolI18n.t("skill.core.desc"),`,
  "core skill"
);
replaceOnce('toast: "방어선 완전 복구",', 'toast: SchoolI18n.t("skill.core.toast"),', "core toast");

replaceOnce('upgrade.tag || (isRecruit ? "영입" : "전술")',
  'upgrade.tag || (isRecruit ? SchoolI18n.t("tag.recruit") : SchoolI18n.t("tag.tactic"))', "wide tag");
replaceOnce(': this.add.text(x + 132, y - 10, "즉시 적용", {',
  ': this.add.text(x + 132, y - 10, SchoolI18n.t("skill.now"), {', "applies now");
replaceOnce('const chooseText = this.add.text(x + 132, y + 49, "선택", {',
  'const chooseText = this.add.text(x + 132, y + 49, SchoolI18n.t("skill.choose"), {', "choose wide");
replaceOnce('const tagText = this.add.text(x, tagY, upgrade.tag || "전술", {',
  'const tagText = this.add.text(x, tagY, upgrade.tag || SchoolI18n.t("tag.tactic"), {', "card tag");
replaceOnce('const chooseText = this.add.text(x, chooseY, "선택", {',
  'const chooseText = this.add.text(x, chooseY, SchoolI18n.t("skill.choose"), {', "choose card");

replaceOnce('>랭킹 등록</div>', '>${SchoolI18n.t("rank.dialogTitle")}</div>', "rank dialog title");
replaceOnce('>클리어 St.${run.score} · 처치 ${run.kills}</div>',
  '>${SchoolI18n.t("rank.score", { score: run.score, kills: run.kills })}</div>', "rank score");
replaceOnce("${inlineGameOver ? '<div class=\"sr-only\" id=\"school-zombie-rank-dialog-title\">게임 오버 랭킹 등록</div>' : \"\"}",
  "${inlineGameOver ? `<div class=\"sr-only\" id=\"school-zombie-rank-dialog-title\">${SchoolI18n.t(\"rank.gameOverTitle\")}</div>` : \"\"}",
  "rank gameover title");
replaceOnce(">랭킹에 표시할 닉네임</label>", ">${SchoolI18n.t(\"rank.nameLabel\")}</label>", "rank name label");
replaceOnce('placeholder="닉네임 입력"', 'placeholder="${SchoolI18n.t(\'rank.namePlaceholder\')}"', "rank placeholder");
replaceOnce(">최대 20자. 등록하거나 나중에 버튼으로 건너뛸 수 있습니다.</div>",
  ">${SchoolI18n.t(\"rank.nameHelp\")}</div>", "rank help");
replaceOnce(">랭킹 신호 송신 중</div>", ">${SchoolI18n.t(\"rank.sending\")}</div>", "rank sending");
replaceOnce(">등록</button>", ">${SchoolI18n.t(\"rank.register\")}</button>", "rank register");
replaceOnce(">나중에</button>", ">${SchoolI18n.t(\"rank.later\")}</button>", "rank later");
replaceOnce('submitButton.textContent = "등록 중";', 'submitButton.textContent = SchoolI18n.t("rank.registering");', "registering");
replaceOnce('submitButton.textContent = "등록";', 'submitButton.textContent = SchoolI18n.t("rank.register");', "register reset");

replaceOnce('announceGameStatus(`방어선 붕괴. 웨이브 ${this.level}, 처치 ${this.kills}. 기록을 등록하거나 메뉴로 돌아갈 수 있습니다.`);',
  'announceGameStatus(SchoolI18n.t("over.a11y", { level: this.level, kills: this.kills }));', "over a11y");
replaceOnce('const summaryTitle = this.add.text(270, 98, "방어선 붕괴", {',
  'const summaryTitle = this.add.text(270, 98, SchoolI18n.t("over.title"), {', "over title");
replaceOnce('const summaryWave = this.add.text(270, 146, `웨이브 ${this.level} · 처치 ${this.kills}`, {',
  'const summaryWave = this.add.text(270, 146, SchoolI18n.t("over.wave", { level: this.level, kills: this.kills }), {', "over wave");
replaceOnce('const summaryStage = this.add.text(270, 182, `클리어 St.${rankSnapshot.score} · 도달 St.${rankSnapshot.reachedStage}`, {',
  'const summaryStage = this.add.text(270, 182, SchoolI18n.t("over.stage", { score: rankSnapshot.score, reached: rankSnapshot.reachedStage }), {', "over stage");
replaceOnce('const summaryCoins = this.add.text(270, 216, `획득 $${earnedCoins} · 보유 $${this.meta.coins}`, {',
  'const summaryCoins = this.add.text(270, 216, SchoolI18n.t("over.coins", { earned: earnedCoins, held: this.meta.coins }), {', "over coins");
replaceOnce('this.addOverlayButton(270, 286, 184, 52, "메뉴", 545, () => this.returnToGameStart(), COLORS.gold);',
  'this.addOverlayButton(270, 286, 184, 52, SchoolI18n.t("over.menu"), 545, () => this.returnToGameStart(), COLORS.gold);', "over menu");
replaceOnce('const stageName = ["교문", "복도", "교실", "옥상"][Math.min(3, this.stage - 1)];\n      this.ui.stage.setText(`STAGE ${String(this.stage).padStart(2, "0")} · ${stageName}`);',
  'const stageName = [SchoolI18n.t("stage.gate"), SchoolI18n.t("stage.hall"), SchoolI18n.t("stage.class"), SchoolI18n.t("stage.roof")][Math.min(3, this.stage - 1)];\n      this.ui.stage.setText(SchoolI18n.t("stage.line", { stage: String(this.stage).padStart(2, "0"), name: stageName }));', "stage hud");
replaceOnce(`const threatLabel = hpRate < 0.35
        ? "붕괴 위험 · 즉시 복구 필요"
        : hpRate < 0.68
          ? "방어선 압박 · 보강 권장"
          : "방어 안정";`,
`const threatLabel = hpRate < 0.35
        ? SchoolI18n.t("hud.collapse")
        : hpRate < 0.68
          ? SchoolI18n.t("hud.pressure")
          : SchoolI18n.t("hud.stable");`, "threat");

replaceOnce(`      items.push(protocol);
      const eyebrow = this.add.text(270, 79, "SCHOOL UNDEAD · LAST DEFENSE", {`,
`      items.push(protocol);
      this.addLanguageSwitch(292, 38, 530);
      const eyebrow = this.add.text(270, 79, "SCHOOL UNDEAD · LAST DEFENSE", {`, "menu lang");

replaceOnce(`      items.push(boardTop, ...headers);

      const visibleRows = rows.slice(0, 11);`,
`      items.push(boardTop, ...headers);
      this.addLanguageSwitch(470, 48, 560);

      const visibleRows = rows.slice(0, 11);`, "rank lang");

replaceOnce(`        onExit: () => this.showMenu()
      });`,
`        onExit: () => this.showMenu(),
        onLocale: () => this.refreshLanguageChrome()
      });`, "shop locale");

replaceOnce(`    showInitialProfileLoading() {`,
`    refreshLanguageChrome() {
      if (this.ui?.supplyLabel?.active) this.ui.supplyLabel.setText(SchoolI18n.t("hud.supply"));
      if (this.ui?.stage?.active) this.updateHud();
      const canvas = this.game?.canvas;
      if (canvas) canvas.setAttribute("aria-label", SchoolI18n.t("boot.canvas"));
    }

    switchLanguage(lang) {
      if (SchoolI18n.getLang() === lang) return;
      SchoolI18n.setLang(lang);
      this.refreshLanguageChrome();
      if (this.mode === "menu") this.showMenu();
      else if (this.mode === "ranking") this.showRankings();
      else if (this.mode === "profile-loading") this.showInitialProfileLoading();
      else if (this.mode === "shop") this.shopUI?.localize();
      else if (this.mode === "paused") {
        if (this.pauseConfirmOpen) this.showQuitConfirmation();
        else this.showPauseOverlay();
      }
    }

    addLanguageSwitch(x, y, depth) {
      const make = (lang, offset) => this.addTacticalMenuButton(
        x + offset, y, 52, 34, lang.toUpperCase(), depth,
        () => this.switchLanguage(lang),
        SchoolI18n.getLang() === lang ? COLORS.gold : COLORS.blue,
        { compact: true, fontSize: 12, hitHeight: 44, visualHeight: 32, surfaceAlpha: 0.45, shadowAlpha: 0.12 }
      );
      return [make("ko", -30), make("en", 30)];
    }

    showInitialProfileLoading() {`, "lang methods");

fs.writeFileSync(file, source.replace(/\n/g, "\r\n"));
console.log("skill patch written");
