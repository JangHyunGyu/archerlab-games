import { messages, translation } from './i18n.mjs?v=20261124-v14';
import { request, requestId, storage, reportException } from './api.mjs?v=20261124-v14';
import { GameAudio } from './audio.mjs?v=20261124-v14';

const locale = document.documentElement.lang === 'en' ? 'en' : 'ko';
const t = translation(locale);
const langKey = key => (locale === 'en' ? `en_${key}` : key);
const $ = id => document.getElementById(id);
const audio = new GameAudio();

const ROUND_DURATION_SECONDS = 6 * 3600;
const blankProfile = {
    name: '',
    hasCustomName: false,
    gamesPlayed: 0,
    wins: 0,
    totalGuesses: 0,
    streak: 0,
    bestStreak: 0,
    bestTimeMs: null,
    bestTimeGuesses: null,
    activeGame: null,
};

let state = { profile: blankProfile, round: null, game: null };
let busy = false;
let noticeTimer;
let countdownTimer = 0;
let serverClockOffset = 0;
let composing = false;
let screen = 'title';
let mutationEpoch = 0;
let pendingCommand;
let latestHighlightWord = null;
let sortState = { key: 'similarity', dir: 'desc' };
let nearestWords = [];
let nearestKey = null;
let rankingRequestSeq = 0;
let rankingSort = 'wins';
let rolloverInFlight = false;
let rolloverRoundId = null;
let rolloverRetryAt = 0;
let syncKeyboard = () => {};
let sendPointer = null;
let sendSubmittedByForm = false;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const isTouchDevice = () => window.matchMedia('(hover: none), (pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const vfxParticles = [];
const vfxRings = [];
let vfxFrame = 0;

function ensureVfxCanvasSize() {
    const canvas = $('vfx-canvas');
    if (!canvas) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(window.innerWidth * dpr);
    const h = Math.round(window.innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
    }
    return { canvas, ctx: canvas.getContext('2d'), dpr };
}

function stepVfx() {
    vfxFrame = 0;
    const setup = ensureVfxCanvasSize();
    if (!setup || !setup.ctx) return;
    const { canvas, ctx, dpr } = setup;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    ctx.globalCompositeOperation = 'lighter';

    for (let i = vfxRings.length - 1; i >= 0; i--) {
        const ring = vfxRings[i];
        ring.age += 1 / 60;
        const p = ring.age / ring.life;
        if (p >= 1) {
            vfxRings.splice(i, 1);
            continue;
        }
        const ease = 1 - Math.pow(1 - p, 3);
        const radius = ring.r0 + (ring.r1 - ring.r0) * ease;
        ctx.strokeStyle = ring.color;
        ctx.globalAlpha = (1 - p) * ring.alpha;
        ctx.lineWidth = Math.max(1, ring.width * (1 - p * 0.65));
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
        ctx.stroke();
    }

    for (let i = vfxParticles.length - 1; i >= 0; i--) {
        const pt = vfxParticles[i];
        pt.age += 1 / 60;
        const p = pt.age / pt.life;
        if (p >= 1) {
            vfxParticles.splice(i, 1);
            continue;
        }
        pt.vx *= pt.drag;
        pt.vy = pt.vy * pt.drag + pt.gravity;
        pt.x += pt.vx;
        pt.y += pt.vy;
        const alpha = (1 - p) * pt.alpha;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(0.8, pt.size * (1 - p * 0.5)), 0, Math.PI * 2);
        ctx.fill();
    }

    if ((vfxParticles.length || vfxRings.length) && !document.hidden) {
        vfxFrame = requestAnimationFrame(stepVfx);
    } else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

function spawnBurst(x, y, { count, colors, speedMin, speedMax, ringMax, ringWidth = 2.2, gravity = 0.04, innerRadius = 0 }) {
    if (reducedMotion.matches || document.hidden) return;
    vfxRings.push({ x, y, r0: Math.max(14, innerRadius), r1: ringMax, age: 0, life: 0.65, width: ringWidth, alpha: 0.42, color: colors[0] });
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
        const speed = speedMin + Math.random() * (speedMax - speedMin);
        const rStart = innerRadius > 0 ? innerRadius * (0.88 + Math.random() * 0.28) : 0;
        vfxParticles.push({
            x: x + Math.cos(angle) * rStart,
            y: y + Math.sin(angle) * rStart,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.7,
            drag: 0.94,
            gravity,
            age: 0,
            life: 0.55 + Math.random() * 0.55,
            size: 1.8 + Math.random() * 2.8,
            alpha: 0.75 + Math.random() * 0.25,
            color: colors[i % colors.length],
        });
    }
    if (!vfxFrame) vfxFrame = requestAnimationFrame(stepVfx);
}

// 추측 근접도와 정답 여부에 따라 스프라이트·캔버스·흔들림 복합 이펙트 실행
function triggerGameVfx(event, game) {
    if (reducedMotion.matches || !event || event.replayed) return;
    const anchor = (((game === null || game === void 0 ? void 0 : game.status)) === 'won' ? $('result-banner') : $('resonance-strip')) || $('guess-form');
    const rect = ((anchor === null || anchor === void 0 ? void 0 : anchor.getBoundingClientRect()));
    const cx = rect && rect.width ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const cy = rect && rect.height ? rect.top + rect.height / 2 : window.innerHeight * 0.34;

    if (((game === null || game === void 0 ? void 0 : game.status)) === 'won' && event.code === 'won') {
        const burst = $('vfx-burst');
        if (burst) {
            burst.classList.remove('is-active');
            void burst.offsetWidth;
            burst.classList.add('is-active');
        }
        spawnBurst(cx, cy, {
            count: 96,
            colors: ['#ffe6a8', '#f7c04a', '#57e0ff', '#fff8de'],
            speedMin: 2.2,
            speedMax: 7.4,
            ringMax: 240,
            ringWidth: 2.2,
            gravity: 0.055,
            innerRadius: 86,
        });
        setTimeout(() => {
            vfxRings.push({ x: cx, y: cy, r0: 82, r1: 280, age: 0, life: 0.85, width: 1.8, alpha: 0.35, color: '#ffe6a8' });
            if (!vfxFrame) vfxFrame = requestAnimationFrame(stepVfx);
        }, 120);
        return;
    }

    if (event.code === 'guess' && event.rank !== null) {
        if (event.rank <= 10) {
            const panel = document.querySelector('.ledger-panel');
            if (panel) {
                panel.classList.remove('is-shake');
                void panel.offsetWidth;
                panel.classList.add('is-shake');
            }
            spawnBurst(cx, cy, {
                count: 58,
                colors: ['#ff8647', '#ffe6a8', '#f7c04a'],
                speedMin: 1.8,
                speedMax: 5.8,
                ringMax: 165,
                ringWidth: 2,
                gravity: 0.03,
                innerRadius: 42,
            });
        } else if (event.rank <= 100) {
            spawnBurst(cx, cy, {
                count: 34,
                colors: ['#f7c04a', '#ff8647', '#ffe6a8'],
                speedMin: 1.4,
                speedMax: 4.5,
                ringMax: 120,
                ringWidth: 1.6,
                gravity: 0.02,
                innerRadius: 42,
            });
        } else {
            spawnBurst(cx, cy, {
                count: 20,
                colors: ['#b68bff', '#57e0ff', '#ffe6a8'],
                speedMin: 1.1,
                speedMax: 3.4,
                ringMax: 92,
                ringWidth: 1.4,
                gravity: 0.01,
                innerRadius: 42,
            });
        }
    }
}

