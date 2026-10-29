import { messages, translation } from './i18n.mjs';
import { request, requestId, storage, reportException } from './api.mjs';
import { GameAudio } from './audio.mjs';

const locale = document.documentElement.lang === 'en' ? 'en' : 'ko';
const t = translation(locale);
const $ = id => document.getElementById(id);
const audio = new GameAudio();
const blankProfile = { streak: 0, bestStreak: 0, bestTurns: 0, name: '', activeGame: null };
let state = { profile: blankProfile, game: null };
let mode = storage.get('mode') === 'guesses' ? 'guesses' : 'questions';
let busy = false; let noticeTimer; let composing = false; let screen = 'title'; let mutationEpoch = 0;
let pendingCommand;
let blockedElements = [];
let focusBeforeJudging;
let syncKeyboard = () => {};
try { pendingCommand = JSON.parse(storage.get('pending') || 'null'); } catch { pendingCommand = null; }

function notify(key, permanent = false) {
    clearTimeout(noticeTimer);
    $('notice').textContent = t(Object.hasOwn(messages[locale], key) ? key : 'network_error');
    $('notice').hidden = false;
    if (!permanent) noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 6500);
}

function changeScreen(next) {
    screen = next; document.body.dataset.screen = next;
    for (const item of ['title', 'game', 'result']) $(item + '-screen').hidden = next !== item;
    storage.set('view', next);
    window.scrollTo({ top: 0, behavior: 'instant' });
}

function setBusy(value) {
    busy = value;
    for (const id of ['start', 'resume', 'send', 'next-game', 'give-up', 'confirm-give-up', 'question-mode', 'guess-mode', 'home']) $(id).disabled = value;
    $('question-input').setAttribute('aria-busy', String(value));
    $('pending').hidden = !value || screen !== 'game';
    $('question-form').setAttribute('aria-busy', String(value));
    for (const link of document.querySelectorAll('.languages a')) link.setAttribute('aria-disabled', String(value));
}

function blockScreen(value) {
    const overlay = $('judging-overlay');
    if (value) {
        focusBeforeJudging = document.activeElement;
        blockedElements = [...document.body.children].filter(node => node !== overlay && !node.inert);
        blockedElements.forEach(node => { node.inert = true; });
        overlay.hidden = false;
        document.body.classList.add('is-judging');
        overlay.focus({ preventScroll: true });
    } else {
        overlay.hidden = true;
        blockedElements.forEach(node => { node.inert = false; });
        blockedElements = [];
        document.body.classList.remove('is-judging');
        const focusTarget = screen === 'result' ? $('result-title') : focusBeforeJudging;
        if (focusTarget?.isConnected && !focusTarget.disabled) focusTarget.focus({ preventScroll: true });
        focusBeforeJudging = null;
    }
}
$('judging-overlay').addEventListener('keydown', event => {
    if (['Tab', 'Escape'].includes(event.key)) event.preventDefault();
});

function saveDraft() { storage.set('draft', $('question-input').value); storage.set('mode', mode); }
function countInput() {
    const maximum = mode === 'questions' ? 200 : 80;
    $('input-count').textContent = `${[...$('question-input').value].length} / ${maximum}`;
    $('input-count').style.color = [...$('question-input').value].length > maximum ? '#e4a394' : '';
}

function setMode(next, sound = false, force = false) {
    if (busy && !force) return;
    mode = next;
    $('question-mode').setAttribute('aria-pressed', String(mode === 'questions'));
    $('guess-mode').setAttribute('aria-pressed', String(mode === 'guesses'));
    $('game-screen').dataset.mode = mode;
    $('input-label').textContent = t(mode === 'questions' ? 'question_mode' : 'guess_mode');
    $('question-input').placeholder = t(mode === 'questions' ? 'question_placeholder' : 'guess_placeholder');
    countInput(); saveDraft();
    if (sound) { audio.play('click'); $('question-input').focus(); }
}

