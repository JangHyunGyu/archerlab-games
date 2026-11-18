import { messages, translation } from './i18n.mjs';
import { request, requestId, storage, reportException } from './api.mjs';
import { GameAudio } from './audio.mjs';

const locale = document.documentElement.lang === 'en' ? 'en' : 'ko';
const t = translation(locale);
const $ = id => document.getElementById(id);
const audio = new GameAudio();

const blankProfile = {
    name: '',
    gamesPlayed: 0,
    wins: 0,
    giveUps: 0,
    totalGuesses: 0,
    streak: 0,
    streakGuesses: 0,
    bestStreak: 0,
    bestGuesses: 0,
    bestTimeMs: null,
    bestTimeGuesses: null,
    activeGame: null,
};

let state = { profile: blankProfile, game: null };
let busy = false;
let noticeTimer;
let stopwatchTimer = 0;
let serverClockOffset = 0;
let composing = false;
let screen = 'title';
let mutationEpoch = 0;
let pendingCommand;
let latestHighlightWord = null;
let sortState = { key: 'similarity', dir: 'desc' };
let nearestWords = [];
let nearestGameId = null;
let syncKeyboard = () => {};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
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

try { pendingCommand = JSON.parse(storage.get('pending') || 'null'); } catch (_err) { pendingCommand = null; }

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

function changeScreen(next) {
    screen = next;
    document.body.dataset.screen = next;
    $('title-screen').hidden = next !== 'title';
    $('game-screen').hidden = next !== 'game';
    storage.set('view', next);
    window.scrollTo({ top: 0, behavior: 'instant' });
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
    for (const id of ['start', 'resume', 'send', 'next-game', 'give-up', 'confirm-give-up', 'home', 'open-nearest', 'open-ranking-result', 'share-result']) {
        const el = $(id);
        if (el) el.disabled = value;
    }
    $('guess-input').setAttribute('aria-busy', String(value));
    $('guess-form').setAttribute('aria-busy', String(value));
    for (const link of document.querySelectorAll('.languages a')) link.setAttribute('aria-disabled', String(value));
}

// 서버 기준 경과 시간(ms)을 계산해 백그라운드·새로고침 뒤에도 끊기지 않게 표시
function activeElapsedMs() { var __oc0;
    const createdAt = (((__oc0 = state.game) === null || __oc0 === void 0 ? void 0 : __oc0.createdAt));
    if (!Number.isFinite(createdAt)) return 0;
    return Math.max(0, Date.now() + serverClockOffset - createdAt);
}

