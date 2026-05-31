const PREFIX = 'jewelria';
const PROGRESS_KEY = `${PREFIX}.progress.v1`;
const SAVE_KEY = `${PREFIX}.save.v1`;
const SOUND_KEY = `${PREFIX}.sound`;
const NICK_KEY = `${PREFIX}.nick`;
const LOCAL_RANK_KEY = `${PREFIX}.localRanks.v1`;

const DEFAULT_PROGRESS = { currentStage: 1, stages: {} };

export function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return clone(DEFAULT_PROGRESS);
    return { ...clone(DEFAULT_PROGRESS), ...JSON.parse(raw) };
  } catch {
    return clone(DEFAULT_PROGRESS);
  }
}

export function saveProgress(progress) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch {}
}

export function updateStageProgress(stageId, score, stars) {
  const progress = loadProgress();
  const prev = progress.stages[String(stageId)] || { bestScore: 0, stars: 0 };
  progress.stages[String(stageId)] = {
    bestScore: Math.max(prev.bestScore || 0, score || 0),
    stars: Math.max(prev.stars || 0, stars || 0)
  };
  if (stars > 0) progress.currentStage = Math.max(progress.currentStage || 1, stageId + 1);
  saveProgress(progress);
  return progress;
}

export function getTotalStars(progress) {
  return Object.values(progress?.stages || {}).reduce((sum, item) => sum + (item.stars || 0), 0);
}

// 한 판(run) 누적 총점의 최고 기록을 갱신한다. (A안: 글로벌 랭킹 기준 점수)
export function updateRunBest(total) {
  const progress = loadProgress();
  progress.bestRun = Math.max(Number(progress.bestRun || 0), Number(total || 0));
  saveProgress(progress);
  return progress;
}

export function getBestScore(progress) {
  const runBest = Number(progress?.bestRun || 0);
  const stageBest = Object.values(progress?.stages || {}).reduce((best, item) => Math.max(best, item.bestScore || 0), 0);
  return Math.max(runBest, stageBest);
}

export function isStageUnlocked(progress, stageId) {
  if (stageId <= 1) return true;
  return !!progress?.stages?.[String(stageId - 1)]?.stars;
}

export function saveGame(snapshot) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...snapshot, savedAt: Date.now() })); } catch {}
}

export function loadSavedGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.stageId ? parsed : null;
  } catch {
    return null;
  }
}

export function clearSavedGame() {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
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
    if (!prev || row.score > prev.score) bestByName.set(key, row);
  }
  const sorted = [...bestByName.values()].sort((a, b) => b.score - a.score || a.created_at.localeCompare(b.created_at)).slice(0, 20);
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
