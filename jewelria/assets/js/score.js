const BASE_PER_GEM = 10;
const FOUR_MATCH_BONUS = 20;
const FIVE_MATCH_BONUS = 50;
const SIMULTANEOUS_BONUS = 20;
const SPECIAL_BONUS = 50;
const COMBO_STEP = 0.5;

export function scoreBatch({ removedCount, longest, lineCount, specialActivations, combo }) {
  const base = removedCount * BASE_PER_GEM;
  const lengthBonus = longest >= 5 ? FIVE_MATCH_BONUS : longest >= 4 ? FOUR_MATCH_BONUS : 0;
  const multiLineBonus = Math.max(0, lineCount - 1) * SIMULTANEOUS_BONUS;
  const specialBonus = specialActivations * SPECIAL_BONUS;
  const multiplier = 1 + Math.max(0, combo - 1) * COMBO_STEP;
  const raw = base + lengthBonus + multiLineBonus + specialBonus;
  const delta = Math.floor(raw * multiplier);
  return {
    base,
    lengthBonus,
    multiLineBonus,
    specialBonus,
    multiplier,
    delta,
    event: {
      type: 'match',
      removed: removedCount,
      longest,
      lines: lineCount,
      special: specialActivations,
      combo,
      delta
    }
  };
}