function formatLiveTimer(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '00:00.0';
    const totalTenths = Math.floor(ms / 100);
    const tenths = totalTenths % 10;
    const totalSec = Math.floor(totalTenths / 10);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}.${tenths}`;
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

function tickTimer() {
    const game = state.game;
    const timerEl = $('game-timer');
    const resumeTimerEl = $('resume-timer');
    if (!game) {
        if (timerEl) timerEl.textContent = '00:00.0';
        return;
    }
    if (game.status === 'active') {
        const text = formatLiveTimer(activeElapsedMs());
        if (timerEl) timerEl.textContent = text;
        if (resumeTimerEl) resumeTimerEl.textContent = text;
    } else if (game.status === 'won' && Number.isFinite(game.solvedMs)) {
        if (timerEl) timerEl.textContent = formatRecordTime(game.solvedMs);
    } else {
        const endedMs = Math.max(0, (game.updatedAt || Date.now()) - (game.createdAt || Date.now()));
        if (timerEl) timerEl.textContent = formatRecordTime(endedMs);
    }
}

function syncStopwatchLoop() { var __oc1;
    if ((((__oc1 = state.game) === null || __oc1 === void 0 ? void 0 : __oc1.status)) === 'active') {
        tickTimer();
        if (!stopwatchTimer) stopwatchTimer = setInterval(tickTimer, 100);
    } else {
        if (stopwatchTimer) {
            clearInterval(stopwatchTimer);
            stopwatchTimer = 0;
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

function closenessLabel(entry) { var __oc2, __oc3, __oc4;
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
        if (sortState.key === 'word') return a.word.localeCompare(b.word, 'ko') * mul;
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

function render(data, { navigate = true, effects = false } = {}) { var __oc5, __oc6, __oc7, __oc8, __oc9;
    if (data.game && (((__oc5 = state.game) === null || __oc5 === void 0 ? void 0 : __oc5.id)) === data.game.id && data.game.version < state.game.version) return;
    if (Number.isFinite(data.serverNow)) {
        serverClockOffset = data.serverNow - Date.now();
    }
    effects = effects && !(((__oc6 = data.event) === null || __oc6 === void 0 ? void 0 : __oc6.replayed));
    const prevGameId = (((__oc7 = state.game) === null || __oc7 === void 0 ? void 0 : __oc7.id));
    state = data;
    const profile = data.profile || blankProfile;

    $('hero-best-time').textContent = formatRecordTime(profile.bestTimeMs);
    $('hero-wins').textContent = String(profile.wins || 0);
    $('hero-streak').textContent = String(profile.streak || 0);
    $('resume').hidden = !profile.activeGame;

    if (!data.game) {
        syncStopwatchLoop();
        return;
    }
    const game = data.game;
    storage.remove('start_request');
    storage.remove('start_locale');
    storage.set('game', game.id);

    if (game.id !== prevGameId) {
        latestHighlightWord = null;
        nearestWords = [];
        nearestGameId = null;
        showTurnFeedback(null);
    }

    if ((((__oc8 = data.event) === null || __oc8 === void 0 ? void 0 : __oc8.word)) && ['guess', 'duplicate', 'won'].includes(data.event.code)) {
        latestHighlightWord = data.event.word;
    }

    if (navigate) changeScreen('game');

    const active = game.status === 'active';
    const finished = !active;
    $('game-screen').dataset.status = game.status;
    $('case-label').textContent = t('case_badge', { no: game.caseNo });
    $('give-up').hidden = finished;
    $('guess-count-display').textContent = String(game.guessCount);
    $('game-best-time').textContent = formatRecordTime(profile.bestTimeMs);

    if (game.benchmarks) {
        $('top1-score').textContent = game.benchmarks.top1.toFixed(2);
        $('top10-score').textContent = game.benchmarks.top10.toFixed(2);
        $('top1000-score').textContent = game.benchmarks.top1000.toFixed(2);
    }

    renderResonanceBar(game);
    renderGuessesTable(game, effects && ['guess', 'won'].includes((((__oc9 = data.event) === null || __oc9 === void 0 ? void 0 : __oc9.code))));
    syncStopwatchLoop();

    $('guess-input').placeholder = t(active ? 'guess_placeholder' : 'explore_placeholder');
    $('send').firstElementChild.textContent = t(active ? 'send' : 'explore_send');
    $('result-banner').hidden = active;
    $('starter-chips').hidden = finished;

    if (finished) {
        const won = game.status === 'won';
        $('result-banner').classList.toggle('is-won', won);
        $('result-title').textContent = t(won ? 'won_title' : 'given_up_title');
        $('result-answer').textContent = game.answer || '';
        $('record-badge').hidden = !won || !game.recordImproved;
        const unranked = won && !game.ranked;
        $('unranked-note').hidden = !unranked;
        if (unranked) {
            $('unranked-note').textContent = t(game.unrankedReason === 'too_fast' ? 'unranked_too_fast' : 'unranked_single_guess');
        }
        const elapsed = won && Number.isFinite(game.solvedMs)
            ? game.solvedMs
            : Math.max(0, (game.updatedAt || Date.now()) - (game.createdAt || Date.now()));
        $('result-time').textContent = formatRecordTime(elapsed);
        $('result-guesses').textContent = String(game.guessCount);
        $('result-best-time').textContent = formatRecordTime(profile.bestTimeMs);
        $('result-streak').textContent = String(profile.streak);
    }

    if (effects) {
        audio.result(data.event, game);
        triggerGameVfx(data.event, game);
    }
    requestAnimationFrame(syncKeyboard);
}

async function recover() { var __oc10;
    const epoch = mutationEpoch;
    const gameId = (((__oc10 = state.game) === null || __oc10 === void 0 ? void 0 : __oc10.id)) || storage.get('game');
    const data = gameId ? await request(`games/${gameId}`) : await request('profile');
    if (epoch === mutationEpoch) render(data, { navigate: screen !== 'title' });
    return data;
}

async function action(callback) { var __oc11, __oc12;
    if (busy) return;
    mutationEpoch++;
    audio.unlock();
    setBusy(true);
    $('notice').hidden = true;
    try {
        await callback();
    } catch (error) {
        reportException(error, 'game_action');
        if (['stale_state', 'game_finished', 'network_error'].includes(error.code)) {
            try {
                const recovered = await recover();
                if (pendingCommand && (((__oc12 = (__oc11 = recovered.game) === null || __oc11 === void 0 ? void 0 : __oc11.guesses) === null || __oc12 === void 0 ? void 0 : __oc12.some(g => g.requestId === pendingCommand.body.requestId)))) {
                    if ($('guess-input').value.trim() === pendingCommand.body.text) $('guess-input').value = '';
                    pendingCommand = null;
                    storage.remove('pending');
                    storage.remove('draft');
                }
            } catch (_err) { /* 서버 재연결 실패 시 대기 중인 요청 보존 */ }
        }
        if (error.code === 'stale_state') {
            pendingCommand = null;
            storage.remove('pending');
        }
        notify(error.code || 'network_error');
    } finally {
        setBusy(false);
    }
}

async function start() {
    await action(async () => {
        audio.play('click');
        let startId = storage.get('start_request');
        if (!startId) {
            startId = requestId();
            storage.set('start_request', startId);
            storage.set('start_locale', locale);
        }
        const data = await request('games', { locale: storage.get('start_locale') || locale, requestId: startId });
        storage.remove('start_request');
        storage.remove('start_locale');
        pendingCommand = null;
        storage.remove('pending');
        $('guess-input').value = '';
        storage.remove('draft');
        showTurnFeedback(null);
        render(data);
        audio.play('start', { gain: 0.55 });
        $('guess-input').focus({ preventScroll: true });
    });
}

async function submitGuess(wordText) { var __oc15;
    const text = String(((wordText !== null && wordText !== void 0 ? wordText : $('guess-input').value))).normalize('NFC').trim();
    if (!text) {
        $('guess-input').focus();
        return;
    }
    if ([...text].length > 32) {
        notify('input_too_long');
        return;
    }
    const game = state.game;
    if (!game) return;

    if (game.status !== 'active') {
        startGuessLoading();
        try {
            await action(async () => {
                audio.play('send', { gain: 0.4, duration: 0.14 });
                const res = await request(`games/${game.id}/explore`, { text, locale });
                $('guess-input').value = '';
                storage.remove('draft');
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
        $('guess-input').focus({ preventScroll: true });
        return;
    }

    startGuessLoading();
    try {
        await action(async () => { var __oc13, __oc14;
            const path = `games/${game.id}/guesses`;
            const samePending = ((pendingCommand === null || pendingCommand === void 0 ? void 0 : pendingCommand.path)) === path && pendingCommand.body.text === text;
            const body = samePending ? pendingCommand.body : { text, locale, requestId: requestId(), expectedVersion: game.version };
            if (!samePending) {
                pendingCommand = { path, body };
                storage.set('pending', JSON.stringify(pendingCommand));
            }
            audio.play('send', { gain: 0.4, duration: 0.15 });
            const data = await request(path, body);
            pendingCommand = null;
            storage.remove('pending');

            if ((((__oc13 = data.event) === null || __oc13 === void 0 ? void 0 : __oc13.code)) === 'unknown_word') {
                audio.result(data.event, data.game);
                showTurnFeedback('unknown_word', { word: data.event.word }, 'error');
                return;
            }
            if ((((__oc14 = data.event) === null || __oc14 === void 0 ? void 0 : __oc14.code)) === 'duplicate') {
                $('guess-input').value = '';
                storage.remove('draft');
                latestHighlightWord = data.event.word;
                render(data, { effects: true });
                showTurnFeedback('duplicate_word', { word: data.event.word }, 'info');
                return;
            }
            if ($('guess-input').value.trim() === text) $('guess-input').value = '';
            storage.remove('draft');
            showTurnFeedback(null);
            render(data, { effects: true });
        });
    } finally {
        finishGuessLoading();
    }

    if ((((__oc15 = state.game) === null || __oc15 === void 0 ? void 0 : __oc15.status)) === 'active') $('guess-input').focus({ preventScroll: true });
}

function buildShareText() {
    const game = state.game;
    if (!game) return '';
    const won = game.status === 'won';
    const header = locale === 'en'
        ? (won ? `ArcherLab Korean Semantle #${game.caseNo} Solved!` : `ArcherLab Korean Semantle #${game.caseNo} Given Up`)
        : (won ? `아처랩 시맨틀 #${game.caseNo} 정답!` : `아처랩 시맨틀 #${game.caseNo} 포기`);
    const lines = [header];
    if (settings.shareTime) {
        const elapsed = won && Number.isFinite(game.solvedMs)
            ? game.solvedMs
            : Math.max(0, (game.updatedAt || Date.now()) - (game.createdAt || Date.now()));
        lines.push(locale === 'en' ? `Time: ${formatRecordTime(elapsed)}` : `걸린 시간: ${formatRecordTime(elapsed)}`);
    }
    if (settings.shareGuesses) {
        lines.push(locale === 'en' ? `Guesses: ${game.guessCount}` : `추측 횟수: ${game.guessCount}회`);
    }
    if (settings.shareMax && game.bestSimilarity !== null) {
        lines.push(locale === 'en' ? `Max similarity: ${game.bestSimilarity.toFixed(2)}` : `최고 유사도: ${game.bestSimilarity.toFixed(2)}`);
    }
    lines.push('https://game.archerlab.dev/twenty-questions/');
    return lines.join('\n');
}