try { pendingCommand = JSON.parse(storage.get(langKey('pending')) || 'null'); } catch (_err) { pendingCommand = null; }

const settings = {
    darkMode: storage.get('darkMode') !== 'false',
    shareGuesses: storage.get('shareGuesses') !== 'false',
    shareTime: storage.get('shareTime') !== 'false',
    shareMax: storage.get('shareMax') !== 'false',
};

function applyTheme() {
    document.documentElement.dataset.theme = settings.darkMode ? 'dark' : 'light';
}
applyTheme();

function notify(key, values = {}, permanent = false) {
    clearTimeout(noticeTimer);
    const text = Object.prototype.hasOwnProperty.call(messages[locale], key) ? t(key, values) : t('network_error');
    $('notice').textContent = text;
    $('notice').hidden = false;
    if (!permanent) noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 5500);
}

function notifyRoundReset(round, event) {
    const roundNo = (round && round.roundNo) ? round.roundNo : '';
    const prevWord = (event && event.previousAnswer)
        || (round && round.previous && round.previous.answer)
        || '';
    if (prevWord) {
        notify('round_reset_with_answer', { no: roundNo, word: prevWord });
    } else {
        notify('round_reset', { no: roundNo });
    }
}

function showTurnFeedback(key, values = {}, kind = 'info') {
    const el = $('turn-feedback');
    if (!key) {
        el.hidden = true;
        el.textContent = '';
        el.dataset.kind = '';
        return;
    }
    el.textContent = t(key, values);
    el.dataset.kind = kind;
    el.hidden = false;
}

const SESSION_VIEW_KEY = locale === 'en' ? 'archerlab_semantle_en_session_view' : 'archerlab_semantle_session_view';

function getSessionView() {
    try {
        return sessionStorage.getItem(SESSION_VIEW_KEY) || 'title';
    } catch (_err) {
        return 'title';
    }
}

function setSessionView(next) {
    try {
        sessionStorage.setItem(SESSION_VIEW_KEY, next);
    } catch (_err) {}
}

function changeScreen(next) {
    const changed = next !== screen;
    screen = next;
    document.body.dataset.screen = next;
    $('title-screen').hidden = next !== 'title';
    $('game-screen').hidden = next !== 'game';
    setSessionView(next);
    if (changed) window.scrollTo({ top: 0, behavior: 'instant' });
    syncKeyboard();
}

let guessLoadingHideTimer = 0;

function startGuessLoading() {
    clearTimeout(guessLoadingHideTimer);
    guessLoadingHideTimer = 0;
    const slot = $('composer-status-slot');
    const gl = $('guess-loading');
    ((slot === null || slot === void 0 ? void 0 : slot.classList.add('is-loading')));
    if (gl) {
        gl.hidden = false;
        gl.dataset.phase = 'idle';
        void gl.offsetWidth;
        gl.dataset.phase = 'loading';
    }
}

function finishGuessLoading(immediate = false) {
    clearTimeout(guessLoadingHideTimer);
    const slot = $('composer-status-slot');
    const gl = $('guess-loading');
    if (!gl || gl.hidden || immediate) {
        if (gl) {
            gl.dataset.phase = 'idle';
            gl.hidden = true;
        }
        ((slot === null || slot === void 0 ? void 0 : slot.classList.remove('is-loading')));
        return;
    }
    gl.dataset.phase = 'done';
    guessLoadingHideTimer = setTimeout(() => {
        gl.dataset.phase = 'idle';
        gl.hidden = true;
        ((slot === null || slot === void 0 ? void 0 : slot.classList.remove('is-loading')));
    }, 240);
}

function setBusy(value) {
    busy = value;
    for (const id of ['start', 'send', 'home', 'open-nearest', 'open-ranking-result', 'share-result', 'prev-answer-btn', 'hero-prev-nearest', 'current-solver-btn', 'result-name-save']) {
        const el = $(id);
        if (el) el.disabled = value;
    }
    $('guess-input').setAttribute('aria-busy', String(value));
    $('guess-form').setAttribute('aria-busy', String(value));
    for (const link of document.querySelectorAll('.languages a')) link.setAttribute('aria-disabled', String(value));
}

// 서버 기준 6시간 라운드 종료 시각까지 남은 시간(ms) 계산
function remainingRoundMs() {
    const endsAt = state.round ? state.round.endsAt : null;
    if (!Number.isFinite(endsAt)) return 0;
    return Math.max(0, endsAt - (Date.now() + serverClockOffset));
}

