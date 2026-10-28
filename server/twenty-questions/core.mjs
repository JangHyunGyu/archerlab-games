export const RULESET = 'twenty-questions-v1';
export const MAX_TURNS = 20;
export const SESSION_MS = 24 * 60 * 60 * 1000;

export function normalize(value) {
    return String(value ?? '').normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

export function isCorrect(answer, input) {
    const accepted = [answer.ko, answer.en, ...(answer.aliasesKo || []), ...(answer.aliasesEn || [])];
    return accepted.some(value => normalize(value) === normalize(input));
}

export function publicAnswer(answer) {
    return { ko: answer.ko, en: answer.en, category: answer.category, source: answer.source || null };
}

export function nextRecord(player, used, now) {
    const streak = player.streak + 1;
    const turns = player.streak_turns + used;
    const improved = streak > player.best_streak || (streak === player.best_streak && turns < player.best_turns);
    return {
        streak, streak_turns: turns,
        best_streak: improved ? streak : player.best_streak,
        best_turns: improved ? turns : player.best_turns,
        best_at: improved ? now : player.best_at,
        improved,
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
        name: player.name, streak: player.streak, streakTurns: player.streak_turns,
        bestStreak: player.best_streak, bestTurns: player.best_turns,
        bestAt: player.best_at, activeGame: player.active_game || null,
    };
}
