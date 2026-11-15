export const RULESET = 'twenty-questions-v1';
export const MAX_TURNS = 20;
export const SESSION_MS = 24 * 60 * 60 * 1000;

export function normalize(value) {
    return String(value ?? '').normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

export function normalizeQuestionKey(value) {
    const base = normalize(value);
    const stripped = base.replace(/[?!.~]+$/gu, '').trim();
    return stripped || base;
}

const GUESS_TRIM_RE = /^['"‘’“”`「」『』()[\]<>?!.~,;:]+|['"‘’“”`「」『』()[\]<>?!.~,;:]+$/gu;
const HANGUL_WITH_SPACES_RE = /^[가-힣\s]+$/u;

export function normalizeGuess(value) {
    const base = normalize(value);
    const stripped = base.replace(GUESS_TRIM_RE, '').replace(/\s+/gu, ' ').trim();
    return stripped || base;
}

function guessCandidates(value) {
    const root = normalizeGuess(value);
    if (!root) return [];
    const results = new Set([root]);
    const queue = [root];
    while (queue.length) {
        const current = queue.shift();
        const prefix = /^정답(?:은|이)?\s*[:：]?\s+(.+)$/u.exec(current);
        if (prefix && prefix[1].trim()) {
            const candidate = normalizeGuess(prefix[1]);
            if (candidate && !results.has(candidate)) { results.add(candidate); queue.push(candidate); }
        }
        const koCopula = /^(.+?)(?:인가요|입니까|일까요|이에요|예요|이야|입니다|야)$/u.exec(current);
        if (koCopula && koCopula[1].trim()) {
            const candidate = normalizeGuess(koCopula[1]);
            if (candidate && !results.has(candidate)) { results.add(candidate); queue.push(candidate); }
        }
        const enIsIt = /^is\s+(?:it|this|that)\s+(.+)$/u.exec(current);
        if (enIsIt && enIsIt[1].trim()) {
            const candidate = normalizeGuess(enIsIt[1]);
            if (candidate && !results.has(candidate)) { results.add(candidate); queue.push(candidate); }
        }
        const enArticle = /^(?:a|an|the)\s+(.+)$/u.exec(current);
        if (enArticle && enArticle[1].trim()) {
            const candidate = normalizeGuess(enArticle[1]);
            if (candidate && !results.has(candidate)) { results.add(candidate); queue.push(candidate); }
        }
    }
    return [...results];
}

function compactHangul(value) {
    if (!HANGUL_WITH_SPACES_RE.test(value)) return '';
    const compacted = value.replace(/\s+/gu, '');
    return [...compacted].length >= 2 ? compacted : '';
}

export function isCorrect(answer, input) {
    const accepted = [answer.ko, answer.en, ...(answer.aliasesKo || []), ...(answer.aliasesEn || [])];
    const inputCandidates = guessCandidates(input);
    if (!inputCandidates.length) return false;
    return accepted.some(value => {
        const target = normalizeGuess(value);
        if (!target) return false;
        if (inputCandidates.includes(target)) return true;
        const targetHangul = compactHangul(target);
        return Boolean(targetHangul && inputCandidates.some(candidate => compactHangul(candidate) === targetHangul));
    });
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