async function copyShare() { var __oc16;
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
    const q = filter.trim();
    const list = q ? nearestWords.filter(item => item.word.includes(q)) : nearestWords;
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

async function openNearestModal() {
    const game = state.game;
    if (!game || game.status === 'active') return;
    openDialog('nearest-dialog');
    $('nearest-title').textContent = t('nearest_title', { word: game.answer || '' });
    $('nearest-filter').value = '';
    if (nearestGameId !== game.id) {
        $('nearest-body').replaceChildren();
        $('nearest-loading').hidden = false;
        try {
            const data = await request(`games/${game.id}/nearest`);
            nearestWords = data.words || [];
            nearestGameId = game.id;
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

async function showRanking() { var __oc17, __oc18, __oc19;
    openDialog('ranking-dialog');
    $('leaderboard').textContent = t('loading');
    $('own-rank').textContent = '';
    $('name-input').value = (((__oc17 = state.profile) === null || __oc17 === void 0 ? void 0 : __oc17.name)) || '';
    $('name-status').textContent = '';
    try {
        const data = await request('leaderboard');
        const table = document.createElement('table');
        const head = document.createElement('thead');
        const row = document.createElement('tr');
        for (const key of ['rank_col', 'explorer_col', 'time_col', 'guesses_col']) {
            const th = document.createElement('th');
            th.scope = 'col';
            th.textContent = t(key);
            row.append(th);
        }
        head.append(row);
        table.append(head);
        const body = document.createElement('tbody');
        for (const entry of data.entries) {
            const tr = document.createElement('tr');
            if (entry.own) tr.className = 'own';
            const cells = [
                String(entry.rank),
                entry.name,
                formatRecordTime(entry.bestTimeMs),
                t('guesses_unit', { count: (((__oc19 = (__oc18 = entry.guesses) !== null && __oc18 !== void 0 ? __oc18 : entry.turns) !== null && __oc19 !== void 0 ? __oc19 : 0)) }),
            ];
            for (const value of cells) {
                const td = document.createElement('td');
                td.textContent = value;
                tr.append(td);
            }
            body.append(tr);
        }
        table.append(body);
        $('leaderboard').replaceChildren(data.entries.length ? table : document.createTextNode(t('no_records')));
        if (data.mine) {
            $('own-rank').textContent = `${t('your_record')} · #${data.mine.rank} · ${formatRecordTime(data.mine.bestTimeMs)} (${t('guesses_unit', { count: data.mine.guesses })})`;
        }
    } catch (error) {
        reportException(error, 'leaderboard');
        $('leaderboard').textContent = t(Object.prototype.hasOwnProperty.call(messages[locale], error.code) ? error.code : 'network_error');
    }
}

function showGuide() {
    const p = state.profile || blankProfile;
    $('stat-played').textContent = String(p.gamesPlayed || 0);
    $('stat-wins').textContent = String(p.wins || 0);
    $('stat-giveups').textContent = String(p.giveUps || 0);
    $('stat-total-guesses').textContent = String(p.totalGuesses || 0);
    $('stat-streak').textContent = String(p.streak || 0);
    $('stat-best-time').textContent = formatRecordTime(p.bestTimeMs);
    openDialog('guide-dialog');
}

$('guess-input').value = storage.get('draft') || '';
$('start').addEventListener('click', start);
$('next-game').addEventListener('click', start);
$('resume').addEventListener('click', () => action(async () => {
    const data = await request(`games/${state.profile.activeGame}`);
    render(data);
}));

$('guess-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!busy && !composing) submitGuess();
});

$('send').addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' && document.activeElement === $('guess-input')) event.preventDefault();
});

$('guess-input').addEventListener('input', () => {
    storage.set('draft', $('guess-input').value);
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
    chip.addEventListener('click', () => { var __oc20;
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
$('give-up').addEventListener('click', () => openDialog('give-up-dialog'));
$('confirm-give-up').addEventListener('click', () => action(async () => {
    const data = await request(`games/${state.game.id}/give-up`, {
        requestId: requestId(),
        expectedVersion: state.game.version,
    });
    $('give-up-dialog').close();
    render(data, { effects: true });
}));

$('open-nearest').addEventListener('click', openNearestModal);
$('open-ranking-result').addEventListener('click', showRanking);
$('nearest-filter').addEventListener('input', event => renderNearestRows(event.target.value));
$('share-result').addEventListener('click', copyShare);
$('ranking-open').addEventListener('click', showRanking);
$('guide-open').addEventListener('click', showGuide);
$('settings-open').addEventListener('click', () => openDialog('settings-dialog'));

$('name-form').addEventListener('submit', async event => {
    event.preventDefault();
    const cleaned = $('name-input').value.normalize('NFKC').replace(/\s+/g, ' ').trim();
    const alnumCount = (cleaned.match(/[\p{L}\p{N}]/gu) || []).length;
    if (!/^[\p{L}\p{N} ._-]{2,16}$/u.test(cleaned) || alnumCount < 2) {
        $('name-status').textContent = t('invalid_name');
        return;
    }
    try {
        const data = await request('profile', { name: cleaned }, 'PATCH');
        state.profile = data.profile;
        $('name-status').textContent = t('saved_name');
        await showRanking();
    } catch (error) {
        $('name-status').textContent = t(Object.prototype.hasOwnProperty.call(messages[locale], error.code) ? error.code : 'network_error');
    }
});

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
        storage.set('draft', $('guess-input').value);
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
    if (!busy && screen === 'game') recover().catch(() => {});
});
window.addEventListener('offline', () => notify('offline', {}, true));

// 백그라운드·잠금·탭 전환 복귀 즉시 서버 기준 시간으로 타이머 동기화
function handleForeground() { var __oc21;
    tickTimer();
    if (!document.hidden && !busy && (screen === 'game' || (((__oc21 = state.game) === null || __oc21 === void 0 ? void 0 : __oc21.status)) === 'active')) {
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
        const open = screen === 'game' && unzoomed && reduced && (focused || wasOpen);
        document.body.classList.toggle('keyboard-open', open);
        const overlap = Math.max(0, window.innerHeight - height);
        document.body.style.setProperty('--keyboard-height', `${open ? overlap + 16 : 0}px`);
        if (screen !== 'game' || !focused || !unzoomed || busy) return;
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
    const previousView = storage.get('view');
    const epoch = mutationEpoch;
    try {
        const profile = await request('profile');
        if (epoch !== mutationEpoch) return;
        render(profile, { navigate: false });
        if (previousView === 'game' && profile.game) render(profile);
        else if (previousView === 'game' && storage.get('game') && !profile.game) {
            const finished = await request(`games/${storage.get('game')}`).catch(() => null);
            if (finished && epoch === mutationEpoch) render(finished);
        }
    } catch (error) {
        reportException(error, 'initial_state');
    }
    if (!storage.available) notify('storage_notice', {}, true);
}

initialize();
window.addEventListener('error', event => { if (event.error) reportException(event.error, 'uncaught'); });
window.addEventListener('unhandledrejection', event => reportException(event.reason, 'unhandled_rejection'));
