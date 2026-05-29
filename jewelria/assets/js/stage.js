export const STAGES = [
  { id: 1, name: '루비 아트리움', moves: 22, targetScore: 900, goals: [{ type: 'ruby', count: 10 }], starScores: [900, 1250, 1650] },
  { id: 2, name: '사파이어 갤러리', moves: 24, targetScore: 1250, goals: [{ type: 'sapphire', count: 12 }], starScores: [1250, 1700, 2200] },
  { id: 3, name: '에메랄드 정원', moves: 24, targetScore: 1550, goals: [{ type: 'emerald', count: 12 }, { type: 'topaz', count: 8 }], starScores: [1550, 2050, 2700] },
  { id: 4, name: '토파즈 회랑', moves: 23, targetScore: 1900, goals: [{ type: 'topaz', count: 16 }], starScores: [1900, 2500, 3200] },
  { id: 5, name: '아메시스트 돔', moves: 25, targetScore: 2350, goals: [{ type: 'amethyst', count: 14 }, { type: 'citrine', count: 10 }], starScores: [2350, 3050, 3900] },
  { id: 6, name: '시트린 금고', moves: 26, targetScore: 2900, goals: [{ type: 'citrine', count: 18 }], starScores: [2900, 3750, 4700] },
  { id: 7, name: '프리즘 계단', moves: 25, targetScore: 3450, goals: [{ type: 'ruby', count: 12 }, { type: 'sapphire', count: 12 }, { type: 'emerald', count: 12 }], starScores: [3450, 4450, 5600] },
  { id: 8, name: '왕관의 밤', moves: 28, targetScore: 4300, goals: [{ type: 'topaz', count: 16 }, { type: 'amethyst', count: 16 }, { type: 'citrine', count: 16 }], starScores: [4300, 5500, 6900] }
];

export function getStage(index) {
  return STAGES[Math.max(0, Math.min(index, STAGES.length - 1))];
}

export function getStarsForScore(stage, score, cleared) {
  if (!cleared) return 0;
  let stars = 0;
  for (const threshold of stage.starScores) {
    if (score >= threshold) stars += 1;
  }
  return Math.max(1, Math.min(3, stars));
}

export function isStageCleared(state) {
  if (!state || !state.stage) return false;
  if (state.score < state.stage.targetScore) return false;
  return state.stage.goals.every((goal) => (state.collections[goal.type] || 0) >= goal.count);
}

export function getGoalText(stage) {
  if (!stage.goals.length) return `${stage.targetScore.toLocaleString()}점 달성`;
  return `${stage.targetScore.toLocaleString()}점 + 보석 수집`;
}
