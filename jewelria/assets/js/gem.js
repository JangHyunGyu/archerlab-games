export const GEM_TYPES = [
  { id: 'ruby', name: '루비', en: 'Ruby', ja: 'ルビー', cssClass: 'gem-ruby', image: 'assets/images/gems/ruby.png', color: '#e91e3e', shapePath: 'polygon(50% 3%, 85% 16%, 97% 50%, 83% 86%, 50% 98%, 17% 86%, 3% 50%, 15% 16%)' },
  { id: 'sapphire', name: '사파이어', en: 'Sapphire', ja: 'サファイア', cssClass: 'gem-sapphire', image: 'assets/images/gems/sapphire.png', color: '#1976ff', shapePath: 'polygon(50% 0%, 95% 50%, 50% 100%, 5% 50%)' },
  { id: 'emerald', name: '에메랄드', en: 'Emerald', ja: 'エメラルド', cssClass: 'gem-emerald', image: 'assets/images/gems/emerald.png', color: '#14bb54', shapePath: 'polygon(22% 3%, 78% 3%, 97% 22%, 97% 78%, 78% 97%, 22% 97%, 3% 78%, 3% 22%)' },
  { id: 'topaz', name: '토파즈', en: 'Topaz', ja: 'トパーズ', cssClass: 'gem-topaz', image: 'assets/images/gems/topaz.png', color: '#ffe52a', shapePath: 'polygon(50% 0%, 92% 34%, 78% 96%, 22% 96%, 8% 34%)' },
  { id: 'amethyst', name: '아메시스트', en: 'Amethyst', ja: 'アメシスト', cssClass: 'gem-amethyst', image: 'assets/images/gems/amethyst.png', color: '#9c42e8', shapePath: 'polygon(50% 2%, 91% 22%, 82% 88%, 50% 100%, 18% 88%, 9% 22%)' },
  { id: 'citrine', name: '시트린', en: 'Citrine', ja: 'シトリン', cssClass: 'gem-citrine', image: 'assets/images/gems/citrine.png', color: '#ff5a12', shapePath: 'polygon(50% 0%, 90% 24%, 99% 78%, 50% 100%, 1% 78%, 10% 24%)' }
];

export const GEM_BY_ID = Object.fromEntries(GEM_TYPES.map((gem) => [gem.id, gem]));

export function createGem(type, special = null) {
  return { id: `${type}-${Math.random().toString(36).slice(2, 9)}`, type, special };
}

export function randomGemType(rng = Math.random) {
  return GEM_TYPES[Math.floor(rng() * GEM_TYPES.length)].id;
}

export function randomGem(rng = Math.random) {
  return createGem(randomGemType(rng));
}

export function getGemName(type, lang = 'ko') {
  const gem = GEM_BY_ID[type];
  if (!gem) return type;
  if (lang === 'en') return gem.en;
  if (lang === 'ja') return gem.ja;
  return gem.name;
}

export function getGemCssVars(type) {
  const gem = GEM_BY_ID[type];
  if (!gem) return '';
  return `--gem-bg:${gem.color};--gem-shape:${gem.shapePath}`;
}