function formatCountdown(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '00:00:00';
    const cappedSec = Math.min(ROUND_DURATION_SECONDS, Math.ceil(ms / 1000));
    const h = Math.floor(cappedSec / 3600);
    const m = Math.floor((cappedSec % 3600) / 60);
    const s = cappedSec % 60;
    const pad = n => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatRecordTime(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '-';
    const totalCenti = Math.round(ms / 10);
    const cc = totalCenti % 100;
    const totalSec = Math.floor(totalCenti / 100);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}.${pad(cc)}` : `${pad(m)}:${pad(s)}.${pad(cc)}`;
}

function clearLocalRoundProgress() {
    const nearestDlg = $('nearest-dialog');
    if (nearestDlg && nearestDlg.open) nearestDlg.close();
    const burst = $('vfx-burst');
    if (burst) burst.classList.remove('is-active');
    if ($('guess-input')) $('guess-input').value = '';
    if ($('result-name-status')) $('result-name-status').textContent = '';
    storage.remove(langKey('draft'));
    pendingCommand = null;
    storage.remove(langKey('pending'));
    latestHighlightWord = null;
    nearestWords = [];
    nearestKey = null;
    showTurnFeedback(null);
}

// 6시간 정각 도달 시 진행 중 화면과 추측 기록을 새 라운드로 강제 전환
async function handleRoundRollover(expiredRoundId) {
    if (busy || rolloverInFlight) return;
    rolloverInFlight = true;
    rolloverRoundId = expiredRoundId;
    const epoch = mutationEpoch;
    try {
        const gameId = (state.game && state.game.id) || storage.get(langKey('game'));
        const data = (screen === 'game' && gameId)
            ? await request(`games/${gameId}`)
            : await request('profile');
        if (epoch !== mutationEpoch) return;
        if (data.round && data.round.id === expiredRoundId) {
            rolloverRoundId = null;
            rolloverRetryAt = Date.now() + 1000;
            render(data, { navigate: screen === 'game' });
            return;
        }
        rolloverRoundId = null;
        rolloverRetryAt = 0;
        clearLocalRoundProgress();
        render(data, { navigate: screen === 'game' });
        if ($('ranking-dialog') && $('ranking-dialog').open) showRanking();
        if (!(data.event && data.event.code === 'round_reset')) {
            notifyRoundReset(data.round, null);
        }
    } catch (_err) {
        rolloverRoundId = null;
        rolloverRetryAt = Date.now() + 2000;
    } finally {
        rolloverInFlight = false;
    }
}

function tickTimer() {
    const round = state.round;
    const gameTimerEl = $('game-timer');
    const heroTimerEl = $('hero-countdown');
    const resultNextEl = $('result-next-timer');
    if (!round) {
        if (gameTimerEl) gameTimerEl.textContent = '06:00:00';
        if (heroTimerEl) heroTimerEl.textContent = '06:00:00';
        if (resultNextEl) resultNextEl.textContent = '06:00:00';
        return;
    }
    const remMs = remainingRoundMs();
    const text = formatCountdown(remMs);
    if (gameTimerEl) gameTimerEl.textContent = text;
    if (heroTimerEl) heroTimerEl.textContent = text;
    if (resultNextEl) resultNextEl.textContent = text;

    if (remMs <= 0 && !busy && !rolloverInFlight && Date.now() >= rolloverRetryAt) {
        if (rolloverRoundId !== round.id) {
            handleRoundRollover(round.id);
        }
    }
}

function syncCountdownLoop() {
    if (state.round) {
        tickTimer();
        if (!countdownTimer) countdownTimer = setInterval(tickTimer, 250);
    } else {
        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = 0;
        }
        tickTimer();
    }
}

function thermalClass(entry) {
    if (entry.rank === 0 || entry.similarity >= 99.99) return 'tier-exact';
    if (entry.rank !== null && entry.rank <= 10) return 'tier-molten';
    if (entry.rank !== null && entry.rank <= 100) return 'tier-hot';
    if (entry.rank !== null && entry.rank <= 1000) return 'tier-warm';
    if (entry.similarity > 0) return 'tier-cool';
    return 'tier-cold';
}

function closenessLabel(entry) {
    var __oc2, __oc3, __oc4;
    if (entry.rank === 0) return t('rank_exact');
    if (entry.rank !== null) {
        const tierKey = entry.rank <= 10 ? 'tier_molten' : entry.rank <= 100 ? 'tier_hot' : 'tier_warm';
        return `${t('rank_badge', { rank: entry.rank })} · ${t(tierKey)}`;
    }
    const cutoff = (((__oc4 = (__oc3 = (__oc2 = state.game) === null || __oc2 === void 0 ? void 0 : __oc2.benchmarks) === null || __oc3 === void 0 ? void 0 : __oc3.top1000) !== null && __oc4 !== void 0 ? __oc4 : 30));
    const feelKey = entry.similarity >= cutoff * 0.65
        ? 'tier_lukewarm'
        : entry.similarity >= 0
            ? 'tier_cool'
            : 'tier_cold';
    return `${t('rank_outside')} · ${t(feelKey)}`;
}

function meterPercent(entry) {
    if (entry.rank === 0 || entry.similarity >= 99.99) return 100;
    if (entry.rank !== null) return Math.max(6, Math.min(100, (1001 - entry.rank) / 10));
    return Math.max(0, Math.min(4, (entry.similarity + 20) * 0.05));
}

function buildGuessRow(entry, { pinned = false, isNew = false } = {}) {
    const tr = document.createElement('tr');
    tr.className = `${thermalClass(entry)}${pinned ? ' latest-guess' : ''}${isNew ? ' is-new' : ''}`;
    tr.dataset.word = entry.word;

    const tdNo = document.createElement('td');
    tdNo.className = 'col-no';
    tdNo.textContent = String(entry.guessNo);

    const tdWord = document.createElement('td');
    tdWord.className = 'col-word';
    const wordText = document.createElement('span');
    wordText.className = 'word-text';
    wordText.textContent = entry.word;
    tdWord.append(wordText);
    if (pinned) {
        const pill = document.createElement('span');
        pill.className = 'latest-pill';
        pill.textContent = t('latest_pill');
        tdWord.append(pill);
    }

    const tdSim = document.createElement('td');
    tdSim.className = 'col-sim';
    tdSim.textContent = entry.similarity.toFixed(2);

    const tdRank = document.createElement('td');
    tdRank.className = 'col-rank';
    if (entry.rank === 0) {
        const badge = document.createElement('span');
        badge.className = 'rank-badge is-exact';
        badge.textContent = t('rank_exact');
        tdRank.append(badge);
    } else if (entry.rank !== null) {
        const wrap = document.createElement('div');
        wrap.className = 'rank-meter-wrap';
        const badge = document.createElement('span');
        badge.className = 'rank-badge';
        badge.textContent = closenessLabel(entry);
        const bar = document.createElement('div');
        bar.className = 'sim-meter';
        const fill = document.createElement('i');
        fill.style.width = `${meterPercent(entry).toFixed(1)}%`;
        bar.append(fill);
        wrap.append(badge, bar);
        tdRank.append(wrap);
    } else {
        const out = document.createElement('span');
        out.className = 'rank-outside';
        out.textContent = closenessLabel(entry);
        tdRank.append(out);
    }

    tr.append(tdNo, tdWord, tdSim, tdRank);
    return tr;
}

function sortGuesses(guesses) {
    const list = [...guesses];
    const mul = sortState.dir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
        if (sortState.key === 'word') return a.word.localeCompare(b.word, locale) * mul;
        if (sortState.key === 'guessNo') return (a.guessNo - b.guessNo) * mul;
        const diff = a.similarity - b.similarity;
        if (Math.abs(diff) > 0.0001) return diff * mul;
        return a.guessNo - b.guessNo;
    });
    return list;
}

function updateSortHeaders() {
    for (const btn of document.querySelectorAll('[data-sort]')) {
        const th = btn.closest('th');
        const active = btn.dataset.sort === sortState.key;
        th.setAttribute('aria-sort', active ? (sortState.dir === 'asc' ? 'ascending' : 'descending') : 'none');
        btn.classList.toggle('is-sorted', active);
        btn.dataset.dir = active ? sortState.dir : '';
    }
}

function renderGuessesTable(game, isNewGuess = false) {
    const body = $('guesses-body');
    const guesses = game.guesses || [];
    $('empty-history').hidden = guesses.length > 0;
    $('guesses-table').hidden = guesses.length === 0;
    updateSortHeaders();

    if (!guesses.length) {
        body.replaceChildren();
        return;
    }

    const latest = guesses.reduce((acc, g) => (!acc || g.guessNo > acc.guessNo ? g : acc), null);
    const pinnedWord = latestHighlightWord && guesses.some(g => g.word === latestHighlightWord)
        ? guesses.find(g => g.word === latestHighlightWord)
        : latest;

    const fragment = document.createDocumentFragment();
    if (pinnedWord) {
        fragment.append(buildGuessRow(pinnedWord, { pinned: true, isNew: isNewGuess }));
        const sep = document.createElement('tr');
        sep.className = 'delimiter';
        const td = document.createElement('td');
        td.colSpan = 4;
        sep.append(td);
        fragment.append(sep);
    }

    const sorted = sortGuesses(guesses);
    for (const entry of sorted) {
        fragment.append(buildGuessRow(entry));
    }
    body.replaceChildren(fragment);
}

function renderResonanceBar(game) {
    const fill = $('resonance-fill');
    const label = $('resonance-text');
    if (game.status === 'won') {
        fill.style.width = '100%';
        fill.dataset.tier = 'exact';
        label.textContent = t('resonance_won');
        return;
    }
    const guesses = game.guesses || [];
    if (!guesses.length) {
        fill.style.width = '0%';
        fill.dataset.tier = 'idle';
        label.textContent = t('resonance_idle');
        return;
    }
    const best = guesses.reduce((a, b) => (b.similarity > a.similarity ? b : a), guesses[0]);
    const pct = best.rank !== null
        ? Math.max(12, Math.min(98, 12 + ((1001 - best.rank) / 1000) * 86))
        : Math.max(2, Math.min(11, ((best.similarity + 20) / 60) * 11));
    fill.style.width = `${pct.toFixed(1)}%`;
    fill.dataset.tier = best.rank !== null ? (best.rank <= 10 ? 'molten' : best.rank <= 100 ? 'hot' : 'warm') : 'cold';
    const rankStr = closenessLabel(best);
    label.textContent = t('resonance_best', { word: best.word, sim: best.similarity.toFixed(2), rank: rankStr });
}

function displaySolverName(entry) {
    return (entry && entry.hasCustomName && entry.name) ? entry.name : t('anonymous_solver');
}

function formatSolverSummary(round) {
    if (!round || !round.solverCount || !round.firstSolver) {
        return { text: t('solver_none'), title: '', hasSolver: false };
    }
    const first = round.firstSolver;
    const solverName = displaySolverName(first);
    const text = round.solverCount > 1
        ? t('solver_more', { name: solverName, others: round.solverCount - 1 })
        : solverName;
    const title = t('solver_tooltip', {
        name: solverName,
        time: formatRecordTime(first.solvedMs),
    });
    return { text, title, hasSolver: true };
}

function renderRoundInfo(round) {
    const solver = formatSolverSummary(round);
    if ($('hero-solver')) {
        $('hero-solver').textContent = solver.text;
        $('hero-solver').title = solver.title;
    }
    if ($('current-solver-display')) {
        $('current-solver-display').textContent = solver.text;
    }
    if ($('current-solver-btn')) {
        $('current-solver-btn').title = solver.title;
        $('current-solver-btn').classList.toggle('has-solver', solver.hasSolver);
    }

    const prev = round && round.previous ? round.previous : null;
    if ($('hero-prev-round')) {
        $('hero-prev-round').hidden = !prev;
        if (prev) {
            $('hero-prev-label').textContent = t('prev_answer_label', { no: prev.roundNo });
            $('hero-prev-answer').textContent = prev.answer;
        }
    }
    if ($('prev-answer-btn')) {
        $('prev-answer-btn').hidden = !prev;
        if (prev) {
            $('prev-answer-btn-text').textContent = t('prev_answer_badge', { word: prev.answer });
            $('prev-answer-btn').title = `${t('prev_answer_label', { no: prev.roundNo })}: ${prev.answer}`;
        }
    }
}

// 현재 라운드 진행 상태에 따라 로비 시작 버튼 문구 전환
function updateStartButton(game) {
    const startBtn = $('start');
    if (!startBtn || !startBtn.firstElementChild) return;
    if (game && game.status === 'active' && game.guessCount > 0) {
        startBtn.firstElementChild.textContent = t('resume');
    } else if (game && game.status === 'won') {
        startBtn.firstElementChild.textContent = t('view_result');
    } else {
        startBtn.firstElementChild.textContent = t('start');
    }
}

function render(data, { navigate = true, effects = false } = {}) {
    var __oc5, __oc6, __oc7, __oc8, __oc9, __ocPrev;
    if (data.game && (((__oc5 = state.game) === null || __oc5 === void 0 ? void 0 : __oc5.id)) === data.game.id && data.game.version < state.game.version) return;
    if (Number.isFinite(data.serverNow)) {
        serverClockOffset = data.serverNow - Date.now();
    }
    effects = effects && !(((__oc6 = data.event) === null || __oc6 === void 0 ? void 0 : __oc6.replayed));
    const prevGameId = (((__oc7 = state.game) === null || __oc7 === void 0 ? void 0 : __oc7.id));
    const prevRoundId = (((__ocPrev = state.round) === null || __ocPrev === void 0 ? void 0 : __ocPrev.id));
    state = data;
    const profile = data.profile || blankProfile;

    if ($('hero-wins')) $('hero-wins').textContent = String(profile.wins || 0);
    updateStartButton(data.game);
    renderRoundInfo(data.round);

    if (prevRoundId && data.round && data.round.id !== prevRoundId) {
        clearLocalRoundProgress();
    }
    if (data.event && data.event.code === 'round_reset') {
        clearLocalRoundProgress();
        notifyRoundReset(data.round, data.event);
    }

    if (!data.game) {
        if ($('guesses-body')) $('guesses-body').replaceChildren();
        if ($('guesses-table')) $('guesses-table').hidden = true;
        if ($('empty-history')) $('empty-history').hidden = false;
        if ($('result-banner')) $('result-banner').hidden = true;
        if (screen === 'game' && navigate === false) changeScreen('title');
        syncCountdownLoop();
        return;
    }

    const game = data.game;
    storage.remove(langKey('start_request'));
    storage.remove(langKey('start_locale'));
    storage.set(langKey('game'), game.id);

    if (game.id !== prevGameId) {
        latestHighlightWord = null;
        nearestWords = [];
        nearestKey = null;
        if (!(data.event && data.event.code === 'round_reset')) {
            showTurnFeedback(null);
        }
    }

    if ((((__oc8 = data.event) === null || __oc8 === void 0 ? void 0 : __oc8.word)) && ['guess', 'duplicate', 'won'].includes(data.event.code)) {
        latestHighlightWord = data.event.word;
    }

    if (navigate) changeScreen('game');

    const active = game.status === 'active';
    const finished = !active;
    $('game-screen').dataset.status = game.status;
    $('case-label').textContent = t('case_badge', { no: (data.round && data.round.roundNo) || game.roundNo || game.caseNo });
    $('guess-count-display').textContent = String(game.guessCount);

    if (game.benchmarks) {
        $('top1-score').textContent = game.benchmarks.top1.toFixed(2);
        $('top10-score').textContent = game.benchmarks.top10.toFixed(2);
        $('top1000-score').textContent = game.benchmarks.top1000.toFixed(2);
    }

    renderResonanceBar(game);
    renderGuessesTable(game, effects && ['guess', 'won'].includes((((__oc9 = data.event) === null || __oc9 === void 0 ? void 0 : __oc9.code))));
    syncCountdownLoop();

    $('guess-input').placeholder = t(active ? 'guess_placeholder' : 'explore_placeholder');
    $('send').firstElementChild.textContent = t(active ? 'send' : 'explore_send');
    $('result-banner').hidden = active;
    $('starter-chips').hidden = finished;

    if (finished) {
        const won = game.status === 'won';
        $('result-banner').classList.toggle('is-won', won);
        $('result-title').textContent = t('won_title');
        $('result-answer').textContent = game.answer || '';
        $('record-badge').hidden = !won || !game.recordImproved;
        const unranked = won && !game.ranked;
        $('unranked-note').hidden = !unranked;
        if (unranked) {
            $('unranked-note').textContent = t(game.unrankedReason === 'too_fast' ? 'unranked_too_fast' : 'unranked_single_guess');
        }
        const elapsed = Number.isFinite(game.solvedMs) ? game.solvedMs : 0;
        $('result-time').textContent = formatRecordTime(elapsed);
        $('result-guesses').textContent = String(game.guessCount);
        $('result-next-timer').textContent = formatCountdown(remainingRoundMs());
        $('result-streak').textContent = String(profile.streak);

        const nameForm = $('result-name-form');
        if (nameForm) {
            nameForm.hidden = !(won && game.ranked);
            $('result-name-label').textContent = t(profile.hasCustomName ? 'result_name_saved_hint' : 'result_name_prompt');
            if (document.activeElement !== $('result-name-input')) {
                $('result-name-input').value = profile.hasCustomName ? profile.name : '';
            }
            if (game.id !== prevGameId) {
                $('result-name-status').textContent = '';
            }
        }
    }

    if (effects) {
        audio.result(data.event, game);
        triggerGameVfx(data.event, game);
    }
    requestAnimationFrame(syncKeyboard);
}

async function recover() {
    var __oc10;
    const epoch = mutationEpoch;
    const gameId = (((__oc10 = state.game) === null || __oc10 === void 0 ? void 0 : __oc10.id)) || storage.get(langKey('game'));
    const data = (screen === 'game' && gameId) ? await request(`games/${gameId}`) : await request('profile');
    if (epoch === mutationEpoch) render(data, { navigate: screen !== 'title' });
    return data;
}

async function action(callback) {
    var __oc11, __oc12;
    if (busy) return;
    mutationEpoch++;
    audio.unlock();
    setBusy(true);
    $('notice').hidden = true;
    try {
        await callback();
    } catch (error) {
        reportException(error, 'game_action');
        if (['stale_state', 'game_finished', 'round_expired', 'network_error'].includes(error.code)) {
            if (error.code === 'round_expired') {
                clearLocalRoundProgress();
            }
            try {
                const recovered = await recover();
                if (pendingCommand && (((__oc12 = (__oc11 = recovered.game) === null || __oc11 === void 0 ? void 0 : __oc11.guesses) === null || __oc12 === void 0 ? void 0 : __oc12.some(g => g.requestId === pendingCommand.body.requestId)))) {
                    const draftText = $('guess-input').value.trim();
                    if ((locale === 'en' ? draftText.toLowerCase() : draftText) === pendingCommand.body.text) $('guess-input').value = '';
                    pendingCommand = null;
                    storage.remove(langKey('pending'));
                    storage.remove(langKey('draft'));
                }
            } catch (_err) {
                /* 서버 재연결 실패 시 대기 중인 요청 보존 */
                if (error.code === 'round_expired') notify('round_expired');
            }
        }
        if (error.code === 'stale_state') {
            pendingCommand = null;
            storage.remove(langKey('pending'));
        }
        if (error.code !== 'round_expired') notify(error.code || 'network_error');
    } finally {
        setBusy(false);
    }
}

async function start() {
    await action(async () => {
        audio.play('click');
        const existingGameId = state.game && state.game.id ? state.game.id : null;
        if (existingGameId) {
            const data = await request(`games/${existingGameId}`);
            render(data);
            return;
        }
        let startId = storage.get(langKey('start_request'));
        if (!startId) {
            startId = requestId();
            storage.set(langKey('start_request'), startId);
            storage.set(langKey('start_locale'), locale);
        }
        const data = await request('games', { locale: storage.get(langKey('start_locale')) || locale, requestId: startId });
        storage.remove(langKey('start_request'));
        storage.remove(langKey('start_locale'));
        pendingCommand = null;
        storage.remove(langKey('pending'));
        $('guess-input').value = '';
        storage.remove(langKey('draft'));
        showTurnFeedback(null);
        render(data);
        audio.play('start', { gain: 0.55 });
    });
}

async function submitGuess(wordText) {
    var __oc15;
    const rawText = String(((wordText !== null && wordText !== void 0 ? wordText : $('guess-input').value))).normalize('NFC').trim();
    const text = locale === 'en' ? rawText.toLowerCase() : rawText;
    if (!text) {
        return;
    }
    if ([...text].length > 32) {
        notify('input_too_long');
        return;
    }
    const game = state.game;
    if (!game) return;
    if (isTouchDevice() && document.activeElement === $('guess-input')) {
        $('guess-input').blur();
    }

    if (game.status !== 'active') {
        startGuessLoading();
        try {
            await action(async () => {
                audio.play('send', { gain: 0.4, duration: 0.14 });
                const res = await request(`games/${game.id}/explore`, { text, locale });
                $('guess-input').value = '';
                storage.remove(langKey('draft'));
                if (res.code === 'unknown_word') {
                    audio.play('wrong', { gain: 0.45, duration: 0.2 });
                    showTurnFeedback('unknown_word', { word: res.word }, 'error');
                    return;
                }
                const rankStr = res.rank === 0 ? t('rank_exact') : res.rank !== null ? t('rank_badge', { rank: res.rank }) : t('rank_outside');
                audio.play(res.rank !== null ? 'stamp' : 'tick', { rate: res.rank !== null ? 1.15 : 0.9, gain: 0.5 });
                showTurnFeedback('explore_notice', { word: res.word, sim: res.similarity.toFixed(2), rank: rankStr }, res.rank !== null ? 'warm' : 'info');
            });
        } finally {
            finishGuessLoading();
        }
        if (!isTouchDevice() && wordText === undefined) $('guess-input').focus({ preventScroll: true });
        return;
    }

    startGuessLoading();
    try {
        await action(async () => {
            var __oc13, __oc14;
            const path = `games/${game.id}/guesses`;
            const samePending = ((pendingCommand === null || pendingCommand === void 0 ? void 0 : pendingCommand.path)) === path && pendingCommand.body.text === text;
            const body = samePending ? pendingCommand.body : { text, locale, requestId: requestId(), expectedVersion: game.version };
            if (!samePending) {
                pendingCommand = { path, body };
                storage.set(langKey('pending'), JSON.stringify(pendingCommand));
            }
            audio.play('send', { gain: 0.4, duration: 0.15 });
            const data = await request(path, body);
            pendingCommand = null;
            storage.remove(langKey('pending'));

            if ((((__oc13 = data.event) === null || __oc13 === void 0 ? void 0 : __oc13.code)) === 'unknown_word') {
                audio.result(data.event, data.game);
                showTurnFeedback('unknown_word', { word: data.event.word }, 'error');
                return;
            }
            if ((((__oc14 = data.event) === null || __oc14 === void 0 ? void 0 : __oc14.code)) === 'duplicate') {
                $('guess-input').value = '';
                storage.remove(langKey('draft'));
                latestHighlightWord = data.event.word;
                render(data, { effects: true });
                showTurnFeedback('duplicate_word', { word: data.event.word }, 'info');
                return;
            }
            const currentInput = $('guess-input').value.normalize('NFC').trim();
            if ((locale === 'en' ? currentInput.toLowerCase() : currentInput) === text) $('guess-input').value = '';
            storage.remove(langKey('draft'));
            showTurnFeedback(null);
            render(data, { effects: true });
        });
    } finally {
        finishGuessLoading();
    }

    if (!isTouchDevice() && wordText === undefined && (((__oc15 = state.game) === null || __oc15 === void 0 ? void 0 : __oc15.status)) === 'active') $('guess-input').focus({ preventScroll: true });
}

function buildShareText() {
    const game = state.game;
    if (!game) return '';
    const roundNo = (state.round && state.round.roundNo) || game.roundNo || game.caseNo;
    const header = locale === 'en'
        ? `ArcherLab Semantle Round #${roundNo} Solved!`
        : `아처랩 시맨틀 라운드 #${roundNo} 정답!`;
    const lines = [header];
    if (settings.shareTime && Number.isFinite(game.solvedMs)) {
        lines.push(locale === 'en' ? `Round clear: ${formatRecordTime(game.solvedMs)}` : `라운드 클리어: ${formatRecordTime(game.solvedMs)}`);
    }
    if (settings.shareGuesses) {
        lines.push(locale === 'en' ? `Guesses: ${game.guessCount}` : `추측 횟수: ${game.guessCount}회`);
    }
    if (settings.shareMax && game.bestSimilarity !== null) {
        lines.push(locale === 'en' ? `Max similarity: ${game.bestSimilarity.toFixed(2)}` : `최고 유사도: ${game.bestSimilarity.toFixed(2)}`);
    }
    lines.push(locale === 'en' ? 'https://game.archerlab.dev/twenty-questions/index-en' : 'https://game.archerlab.dev/twenty-questions/');
    return lines.join('\n');
}

