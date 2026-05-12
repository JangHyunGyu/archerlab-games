import { LANG } from './i18n.js';

const CHARACTER_TEXTS = {
    ko: {
        shadowMonarch: { name: '그림자 군주', archetype: '소환 / 올라운더' },
        lightSwordswoman: { name: '빛의 검사', archetype: '치명 / 고속 근접' },
        whiteTigerBrawler: { name: '백호 투사', archetype: '탱커 / 충격파' },
        flameMage: { name: '화염 마도사', archetype: '광역 / 폭발 화력' },
        sanctuaryHealer: { name: '성역 치유사', archetype: '회복 / 보호막' },
    },
    en: {
        shadowMonarch: { name: 'Shadow Monarch', archetype: 'Summon / All-rounder' },
        lightSwordswoman: { name: 'Light Swordswoman', archetype: 'Critical / Swift Melee' },
        whiteTigerBrawler: { name: 'White Tiger Brawler', archetype: 'Tank / Shockwave' },
        flameMage: { name: 'Flame Mage', archetype: 'Area / Burst Fire' },
        sanctuaryHealer: { name: 'Sanctuary Healer', archetype: 'Recovery / Barrier' },
    },
    ja: {
        shadowMonarch: { name: '影の君主', archetype: '召喚 / 万能型' },
        lightSwordswoman: { name: '光の剣士', archetype: '会心 / 高速近接' },
        whiteTigerBrawler: { name: '白虎闘士', archetype: 'タンク / 衝撃波' },
        flameMage: { name: '炎の魔導士', archetype: '範囲 / 爆発火力' },
        sanctuaryHealer: { name: '聖域の治癒師', archetype: '回復 / バリア' },
    },
};

const MENU_LABELS = {
    ko: { selectedHunter: '선택 캐릭터', hp: 'HP', attack: '공격' },
    en: { selectedHunter: 'SELECTED HUNTER', hp: 'HP', attack: 'ATK' },
    ja: { selectedHunter: '選択中', hp: 'HP', attack: '攻撃' },
};

function langSet(source) {
    return source[LANG] || source.ko;
}

export function getCharacterText(character) {
    const text = langSet(CHARACTER_TEXTS)[character.id] || CHARACTER_TEXTS.ko[character.id] || {};
    return {
        name: text.name || character.name,
        archetype: text.archetype || character.archetype,
    };
}

export function getCharacterMenuLabels() {
    return langSet(MENU_LABELS);
}
