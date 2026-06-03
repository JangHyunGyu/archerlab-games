const PREFIX = 'jewelria';
const BEST_KEY = `${PREFIX}.best.v1`;
const SOUND_KEY = `${PREFIX}.sound`;
const NICK_KEY = `${PREFIX}.nick`;
const LOCAL_RANK_KEY = `${PREFIX}.localRanks.v1`;

export function getBestScore() {
  try { return Math.max(0, Math.floor(Number(localStorage.getItem(BEST_KEY)) || 0)); } catch { return 0; }
}

// 타임 어택 최고 점수를 갱신하고 갱신된 값을 반환한다.
export function updateBestScore(score) {
  const best = Math.max(getBestScore(), Math.floor(Number(score) || 0));
  try { localStorage.setItem(BEST_KEY, String(best)); } catch {}
  return best;
}

export function loadSoundEnabled() {
  try { return localStorage.getItem(SOUND_KEY) !== '0'; } catch { return true; }
}

export function saveSoundEnabled(enabled) {
  try { localStorage.setItem(SOUND_KEY, enabled ? '1' : '0'); } catch {}
}

export function loadNickname() {
  try { return localStorage.getItem(NICK_KEY) || ''; } catch { return ''; }
}

export function saveNickname(name) {
  try { localStorage.setItem(NICK_KEY, name); } catch {}
}

export function saveLocalRank(name, score, extra = {}) {
  const rows = loadLocalRanks();
  rows.push({
    player_name: name,
    score: Math.max(0, Math.floor(score || 0)),
    extra_data: extra,
    created_at: new Date().toISOString()
  });
  const bestByName = new Map();
  for (const row of rows) {
    const key = row.player_name.trim().toLowerCase();
    const prev = bestByName.get(key);
    if (!prev || compareRankRows(row, prev) < 0) bestByName.set(key, row);
  }
  const sorted = [...bestByName.values()].sort(compareRankRows).slice(0, 20);
  try { localStorage.setItem(LOCAL_RANK_KEY, JSON.stringify(sorted)); } catch {}
  return sorted;
}

export function loadLocalRanks() {
  try {
    const raw = localStorage.getItem(LOCAL_RANK_KEY);
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function compareRankRows(a, b) {
  return Number(b.score || 0) - Number(a.score || 0)
    || String(a.created_at || '').localeCompare(String(b.created_at || ''));
}
