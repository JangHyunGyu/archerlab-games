const BASE_DROP_INTERVAL_MS = 900;
const MIN_DROP_INTERVAL_MS = 50;
const STAGE_ACCELERATION = 0.2;

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function gravityIntervalMs({
  stageOrdinal = 0,
  level = 1,
  combo = 0,
  gravityScale = 1,
  zoneActive = false,
} = {}) {
  if (zoneActive) return Infinity;

  const stage = Math.max(0, Math.floor(finiteNumber(stageOrdinal, 0)));
  const currentLevel = Math.max(1, Math.floor(finiteNumber(level, 1)));
  const currentCombo = Math.max(0, Math.floor(finiteNumber(combo, 0)));
  const scale = Math.max(0.25, finiteNumber(gravityScale, 1));
  const stageCurve = BASE_DROP_INTERVAL_MS / (1 + stage * STAGE_ACCELERATION);
  const stageFloor = Math.max(MIN_DROP_INTERVAL_MS, 90 - stage * 0.6);
  const levelBoost = Math.min(110, (currentLevel - 1) * 2.4);
  const comboBoost = Math.min(48, currentCombo * 4);

  // A lower gravityScale means gentler gravity, so it must increase the interval.
  return Math.max(stageFloor, stageCurve - levelBoost - comboBoost) / scale;
}