async function copyShare() {
    var __oc16;
    const text = buildShareText();
    if (!text) return;
    try {
        if ((((__oc16 = navigator.clipboard) === null || __oc16 === void 0 ? void 0 : __oc16.writeText))) {
            await navigator.clipboard.writeText(text);
            notify('copied');
            return;
        }
    } catch (_err) { /* 클립보드 미지원 환경 처리 */ }
    notify('copy_failed');
}

function renderNearestRows(filter = '') {
    const q = filter.trim().toLowerCase();
    const list = q ? nearestWords.filter(item => item.word.toLowerCase().includes(q)) : nearestWords;
    const body = $('nearest-body');
    $('nearest-empty').hidden = list.length > 0;
    const frag = document.createDocumentFragment();
    for (const item of list.slice(0, 1000)) {
        const tr = document.createElement('tr');
        tr.className = thermalClass({ rank: item.rank, similarity: item.similarity });
        const tdRank = document.createElement('td');
        tdRank.textContent = String(item.rank);
        const tdWord = document.createElement('td');
        tdWord.className = 'col-word';
        tdWord.textContent = item.word;
        const tdSim = document.createElement('td');
        tdSim.className = 'col-sim';
        tdSim.textContent = item.similarity.toFixed(2);
        const tdBar = document.createElement('td');
        const bar = document.createElement('div');
        bar.className = 'sim-meter';
        const fill = document.createElement('i');
        fill.style.width = `${Math.max(4, (1001 - item.rank) / 10).toFixed(1)}%`;
        bar.append(fill);
        tdBar.append(bar);
        tr.append(tdRank, tdWord, tdSim, tdBar);
        frag.append(tr);
    }
    body.replaceChildren(frag);
}

