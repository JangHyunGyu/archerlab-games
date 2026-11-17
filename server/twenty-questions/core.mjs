export const RULESET = 'semantle-ko-v1';
export const SESSION_MS = 24 * 60 * 60 * 1000;
export const HANGUL_WORD_RE = /^[가-힣]{1,15}$/u;
export const MIN_RANKED_GUESSES = 2;
export const MIN_RANKED_SOLVE_MS = 1500;
const NAME_PATTERN = /^[\p{L}\p{N} ._-]{2,16}$/u;
const INVISIBLE_CHARS = /[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/gu;

export function normalizeWord(value) {
    return String(value ?? '').normalize('NFC').trim();
}

export function isValidHangulWord(value) {
    return HANGUL_WORD_RE.test(normalizeWord(value));
}

// 제어문자·보이지 않는 공백·방향 전환 문자를 제거하고 표시 이름을 검증
export function sanitizePlayerName(raw) {
    const cleaned = String(raw ?? '')
        .replace(INVISIBLE_CHARS, '')
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .trim();
    if (!NAME_PATTERN.test(cleaned)) return null;
    const alnumCount = (cleaned.match(/[\p{L}\p{N}]/gu) || []).length;
    if (alnumCount < 2) return null;
    return cleaned;
}

// 게임별 단조 유사도 스케일(9700~10300bp)을 생성해 외부 벡터 지문 대조 꼼수를 차단
export async function deriveSimScale(gameId, secretId) {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`semantle-scale-v1:${gameId}:${secretId}`),
    );
    const bytes = new Uint8Array(digest);
    const value = (bytes[0] << 8) | bytes[1];
    return 9700 + (value % 601);
}

// 원시 코사인 유사도(centipoints)에 게임별 단조 보정 계수를 적용해 순위를 유지한 채 점수 지문을 가림
export function calibrateSim(rawCenti, simScale = 10000, exact = false) {
    if (exact || rawCenti >= 10000) return 10000;
    const scaled = Math.round((rawCenti * (simScale || 10000)) / 10000);
    return Math.max(-9999, Math.min(9999, scaled));
}

// 정답 시 연승 통계와 최단 시간 명예의 전당 등록 자격(2회 이상·1.5초 이상)을 판정
export function nextRecord(player, solvedMs, guessesUsed, now) {
    const streak = (player.streak || 0) + 1;
    const streakGuesses = (player.streak_guesses || 0) + guessesUsed;
    const bestStreak = Math.max(streak, player.best_streak || 0);
    const bestGuesses = streak > (player.best_streak || 0)
        ? streakGuesses
        : streak === (player.best_streak || 0)
            ? Math.min(streakGuesses, player.best_guesses || streakGuesses)
            : (player.best_guesses || 0);

    let unrankedReason = null;
    if (guessesUsed < MIN_RANKED_GUESSES) unrankedReason = 'single_guess';
    else if (solvedMs < MIN_RANKED_SOLVE_MS) unrankedReason = 'too_fast';
    const ranked = unrankedReason === null;

    const prevBestTime = player.best_time_ms ?? null;
    const prevBestTimeGuesses = player.best_time_guesses ?? Number.MAX_SAFE_INTEGER;
    const improved = ranked && (
        prevBestTime === null
        || solvedMs < prevBestTime
        || (solvedMs === prevBestTime && guessesUsed < prevBestTimeGuesses)
    );

    return {
        streak,
        streak_guesses: streakGuesses,
        best_streak: bestStreak,
        best_guesses: bestGuesses,
        best_time_ms: improved ? solvedMs : prevBestTime,
        best_time_guesses: improved ? guessesUsed : (player.best_time_guesses ?? null),
        best_at: improved ? now : (player.best_at || 0),
        improved,
        ranked,
        unrankedReason,
    };
}

export function fault(code, status = 400, retryAfter = 0) {
    return Object.assign(new Error(code), { code, status, retryAfter });
}

export async function fingerprint(value) {
    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(buffer)].map(n => n.toString(16).padStart(2, '0')).join('');
}

export function publicProfile(player) {
    return {
        name: player.name,
        gamesPlayed: player.games_played || 0,
        wins: player.wins || 0,
        giveUps: player.give_ups || 0,
        totalGuesses: player.total_guesses || 0,
        streak: player.streak || 0,
        streakGuesses: player.streak_guesses || 0,
        bestStreak: player.best_streak || 0,
        bestGuesses: player.best_guesses || 0,
        bestTimeMs: player.best_time_ms ?? null,
        bestTimeGuesses: player.best_time_guesses ?? null,
        bestAt: player.best_at || 0,
        activeGame: player.active_game || null,
    };
}
