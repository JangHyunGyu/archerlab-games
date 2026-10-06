"use strict";

// Browser test for the menu-first combat asset build:
//  - the background build finishes with every combat texture registered
//    (slices, badges, generated textures, inventory icons in the right order)
//    and without keeping the full slice-source sheets as textures;
//  - a sortie tapped right after the menu appears pauses menu drawing and runs
//    the build in long batches, then reaches combat with drawing restored;
//  - a sortie that fails its profile check returns to a drawn, normally paced menu.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

function loadChromium() {
  try { return require("@playwright/test").chromium; } catch (_) { /* fall through */ }
  return require("playwright").chromium;
}

const root = path.resolve(process.env.SZD_TEST_ROOT || path.join(__dirname, "..", ".."));
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".wav": "audio/wav",
  ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".ico": "image/x-icon"
};

function startServer() {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.join(root, pathname);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    try { if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html"); } catch (_) { /* 404 below */ }
    fs.readFile(file, (error, body) => {
      if (error) { res.writeHead(404, { "content-type": "text/plain" }); res.end("not found"); return; }
      res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
      res.end(body);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function launch(chromium) {
  const args = ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"];
  try {
    return await chromium.launch({ headless: true, args });
  } catch (error) {
    return chromium.launch({ headless: true, channel: "chrome", args });
  }
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" };

async function openGame(browser, baseUrl, { profileOk = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 1, locale: "ko-KR", serviceWorkers: "block" });
  await context.route(/workers\.dev/, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (/school-zombie\/profile$/.test(request.url())) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (!profileOk) return route.fulfill({ status: 503, headers: { ...CORS, "content-type": "application/json" }, body: "{\"success\":false}" });
      return route.fulfill({
        status: 200,
        headers: { ...CORS, "content-type": "application/json" },
        body: JSON.stringify({ success: true, profile_id: "test-profile", profile_secret: "test-secret-0123456789abcdef0123456789", profile_revision: 1, coins: 120, upgrades: {} })
      });
    }
    return route.abort().catch(() => {});
  });
  await context.route(/googletagmanager|google-analytics/, (route) => route.abort().catch(() => {}));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (/Texture key already in use|Texture.*missing/i.test(message.text())) errors.push(message.text());
  });
  await page.goto(baseUrl + "/school-zombie-defense/", { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => {
    const scene = window.__schoolZombieDefense?.scene?.getScene?.("GameScene");
    return scene && scene.mode === "menu" && !document.querySelector(".loading");
  }, null, { timeout: 180000, polling: 50 });
  return { context, page, errors };
}

const textureReport = (page) => page.evaluate(() => {
  const game = window.__schoolZombieDefense;
  const textures = game.textures;
  const size = (key) => {
    if (!textures.exists(key)) return null;
    const source = textures.get(key).source[0];
    return [source.width, source.height];
  };
  const keys = textures.getTextureKeys();
  return {
    count: keys.length,
    sizes: Object.fromEntries([
      "character-a-aim-12", "character-a-idle", "character-a-attack-aim-1330-2", "character-a-badge",
      "character-f-throw-aim-12-4", "character-h-badge", "zombie-walk-normal-3-3", "projectile-frost",
      "skill-frost", "skill-pierce", "skill-rally", "equipment-wrench", "engineer-turret-head"
    ].map((key) => [key, size(key)])),
    sheetsAsTextures: keys.filter((key) => /^(?:character-[a-h](?:-(?:attack|throw)-\d+)?|zombie-walk-[a-z]+)$/.test(key))
  };
});

function assertCombatTextures(report, label) {
  for (const [key, value] of Object.entries(report.sizes)) {
    assert.ok(Array.isArray(value) && value[0] > 0 && value[1] > 0, `${label}: ${key} must be registered`);
  }
  // The inventory icon replaces the generated 72px skill texture with the same key.
  assert.deepEqual(report.sizes["skill-pierce"], [256, 256], `${label}: skill-pierce must be the inventory icon`);
  assert.deepEqual(report.sizes["skill-frost"], [256, 256], `${label}: skill-frost must be the inventory icon`);
  assert.deepEqual(report.sizes["character-a-badge"], [128, 128]);
  assert.deepEqual(report.sheetsAsTextures, [], `${label}: slice-source sheets must not stay registered`);
}

async function tapDeploy(page) {
  const point = await page.evaluate(() => {
    const rect = document.querySelector("#game-root canvas").getBoundingClientRect();
    return { x: rect.left + 270 / 540 * rect.width, y: rect.top + 790 / 960 * rect.height };
  });
  await page.mouse.click(point.x, point.y);
}

async function run() {
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await launch(loadChromium());
  try {
    // 1) Menu stays open while the build runs in small, paced slices.
    {
      const { context, page, errors } = await openGame(browser, baseUrl);
      const schedule = await page.evaluate(() => window.__schoolZombieDefense.scene.getScene("GameScene").getCombatAssetSchedule());
      assert.ok(schedule.budget <= 16 && schedule.settleMs > 0, "menu build must use short, paced slices");
      await page.waitForFunction(() => window.__schoolZombieDefense.scene.getScene("GameScene").combatAssetsReady === true, null, { timeout: 300000, polling: 250 });
      const state = await page.evaluate(() => {
        const scene = window.__schoolZombieDefense.scene.getScene("GameScene");
        return { mode: scene.mode, visible: scene.sys.settings.visible, progress: scene.combatAssetsProgress };
      });
      assert.deepEqual(state, { mode: "menu", visible: true, progress: 1 });
      const report = await textureReport(page);
      assertCombatTextures(report, "menu build");
      assert.deepEqual(errors, []);
      console.log(`  menu build: ${report.count} textures, no slice-source sheets kept`);
      await context.close();
    }
    // 2) Sortie tapped right after the menu appears.
    {
      const { context, page, errors } = await openGame(browser, baseUrl);
      await page.evaluate(() => {
        const scene = window.__schoolZombieDefense.scene.getScene("GameScene");
        window.__waitSamples = [];
        const sample = () => {
          if (scene.mode === "starting" && !scene.combatAssetsReady) {
            window.__waitSamples.push({ visible: scene.sys.settings.visible, budget: scene.getCombatAssetSchedule().budget, overlay: Boolean(document.getElementById("run-loading-overlay")) });
          }
          if (scene.mode !== "playing") setTimeout(sample, 20);
        };
        sample();
      });
      assert.equal(await page.evaluate(() => window.__schoolZombieDefense.scene.getScene("GameScene").combatAssetsReady), false,
        "the sortie must be tapped before the background build has finished");
      await tapDeploy(page);
      await page.waitForFunction(() => {
        const scene = window.__schoolZombieDefense.scene.getScene("GameScene");
        return scene.mode === "playing" && !document.getElementById("run-loading-overlay");
      }, null, { timeout: 300000, polling: 100 });
      const samples = await page.evaluate(() => window.__waitSamples);
      assert.ok(samples.length > 0, "the sortie must have waited for combat assets");
      assert.ok(samples.every((s) => s.overlay), "menu drawing may only pause behind the sortie overlay");
      assert.ok(samples.some((s) => s.visible === false && s.budget > 16), "waiting sortie must pause menu drawing and use long batches");
      await page.waitForTimeout(3000);
      const state = await page.evaluate(() => {
        const scene = window.__schoolZombieDefense.scene.getScene("GameScene");
        return { mode: scene.mode, visible: scene.sys.settings.visible, urgent: scene.combatAssetsUrgent, defenders: scene.defenders.length, ready: scene.combatAssetsReady };
      });
      assert.deepEqual(state, { mode: "playing", visible: true, urgent: false, defenders: 8, ready: true });
      assertCombatTextures(await textureReport(page), "sortie build");
      assert.deepEqual(errors, []);
      console.log(`  immediate sortie: waited ${samples.length} samples behind the overlay, then reached combat`);
      await context.close();
    }
    // 3) A sortie whose profile check fails returns to the drawn menu.
    {
      const { context, page, errors } = await openGame(browser, baseUrl, { profileOk: false });
      await page.waitForTimeout(1200);
      await tapDeploy(page);
      await page.waitForFunction(() => {
        const scene = window.__schoolZombieDefense.scene.getScene("GameScene");
        return scene.mode === "starting";
      }, null, { timeout: 20000, polling: 20 }).catch(() => {});
      await page.waitForFunction(() => {
        const scene = window.__schoolZombieDefense.scene.getScene("GameScene");
        return scene.mode !== "starting";
      }, null, { timeout: 60000, polling: 50 });
      const state = await page.evaluate(() => {
        const scene = window.__schoolZombieDefense.scene.getScene("GameScene");
        return { mode: scene.mode, visible: scene.sys.settings.visible, urgent: scene.combatAssetsUrgent };
      });
      assert.deepEqual(state, { mode: "menu", visible: true, urgent: false }, "a failed sortie must restore the menu");
      await page.waitForFunction(() => window.__schoolZombieDefense.scene.getScene("GameScene").combatAssetsReady === true, null, { timeout: 300000, polling: 250 });
      assert.deepEqual(errors, []);
      console.log("  failed sortie: menu drawing and pacing restored");
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log("School Zombie Defense combat asset loading verified in the browser");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