function makeHistory(history, eventId) {
    const fragment = document.createDocumentFragment();
    for (const entry of history.filter(row => row.mode !== 'give-up')) {
        const row = document.createElement('article');
        row.dataset.requestId = entry.request_id;
        row.className = 'history-row' + (entry.request_id === eventId ? ' is-new' : '');
        const number = document.createElement('span'); number.className = 'history-number';
        number.textContent = entry.charged ? String(entry.ordinal).padStart(2, '0') : '·';
        const content = document.createElement('p'); content.className = 'history-question';
        if (entry.mode === 'guesses') { const label = document.createElement('span'); label.className = 'history-mode'; label.textContent = t('guess_label'); content.append(label); }
        content.append(document.createTextNode(entry.input));
        const stamp = document.createElement('span'); stamp.className = `stamp ${entry.code}`;
        const decision = entry.decision || entry.code;
        stamp.textContent = ['yes', 'no'].includes(decision) ? t(decision) : entry.code === 'correct' ? '✓' : entry.code === 'wrong_guess' ? '×' : '?';
        stamp.setAttribute('aria-label', ['yes', 'no'].includes(decision) ? t(decision) : t(entry.code === 'correct' ? 'win' : entry.code));
        row.append(number, content, stamp);
        if (['unknown', 'multiple', 'duplicate', 'wrong_guess'].includes(entry.code)) {
            const note = document.createElement('p'); note.className = 'history-note'; note.textContent = t(entry.code); row.append(note);
        }
        fragment.append(row);
    }
    return fragment;
}

function render(data, { navigate = true, effects = false } = {}) {
    if (data.game && state.game?.id === data.game.id && data.game.version < state.game.version) return;
    effects = effects && !data.event?.replayed;
    state = data;
    const profile = data.profile;
    $('hero-streak').textContent = profile.streak;
    $('hero-best').textContent = profile.bestStreak;
    $('resume').hidden = !profile.activeGame;
    if (!data.game) return;
    const game = data.game;
    storage.remove('start_request'); storage.remove('start_locale');
    storage.set('game', game.id);
    if (game.status === 'active') {
        if (navigate) changeScreen('game');
        $('remaining').textContent = game.remaining;
        $('game-streak').textContent = profile.streak;
        $('last-turn').hidden = game.remaining !== 1;
        for (const [index, mark] of [...$('turn-marks').children].entries()) mark.classList.toggle('spent', index < game.turnsUsed);
        const history = $('history'); const pinned = history.scrollHeight - history.scrollTop - history.clientHeight < 80;
        const rows = game.history.filter(entry => entry.mode !== 'give-up');
        const previous = [...history.children];
        const prefixMatches = previous.length <= rows.length && previous.every((row, index) => row.dataset.requestId === rows[index].request_id);
        if (prefixMatches) history.append(makeHistory(rows.slice(previous.length), effects ? data.event?.requestId : null));
        else history.replaceChildren(makeHistory(rows, effects ? data.event?.requestId : null));
        $('empty-history').hidden = game.history.some(item => item.mode !== 'give-up');
        if (pinned || effects) history.scrollTop = history.scrollHeight;
    } else {
        if (navigate) changeScreen('result');
        const won = game.status === 'won';
        $('result-screen').classList.toggle('solved', won && effects);
        $('result-title').textContent = t(won ? 'win' : game.status === 'given_up' ? 'given_up' : game.status === 'expired' ? 'expired' : 'lose');
        $('result-answer').textContent = game.answer?.[locale] || '';
        $('result-turns').textContent = `${game.turnsUsed} / 20`;
        $('result-streak').textContent = profile.streak;
        $('result-best').textContent = profile.bestStreak;
        $('result-note').textContent = t(won ? 'result_note' : 'failure_note');
        $('record-badge').hidden = !won || !game.recordImproved;
        $('next-game').firstChild.textContent = t(won ? 'next' : 'retry');
        $('result-history').replaceChildren(makeHistory(game.history));
        $('result-history').hidden = true; $('history-toggle').setAttribute('aria-expanded', 'false'); $('history-toggle').textContent = t('history');
        const source = game.answer?.source;
        const sourceUrl = typeof source === 'string' ? source : source?.url;
        $('answer-source').hidden = !/^https:\/\/(en|ko)\.wikipedia\.org\//.test(sourceUrl || '');
        if (!$('answer-source').hidden) $('answer-source').href = sourceUrl;
        if (won && effects && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
            const container = document.querySelector('.success-particles'); container.replaceChildren();
            for (let i = 0; i < 20; i++) {
                const particle = document.createElement('i'); particle.className = 'particle';
                particle.style.setProperty('--x', `${Math.cos(i * Math.PI / 10) * (100 + i * 6)}px`);
                particle.style.setProperty('--y', `${Math.sin(i * Math.PI / 10) * 120 + 120}px`);
                particle.style.setProperty('--delay', `${(i % 4) * 40 + 150}ms`); container.append(particle);
            }
            setTimeout(() => container.replaceChildren(), 1500);
        }
        if (navigate) { $('result-title').tabIndex = -1; $('result-title').focus({ preventScroll: true }); }
    }
    if (effects) audio.result(data.event, game);
    requestAnimationFrame(syncKeyboard);
}

