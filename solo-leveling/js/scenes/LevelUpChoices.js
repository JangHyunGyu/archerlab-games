import { WEAPONS, PASSIVES } from '../utils/Constants.js';
import { tSkill } from '../utils/i18n.js';
import { getCharacterWeaponKeys, getStarterWeaponKey } from '../utils/Characters.js';

/** Build localized level-up card choices for the current player/weapons. */
export function generateLevelUpChoices(player, weaponManager, iconTexture) {
    const playerLevel = player.level;
    const priorityNew = [];
    const upgradeOptions = [];
    const passiveOptions = [];

    const characterWeaponKeys = getCharacterWeaponKeys(player.characterId);
    const starterWeaponKey = getStarterWeaponKey(player.characterId);
    const weaponEntries = characterWeaponKeys
        .map(key => [key, WEAPONS[key]])
        .filter(([, config]) => !!config)
        .sort(([, a], [, b]) => (a.unlockLevel || 1) - (b.unlockLevel || 1));

    for (const [key, config] of weaponEntries) {
        const unlockLv = config.unlockLevel || 1;
        if (playerLevel < unlockLv) continue;

        const currentLevel = weaponManager.getWeaponLevel(key);
        if (currentLevel >= 10) continue;
        if (key === starterWeaponKey && currentLevel === 0) continue;

        const skillName = tSkill('weapons', key, 'name', config.name);
        const skillDesc = tSkill('weapons', key, 'desc', config.description);
        if (currentLevel === 0) {
            if (weaponManager.getOwnedWeapons().length >= 6) continue;
            priorityNew.push({
                type: 'weapon', key,
                name: skillName,
                description: skillDesc,
                isNew: true, level: 0, icon: iconTexture(key),
            });
        } else {
            upgradeOptions.push({
                type: 'weapon', key,
                name: skillName,
                description: `Lv.${currentLevel}  →  Lv.${currentLevel + 1}`,
                isNew: false, level: currentLevel, icon: iconTexture(key),
            });
        }
    }

    for (const [key, config] of Object.entries(PASSIVES)) {
        const currentLevel = player.passiveLevels[config.stat] || 0;
        const passiveName = tSkill('passives', key, 'name', config.name);
        const passiveDesc = tSkill('passives', key, 'desc', config.description);
        passiveOptions.push({
            type: 'passive', key,
            name: passiveName,
            description: passiveDesc + (currentLevel > 0 ? ` (Lv.${currentLevel + 1})` : ''),
            isNew: currentLevel === 0, level: currentLevel, icon: iconTexture(key),
        });
    }

    const result = [];
    if (priorityNew.length > 0) result.push(priorityNew[0]);
    const filler = [...upgradeOptions, ...passiveOptions];
    // Phaser is global in this game bundle
    if (typeof Phaser !== 'undefined') Phaser.Utils.Array.Shuffle(filler);
    else filler.sort(() => Math.random() - 0.5);
    for (const opt of filler) {
        if (result.length >= 3) break;
        result.push(opt);
    }
    for (let i = 1; i < priorityNew.length && result.length < 3; i++) {
        result.push(priorityNew[i]);
    }
    return result;
}