function comitativeParticle(word) {
    const trimmed = String(word || '').trim();
    if (!trimmed) return '와';
    const code = trimmed.charCodeAt(trimmed.length - 1);
    if (code >= 0xac00 && code <= 0xd7a3) {
        return (code - 0xac00) % 28 !== 0 ? '과' : '와';
    }
    return '와';
}

async function openNearestModal(mode) {
    const usePrev = mode === 'previous';
    const game = state.game;
    const prev = state.round && state.round.previous ? state.round.previous : null;
    let key;
    let titleWord;
    let endpoint;
    if (usePrev) {
        if (!prev) return;
        key = `prev:${prev.id}`;
        titleWord = prev.answer;
        endpoint = 'rounds/previous/nearest';
    } else {
        if (!game || game.status !== 'won') return;
        key = `current:${game.id}`;
        titleWord = game.answer || '';
        endpoint = `games/${game.id}/nearest`;
    }
    openDialog('nearest-dialog');
    $('nearest-title').textContent = t('nearest_title', { word: titleWord, josa: comitativeParticle(titleWord) });
    $('nearest-filter').value = '';
    if (nearestKey !== key) {
        $('nearest-body').replaceChildren();
        $('nearest-loading').hidden = false;
        try {
            const data = await request(endpoint);
            nearestWords = data.words || [];
            nearestKey = key;
        } catch (error) {
            reportException(error, 'nearest');
            notify(error.code || 'network_error');
            $('nearest-loading').hidden = true;
            return;
        }
        $('nearest-loading').hidden = true;
    }
    renderNearestRows('');
}