async function recover() {
    const epoch = mutationEpoch;
    const gameId = state.game?.id || storage.get('game');
    const data = gameId ? await request(`games/${gameId}`) : await request('profile');
    if (epoch === mutationEpoch) render(data, { navigate: screen !== 'title' });
    return data;
}

async function action(callback, { blocking = false } = {}) {
    if (busy) return;
    mutationEpoch++;
    audio.unlock(); setBusy(true); $('notice').hidden = true;
    if (blocking) blockScreen(true);
    try { await callback(); }
    catch (error) {
        reportException(error, 'game_action');
        if (['stale_state', 'game_finished', 'network_error'].includes(error.code)) {
            try {
                const recovered = await recover();
                if (pendingCommand && recovered.game?.history.some(entry => entry.request_id === pendingCommand.body.requestId)) {
                    if ($('question-input').value.trim() === pendingCommand.body.text) $('question-input').value = '';
                    pendingCommand = null; storage.remove('pending'); saveDraft();
                }
            } catch { /* Keep the pending command until the server can be reached. */ }
        }
        if (error.code === 'stale_state') { pendingCommand = null; storage.remove('pending'); }
        notify(error.code || 'network_error');
    } finally { setBusy(false); if (blocking) blockScreen(false); countInput(); }
}

async function start() {
    await action(async () => {
        audio.play('click');
        let startId = storage.get('start_request');
        if (!startId) { startId = requestId(); storage.set('start_request', startId); storage.set('start_locale', locale); }
        const data = await request('games', { locale: storage.get('start_locale') || locale, requestId: startId });
        storage.remove('start_request'); storage.remove('start_locale');
        pendingCommand = null; storage.remove('pending'); $('question-input').value = ''; saveDraft();
        if (data.event?.code === 'started') setMode('questions', false, true);
        render(data); audio.play('send', { gain: 0.5, duration: 0.18 });
    });
}

async function submit(event) {
    event.preventDefault();
    if (busy || composing || state.game?.status !== 'active') return;
    const text = $('question-input').value.trim();
    if (!text) { $('question-input').focus(); return; }
    if ([...text].length > (mode === 'questions' ? 200 : 80)) { notify('input_too_long'); return; }
    await action(async () => {
        const path = `games/${state.game.id}/${mode}`;
        const samePending = pendingCommand?.path === path && pendingCommand.body.text === text;
        const body = samePending ? pendingCommand.body : { text, locale, requestId: requestId(), expectedVersion: state.game.version };
        if (!samePending) { pendingCommand = { path, body }; storage.set('pending', JSON.stringify(pendingCommand)); }
        audio.play('send', { gain: 0.45, duration: 0.18 });
        const data = await request(path, body);
        pendingCommand = null; storage.remove('pending');
        if ($('question-input').value.trim() === text) $('question-input').value = '';
        saveDraft();
        render(data, { effects: true });
        if (data.event?.code === 'wrong_guess' && data.game.status === 'active') {
            $('question-form').classList.remove('wrong'); requestAnimationFrame(() => $('question-form').classList.add('wrong'));
        }
    }, { blocking: true });
    if (state.game?.status === 'active') $('question-input').focus({ preventScroll: true });
}

function openDialog(id) { audio.unlock(); audio.play(id === 'ranking-dialog' ? 'ranking' : 'click', { gain: 0.6, duration: 0.35 }); $(id).showModal(); }
async function showRanking(open = true) {
    if (open) openDialog('ranking-dialog');
    $('leaderboard').textContent = t('loading'); $('own-rank').textContent = '';
    try {
        const data = await request('leaderboard');
        const table = document.createElement('table');
        const head = document.createElement('thead'); const row = document.createElement('tr');
        for (const key of ['rank', 'detective', 'best', 'total_turns']) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = t(key); row.append(th); }
        head.append(row); table.append(head); const body = document.createElement('tbody');
        for (const entry of data.entries) {
            const tr = document.createElement('tr'); if (entry.own) tr.className = 'own';
            for (const value of [entry.rank, entry.name, entry.streak, entry.turns]) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
            body.append(tr);
        }
        table.append(body); $('leaderboard').replaceChildren(data.entries.length ? table : document.createTextNode(t('no_records')));
        if (data.mine) $('own-rank').textContent = `${t('your_record')} · #${data.mine.rank} · ${data.mine.streak} ${t('cases')}`;
    } catch (error) { reportException(error, 'leaderboard'); $('leaderboard').textContent = t(Object.hasOwn(messages[locale], error.code) ? error.code : 'network_error'); }
}

