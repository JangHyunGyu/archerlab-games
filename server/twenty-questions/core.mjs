export const RULESET = 'semantle-ko-sync-v1';
export const LANGS = ['ko', 'en'];
export const DEFAULT_LANG = 'ko';
export const SESSION_MS = 24 * 60 * 60 * 1000;
export const ROUND_MS = 6 * 60 * 60 * 1000;
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const ROUND_EPOCH_MS = Date.parse('2026-11-20T12:00:00+09:00');
export const HANGUL_WORD_RE = /^[가-힣]{1,15}$/u;
export const EN_WORD_RE = /^[a-z]{1,24}$/;
export const MIN_RANKED_GUESSES = 2;
export const MIN_RANKED_SOLVE_MS = 1500;
const NAME_PATTERN = /^[\p{L}\p{N} ._-]{2,16}$/u;
const INVISIBLE_CHARS = /[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/gu;
const roundPermutationCache = new Map();

export function parseLang(raw) {
    if (raw === null || raw === undefined || raw === '' || raw === 'ko') return 'ko';
    if (raw === 'en') return 'en';
    throw fault('invalid_request', 400);
}

export function rulesetFor(lang) {
    return lang === 'en' ? 'semantle-en-sync-v1' : RULESET;
}

export function dbRoundIdFor(lang, slotRoundId) {
    return lang === 'en' ? `en:${slotRoundId}` : slotRoundId;
}

export function normalizeWord(value, lang = 'ko') {
    const normalized = String(value ?? '').normalize('NFC').trim();
    return lang === 'en' ? normalized.toLowerCase() : normalized;
}

export function isValidWord(value, lang = 'ko') {
    const word = normalizeWord(value, lang);
    return lang === 'en' ? EN_WORD_RE.test(word) : HANGUL_WORD_RE.test(word);
}

export function isValidHangulWord(value) {
    return isValidWord(value, 'ko');
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

// KST(UTC+9) 00·06·12·18시 기준 6시간 라운드 슬롯 계산
export function roundSlotAt(nowMs = Date.now()) {
    const shifted = nowMs + KST_OFFSET_MS;
    const slotIndex = Math.floor(shifted / ROUND_MS);
    const startedAt = slotIndex * ROUND_MS - KST_OFFSET_MS;
    const endsAt = startedAt + ROUND_MS;
    const epochSlot = Math.floor((ROUND_EPOCH_MS + KST_OFFSET_MS) / ROUND_MS);
    const roundNo = slotIndex - epochSlot + 1;
    const kst = new Date(startedAt + KST_OFFSET_MS);
    const pad = n => String(n).padStart(2, '0');
    const roundId = `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}T${pad(kst.getUTCHours())}`;
    return { roundId, roundNo, slotIndex, startedAt, endsAt };
}

export function previousRoundSlot(slot) {
    return roundSlotAt(slot.startedAt - 1);
}

// 사이클마다 SHA-256 시드로 전체 어휘 순열을 결정해 중복 없이 라운드 정답 선택
export async function selectRoundSecretIndex(slotIndex, totalSecrets, salt = 'archerlab-semantle-sync-k9v1') {
    if (!Number.isInteger(totalSecrets) || totalSecrets <= 1) return 0;
    const cycle = Math.floor(slotIndex / totalSecrets);
    const pos = ((slotIndex % totalSecrets) + totalSecrets) % totalSecrets;
    const key = `${salt}:${totalSecrets}:${cycle}`;
    let perm = roundPermutationCache.get(key);
    if (!perm) {
        const digest = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(`semantle-round-perm-v1:${key}`),
        );
        const bytes = new Uint8Array(digest);
        let state = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
        const nextRand = () => {
            state = (state + 0x6D2B79F5) >>> 0;
            let t = Math.imul(state ^ (state >>> 15), 1 | state);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        perm = new Uint32Array(totalSecrets);
        for (let i = 0; i < totalSecrets; i++) perm[i] = i;
        for (let i = totalSecrets - 1; i > 0; i--) {
            const j = Math.floor(nextRand() * (i + 1));
            const tmp = perm[i];
            perm[i] = perm[j];
            perm[j] = tmp;
        }
        if (roundPermutationCache.size >= 4) {
            const oldest = roundPermutationCache.keys().next().value;
            roundPermutationCache.delete(oldest);
        }
        roundPermutationCache.set(key, perm);
    } else {
        roundPermutationCache.delete(key);
        roundPermutationCache.set(key, perm);
    }
    return perm[pos];
}

// 라운드별 단조 유사도 스케일(9700~10300bp)로 외부 벡터 지문 대조 차단
export async function deriveSimScale(scopeId, secretId) {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`semantle-scale-v1:${scopeId}:${secretId}`),
    );
    const bytes = new Uint8Array(digest);
    const value = (bytes[0] << 8) | bytes[1];
    return 9700 + (value % 601);
}

// 원시 코사인 유사도(centipoints)에 라운드별 단조 보정 계수를 적용해 순위 보존 및 점수 지문 은닉
export function calibrateSim(rawCenti, simScale = 10000, exact = false) {
    if (exact || rawCenti >= 10000) return 10000;
    const scaled = Math.round((rawCenti * (simScale || 10000)) / 10000);
    return Math.max(-9999, Math.min(9999, scaled));
}

// 정답 시 연속 라운드 연승 통계와 라운드 시작 기준 최단 경과 시간 랭킹 자격(2회 이상·1.5초 이상) 판정
export function nextRecord(player, solvedMs, guessesUsed, roundNo, now) {
    const streak = player.last_won_round_no === roundNo - 1
        ? (player.sync_streak || 0) + 1
        : 1;
    const bestStreak = Math.max(streak, player.sync_best_streak || 0);

    let unrankedReason = null;
    if (guessesUsed < MIN_RANKED_GUESSES) unrankedReason = 'single_guess';
    else if (solvedMs < MIN_RANKED_SOLVE_MS) unrankedReason = 'too_fast';
    const ranked = unrankedReason === null;

    const prevBestTime = player.sync_best_time_ms ?? null;
    const improved = ranked && (prevBestTime === null || solvedMs < prevBestTime);

    return {
        streak,
        best_streak: bestStreak,
        best_time_ms: improved ? solvedMs : prevBestTime,
        best_time_guesses: improved ? guessesUsed : (player.sync_best_time_guesses ?? null),
        best_at: improved ? now : (player.sync_best_at || 0),
        last_won_round_no: roundNo,
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
        hasCustomName: Boolean(player.name_key),
        gamesPlayed: player.games_played || 0,
        wins: player.sync_wins || 0,
        totalGuesses: player.total_guesses || 0,
        streak: player.sync_streak || 0,
        bestStreak: player.sync_best_streak || 0,
        bestTimeMs: player.sync_best_time_ms ?? null,
        bestTimeGuesses: player.sync_best_time_guesses ?? null,
        bestAt: player.sync_best_at || 0,
        activeGame: player.active_game || null,
    };
}
