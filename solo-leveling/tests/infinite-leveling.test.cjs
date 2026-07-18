const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');

(async () => {
    const constantsUrl = pathToFileURL(path.join(root, 'js', 'utils', 'Constants.js')).href;
    const { XP_TABLE, getXpToNext } = await import(constantsUrl);

    for (let level = 1; level < XP_TABLE.length; level++) {
        assert.strictEqual(getXpToNext(level), XP_TABLE[level], `Lv.${level} authored XP curve changed`);
    }

    let previous = getXpToNext(XP_TABLE.length - 1);
    for (let level = XP_TABLE.length; level <= 200; level++) {
        const requirement = getXpToNext(level);
        assert.ok(Number.isSafeInteger(requirement), `Lv.${level} XP must stay a safe integer`);
        assert.ok(requirement > previous, `Lv.${level} XP must increase beyond the prior level`);
        previous = requirement;
    }

    const playerSource = fs.readFileSync(path.join(root, 'js', 'entities', 'Player.js'), 'utf8');
    assert.doesNotMatch(playerSource, /this\.level\s*<\s*30/, 'leveling must not stop at Lv.30');
    assert.match(playerSource, /this\.xpToNext = getXpToNext\(this\.level\)/);

    const gameSource = fs.readFileSync(path.join(root, 'js', 'scenes', 'GameScene.js'), 'utf8');
    assert.doesNotMatch(gameSource, /Clamp\(Number\(saved\.level\)[\s\S]*?30\)/, 'saved levels must not be capped at 30');
    assert.match(gameSource, /player\.xpToNext = getXpToNext\(player\.level\)/);

    const levelUpSource = fs.readFileSync(path.join(root, 'js', 'scenes', 'LevelUpScene.js'), 'utf8');
    const passiveStart = levelUpSource.indexOf('for (const [key, config] of Object.entries(PASSIVES))');
    const passiveEnd = levelUpSource.indexOf('const result = [];', passiveStart);
    const passiveChoices = levelUpSource.slice(passiveStart, passiveEnd);
    assert.ok(passiveStart >= 0 && passiveEnd > passiveStart, 'passive choice generator not found');
    assert.doesNotMatch(passiveChoices, /currentLevel\s*>=\s*10/, 'passive choices must continue after Lv.10');

    const hudSource = fs.readFileSync(path.join(root, 'js', 'ui', 'HUD.js'), 'utf8');
    assert.strictEqual(
        (hudSource.match(/Phaser\.Math\.Clamp\(player\.xp \/ player\.xpToNext, 0, 1\)/g) || []).length,
        2,
        'both HUD layouts must clamp carried-over XP to the bar width'
    );

    console.log(`infinite leveling verified: authored Lv.1-30 curve plus monotonic Lv.31-200 progression`);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