for (let i = 0; i < 20; i++) { const mark = document.createElement('i'); mark.className = 'turn-mark'; $('turn-marks').append(mark); }
$('question-input').value = storage.get('draft') || ''; setMode(mode);
$('start').addEventListener('click', start); $('next-game').addEventListener('click', start);
$('resume').addEventListener('click', () => action(async () => { render(await request(`games/${state.profile.activeGame}`)); }));
$('question-mode').addEventListener('click', () => setMode('questions', true));
$('guess-mode').addEventListener('click', () => setMode('guesses', true));
$('question-form').addEventListener('submit', submit);
$('send').addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' && document.activeElement === $('question-input')) event.preventDefault();
});
$('question-input').addEventListener('input', () => { saveDraft(); countInput(); });
$('question-input').addEventListener('compositionstart', () => { composing = true; });
$('question-input').addEventListener('compositionend', () => { composing = false; countInput(); });
$('question-input').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !composing && event.keyCode !== 229) { event.preventDefault(); $('question-form').requestSubmit(); }
});
for (const id of ['home', 'result-home']) $(id).addEventListener('click', () => { saveDraft(); audio.play('click'); changeScreen('title'); });
$('give-up').addEventListener('click', () => openDialog('give-up-dialog'));
$('confirm-give-up').addEventListener('click', () => action(async () => {
    const data = await request(`games/${state.game.id}/give-up`, { requestId: requestId(), expectedVersion: state.game.version });
    $('give-up-dialog').close(); render(data, { effects: true });
}));
$('ranking-open').addEventListener('click', showRanking);
$('settings-open').addEventListener('click', () => openDialog('settings-dialog'));
$('sound-enabled').checked = audio.enabled; $('sound-volume').value = Math.round(audio.volume * 100);
$('sound-enabled').addEventListener('change', () => audio.configure($('sound-enabled').checked));
$('sound-volume').addEventListener('input', () => audio.configure($('sound-enabled').checked, Number($('sound-volume').value) / 100));
$('sound-volume').addEventListener('change', () => audio.play('click'));
$('history-toggle').addEventListener('click', () => { const hidden = !$('result-history').hidden; $('result-history').hidden = hidden; $('history-toggle').setAttribute('aria-expanded', String(!hidden)); $('history-toggle').textContent = t(hidden ? 'history' : 'hide_history'); });
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('.languages a').forEach(link => link.addEventListener('click', event => { if (busy) { event.preventDefault(); return; } saveDraft(); }));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } }));
window.addEventListener('online', () => { if (!busy && screen === 'game') recover().catch(() => {}); });
window.addEventListener('offline', () => notify('offline', true));
document.addEventListener('visibilitychange', () => { if (!document.hidden && !busy && screen === 'game') recover().catch(() => {}); });
if (window.visualViewport) {
    const resize = () => {
        const overlap = Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop);
        const open = screen === 'game' && overlap > 130;
        document.body.classList.toggle('keyboard-open', open);
        document.body.style.setProperty('--keyboard-height', `${overlap}px`);
        if (open && document.activeElement === $('question-input')) requestAnimationFrame(() => {
            const extra = $('question-input').getBoundingClientRect().bottom - (visualViewport.height + visualViewport.offsetTop - 12);
            if (extra > 0) window.scrollBy({ top: extra, behavior: 'instant' });
        });
    };
    visualViewport.addEventListener('resize', resize);
    syncKeyboard = resize;
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
        else if (previousView === 'result' && storage.get('game') && !profile.game) {
            const result = await request(`games/${storage.get('game')}`);
            if (epoch === mutationEpoch) render(result);
        }
    } catch (error) { reportException(error, 'initial_state'); }
    if (!storage.available) notify('storage_notice', true);
}
initialize();
window.addEventListener('error', event => { if (event.error) reportException(event.error, 'uncaught'); });
window.addEventListener('unhandledrejection', event => reportException(event.reason, 'unhandled_rejection'));
