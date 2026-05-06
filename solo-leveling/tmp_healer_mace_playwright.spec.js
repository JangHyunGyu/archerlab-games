const { test } = require('playwright/test');

test('capture healer mace basic attack motion', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('shadow_survival_selected_character_v1', 'sanctuaryHealer');
        localStorage.removeItem('shadow_survival_save_v1');
    });

    await page.goto(`http://localhost:4173/?mace-test=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.Phaser?.GAMES?.[0]?.scene, null, { timeout: 15000 });
    await page.evaluate(() => {
        window.Phaser.GAMES[0].scene.start('GameScene', { resume: false, characterId: 'sanctuaryHealer' });
    });
    await page.waitForFunction(() => {
        const scene = window.Phaser?.GAMES?.[0]?.scene?.getScene('GameScene');
        return scene?.scene?.isActive?.() && scene.player && scene.weaponManager && scene.enemyManager;
    }, null, { timeout: 15000 });

    await page.evaluate(() => {
        const scene = window.Phaser.GAMES[0].scene.getScene('GameScene');
        scene.enemyManager.pool.getChildren().forEach((enemy) => {
            if (!enemy) return;
            enemy.setActive(false);
            enemy.setVisible(false);
            if (enemy.body) enemy.body.enable = false;
        });
        scene.enemyManager._cachedActiveEnemies = null;
        scene.enemyManager._activeEnemiesDirtyFrame = -1;
        scene.enemyManager._spawnEnemy('goblin', scene.player.x + 112, scene.player.y - 22);
        const weapon = scene.weaponManager.weapons.get('sanctuaryStrike');
        weapon.cooldownTimer = 999999;
        weapon._maceSlam();
    });

    const canvas = page.locator('canvas');
    await canvas.waitFor({ state: 'visible', timeout: 10000 });
    const delays = [40, 80, 120, 170, 220, 280, 340];
    let elapsed = 0;
    for (const delay of delays) {
        await page.waitForTimeout(delay - elapsed);
        elapsed = delay;
        await canvas.screenshot({ path: `tmp_playwright_mace/frame_${String(delay).padStart(3, '0')}.png` });
    }
});
