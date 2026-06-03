// 타임 어택 모드: 스테이지/미션 없이 제한시간(3분) 안에 최대 점수를 노린다.
export const TIME_LIMIT = 180; // 제한시간(초) = 3분
export const BOARD_SIZE = 8;

export const TIME_ATTACK = {
  id: 'time-attack',
  name: '타임 어택',
  timeLimit: TIME_LIMIT
};

// 남은 시간을 m:ss 형식 문자열로 변환한다.
export function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