function openDialog(id) {
    audio.unlock();
    audio.play(id === 'ranking-dialog' ? 'ranking' : 'click', { gain: 0.55, duration: 0.3 });
    $(id).showModal();
}

function syncRankingSortUI(sort) {
    for (const btn of document.querySelectorAll('[data-ranking-sort]')) {
        const active = btn.dataset.rankingSort === sort;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
    }
    if ($('ranking-rule')) {
        $('ranking-rule').textContent = t(sort === 'time' ? 'ranking_rule_time' : 'ranking_rule_wins');
    }
}

async function showRanking(nextSort) {
    if (nextSort === 'wins' || nextSort === 'time') rankingSort = nextSort;
    if (!$('ranking-dialog').open) openDialog('ranking-dialog');
    if ($('ranking-title')) $('ranking-title').textContent = t('ranking');
    syncRankingSortUI(rankingSort);
    const seq = ++rankingRequestSeq;
    const activeSort = rankingSort;
    $('leaderboard').textContent = t('loading');
    $('own-rank').textContent = '';
    try {
        const data = await request('leaderboard?sort=' + activeSort);
        if (seq !== rankingRequestSeq) return;
        const resolvedSort = data.sort === 'time' ? 'time' : 'wins';
        rankingSort = resolvedSort;
        syncRankingSortUI(resolvedSort);
        if (data.entries && data.entries.length) {
            const table = document.createElement('table');
            const head = document.createElement('thead');
            const row = document.createElement('tr');
            const activeCol = resolvedSort === 'time' ? 'time_col' : 'solved_col';
            for (const key of ['rank_col', 'explorer_col', 'solved_col', 'time_col']) {
                const th = document.createElement('th');
                th.scope = 'col';
                if (key === activeCol) th.className = 'is-active-col';
                th.textContent = t(key);
                row.append(th);
            }
            head.append(row);
            table.append(head);
            const body = document.createElement('tbody');
            const activeIdx = resolvedSort === 'time' ? 3 : 2;
            for (const entry of data.entries) {
                const tr = document.createElement('tr');
                if (entry.own) tr.className = 'own';
                const solvedMs = (entry.solvedMs !== undefined && entry.solvedMs !== null) ? entry.solvedMs : entry.bestTimeMs;
                const cells = [
                    String(entry.rank),
                    displaySolverName(entry),
                    t('solved_unit', { count: entry.wins || 0 }),
                    formatRecordTime(solvedMs),
                ];
                cells.forEach((value, idx) => {
                    const td = document.createElement('td');
                    if (idx === activeIdx) td.className = 'is-active-col';
                    td.textContent = value;
                    tr.append(td);
                });
                body.append(tr);
            }
            table.append(body);
            $('leaderboard').replaceChildren(table);
        } else {
            const emptyBox = document.createElement('div');
            emptyBox.className = 'leaderboard-empty';
            const emptyTitle = document.createElement('p');
            emptyTitle.className = 'leaderboard-empty-title';
            emptyTitle.textContent = t('no_records');
            const emptyDesc = document.createElement('p');
            emptyDesc.className = 'leaderboard-empty-desc';
            emptyDesc.textContent = t('no_records_desc');
            emptyBox.append(emptyTitle, emptyDesc);
            $('leaderboard').replaceChildren(emptyBox);
        }
        if (data.mine) {
            const mineMs = (data.mine.solvedMs !== undefined && data.mine.solvedMs !== null) ? data.mine.solvedMs : data.mine.bestTimeMs;
            $('own-rank').textContent = `${t('your_record')} · #${data.mine.rank} · ${t('own_solved', { count: data.mine.wins || 0 })} · ${formatRecordTime(mineMs)}`;
        } else {
            $('own-rank').textContent = '';
        }
    } catch (error) {
        if (seq !== rankingRequestSeq) return;
        reportException(error, 'leaderboard');
        $('leaderboard').textContent = t(Object.prototype.hasOwnProperty.call(messages[locale], error.code) ? error.code : 'network_error');
    }
}

function showGuide() {
    const p = state.profile || blankProfile;
    $('stat-played').textContent = String(p.gamesPlayed || 0);
    $('stat-wins').textContent = String(p.wins || 0);
    $('stat-total-guesses').textContent = String(p.totalGuesses || 0);
    $('stat-streak').textContent = String(p.streak || 0);
    $('stat-best-streak').textContent = String(p.bestStreak || 0);
    $('stat-best-time').textContent = formatRecordTime(p.bestTimeMs);
    openDialog('guide-dialog');
}

$('guess-input').value = storage.get(langKey('draft')) || '';
$('start').addEventListener('click', start);

$('guess-form').addEventListener('submit', event => {
    event.preventDefault();
    sendSubmittedByForm = true;
    composing = false;
    if (!busy) submitGuess();
});

$('send').addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
        sendPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
        sendSubmittedByForm = false;
    }
});
$('send').addEventListener('pointerup', event => {
    if (!sendPointer || event.pointerId !== sendPointer.id) return;
    const moved = Math.hypot(event.clientX - sendPointer.x, event.clientY - sendPointer.y);
    sendPointer = null;
    if (moved < 28 && !busy) {
        if (document.activeElement === $('guess-input')) $('guess-input').blur();
        setTimeout(() => {
            if (!sendSubmittedByForm && !busy) {
                composing = false;
                submitGuess();
            }
            syncKeyboard();
        }, 30);
    } else {
        syncKeyboard();
    }
});
$('send').addEventListener('pointercancel', () => {
    sendPointer = null;
    syncKeyboard();
});

$('guess-input').addEventListener('input', () => {
    storage.set(langKey('draft'), $('guess-input').value);
});
$('guess-input').addEventListener('compositionstart', () => { composing = true; });
$('guess-input').addEventListener('compositionend', () => { composing = false; });
$('guess-input').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !composing && event.keyCode !== 229) {
        event.preventDefault();
        $('guess-form').requestSubmit();
    }
});

for (const chip of document.querySelectorAll('.starter-chip')) {
    chip.addEventListener('click', () => {
        var __oc20;
        if (busy || (((__oc20 = state.game) === null || __oc20 === void 0 ? void 0 : __oc20.status)) !== 'active') return;
        submitGuess(chip.dataset.word);
    });
}

for (const btn of document.querySelectorAll('[data-sort]')) {
    btn.addEventListener('click', () => {
        const key = btn.dataset.sort;
        if (sortState.key === key) sortState.dir = sortState.dir === 'desc' ? 'asc' : 'desc';
        else sortState = { key, dir: key === 'similarity' ? 'desc' : 'asc' };
        if (state.game) renderGuessesTable(state.game, false);
    });
}

$('home').addEventListener('click', () => {
    audio.play('click');
    changeScreen('title');
});

$('open-nearest').addEventListener('click', () => openNearestModal('current'));
if ($('prev-answer-btn')) $('prev-answer-btn').addEventListener('click', () => openNearestModal('previous'));
if ($('hero-prev-nearest')) $('hero-prev-nearest').addEventListener('click', () => openNearestModal('previous'));
if ($('current-solver-btn')) $('current-solver-btn').addEventListener('click', () => showRanking());
$('open-ranking-result').addEventListener('click', () => showRanking());
$('nearest-filter').addEventListener('input', event => renderNearestRows(event.target.value));
$('share-result').addEventListener('click', copyShare);
$('ranking-open').addEventListener('click', () => showRanking());
for (const btn of document.querySelectorAll('[data-ranking-sort]')) {
    btn.addEventListener('click', () => {
        const nextSort = btn.dataset.rankingSort;
        if (nextSort === rankingSort) return;
        audio.play('click');
        showRanking(nextSort);
    });
}
$('guide-open').addEventListener('click', showGuide);
$('settings-open').addEventListener('click', () => openDialog('settings-dialog'));

async function saveDisplayName(inputEl, statusEl) {
    const cleaned = inputEl.value.normalize('NFKC').replace(/\s+/g, ' ').trim();
    const alnumCount = (cleaned.match(/[\p{L}\p{N}]/gu) || []).length;
    if (!/^[\p{L}\p{N} ._-]{2,16}$/u.test(cleaned) || alnumCount < 2) {
        statusEl.textContent = t('invalid_name');
        return;
    }
    try {
        const data = await request('profile', { name: cleaned }, 'PATCH');
        render(data, { navigate: false });
        statusEl.textContent = t('saved_name');
    } catch (error) {
        statusEl.textContent = t(Object.prototype.hasOwnProperty.call(messages[locale], error.code) ? error.code : 'network_error');
    }
}

if ($('result-name-form')) {
    $('result-name-form').addEventListener('submit', async event => {
        event.preventDefault();
        await saveDisplayName($('result-name-input'), $('result-name-status'));
    });
}

$('sound-enabled').checked = audio.enabled;
$('sound-volume').value = Math.round(audio.volume * 100);
$('dark-mode').checked = settings.darkMode;
$('share-guesses').checked = settings.shareGuesses;
$('share-time').checked = settings.shareTime;
$('share-max').checked = settings.shareMax;

$('sound-enabled').addEventListener('change', () => audio.configure($('sound-enabled').checked));
$('sound-volume').addEventListener('input', () => audio.configure($('sound-enabled').checked, Number($('sound-volume').value) / 100));
$('sound-volume').addEventListener('change', () => audio.play('click'));
$('dark-mode').addEventListener('change', () => {
    settings.darkMode = $('dark-mode').checked;
    storage.set('darkMode', settings.darkMode);
    applyTheme();
});
$('share-guesses').addEventListener('change', () => {
    settings.shareGuesses = $('share-guesses').checked;
    storage.set('shareGuesses', settings.shareGuesses);
});
$('share-time').addEventListener('change', () => {
    settings.shareTime = $('share-time').checked;
    storage.set('shareTime', settings.shareTime);
});
$('share-max').addEventListener('change', () => {
    settings.shareMax = $('share-max').checked;
    storage.set('shareMax', settings.shareMax);
});

document.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => button.closest('dialog').close());
});
document.querySelectorAll('.languages a').forEach(link => {
    link.addEventListener('click', event => {
        if (busy) { event.preventDefault(); return; }
        storage.set(langKey('draft'), $('guess-input').value);
    });
});
document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => {
        if (event.target === dialog) {
            const box = dialog.getBoundingClientRect();
            if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) {
                dialog.close();
            }
        }
    });
});

window.addEventListener('online', () => {
    tickTimer();
    if (!busy && !rolloverInFlight) recover().catch(() => {});
});
window.addEventListener('offline', () => notify('offline', {}, true));

// 백그라운드·잠금·탭 전환 복귀 즉시 서버 기준 시간·라운드 상태 동기화
function handleForeground() {
    tickTimer();
    if (!document.hidden && !busy && !rolloverInFlight) {
        recover().catch(() => {});
    }
}
document.addEventListener('visibilitychange', handleForeground);
window.addEventListener('pageshow', tickTimer);
window.addEventListener('focus', tickTimer);

{
    const viewport = window.visualViewport;
    let fullHeight = window.innerHeight;
    let fullWidth = window.innerWidth;
    let frame = 0;
    let focusTimers = [];

    const update = () => {
        frame = 0;
        const height = ((viewport === null || viewport === void 0 ? void 0 : viewport.height)) || window.innerHeight;
        const top = ((viewport === null || viewport === void 0 ? void 0 : viewport.offsetTop)) || 0;
        const focused = document.activeElement === $('guess-input');
        const wasOpen = document.body.classList.contains('keyboard-open');
        const unzoomed = Math.abs((((viewport === null || viewport === void 0 ? void 0 : viewport.scale)) || 1) - 1) < 0.05;
        if (Math.abs(window.innerWidth - fullWidth) > 80) {
            fullWidth = window.innerWidth;
            fullHeight = window.innerHeight;
        }
        if (!focused && !wasOpen) fullHeight = Math.max(fullHeight, window.innerHeight, height);
        const reduced = Math.max(fullHeight, window.innerHeight) - height > 100;
        const open = sendPointer ? wasOpen : (screen === 'game' && unzoomed && reduced && (focused || wasOpen));
        document.body.classList.toggle('keyboard-open', open);
        const overlap = Math.max(0, window.innerHeight - height);
        document.body.style.setProperty('--keyboard-height', `${open ? overlap + 16 : 0}px`);
        if (screen !== 'game' || !focused || !unzoomed || busy || sendPointer) return;
        const box = $('guess-form').getBoundingClientRect();
        const bottom = top + height - 12;
        const delta = box.bottom > bottom ? box.bottom - bottom : box.top < top + 12 ? box.top - top - 12 : 0;
        if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: 'instant' });
    };

    syncKeyboard = () => { if (!frame) frame = requestAnimationFrame(update); };
    ((viewport === null || viewport === void 0 ? void 0 : viewport.addEventListener('resize', syncKeyboard)));
    ((viewport === null || viewport === void 0 ? void 0 : viewport.addEventListener('scroll', syncKeyboard)));
    window.addEventListener('resize', syncKeyboard);
    $('guess-input').addEventListener('focus', () => {
        focusTimers.forEach(clearTimeout);
        syncKeyboard();
        focusTimers = [100, 300, 600].map(delay => setTimeout(syncKeyboard, delay));
    });
    $('guess-input').addEventListener('blur', () => {
        focusTimers.forEach(clearTimeout);
        syncKeyboard();
    });
}

async function initialize() {
    document.body.dataset.screen = 'title';
    storage.remove('view');
    const previousView = getSessionView();
    const epoch = mutationEpoch;
    try {
        const profile = await request('profile');
        if (epoch !== mutationEpoch) return;
        render(profile, { navigate: false });
        if (previousView === 'game' && profile.game) {
            render(profile);
        } else if (!profile.game) {
            storage.remove(langKey('game'));
            setSessionView('title');
        }
    } catch (error) {
        reportException(error, 'initial_state');
    }
    if (!storage.available) notify('storage_notice', {}, true);
}

initialize();
window.addEventListener('error', event => { if (event.error) reportException(event.error, 'uncaught'); });
window.addEventListener('unhandledrejection', event => reportException(event.reason, 'unhandled_rejection'));
