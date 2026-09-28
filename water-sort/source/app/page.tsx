'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { complete, hasMove, won } from '../lib/game';
import { timeLimit, pourDuration, CLEAR_DELAY, type RunView, type RankRow } from '../lib/challenge-rules';
import { copy as c } from './copy';
import { PourAnimation, measurePour, type PourMotion } from './PourAnimation';
import { useBottleDrag } from './useBottleDrag';
import { useGameAudio } from './useGameAudio';
import { BottleVisual } from './BottleVisual';
import { BottleCompletion } from './BottleCompletion';
import { menuState } from '../lib/menu-state';
import { MAX_QUEUED_POURS, PourController, type ActivePour } from '../lib/pour-controller';

const API = import.meta.env.DEV ? '/water-sort/api/challenge' : 'https://game-api.yama5993.workers.dev/water-sort/challenge';
const SESSION = 'water-sort-challenge-v2';
type Credentials = { id: string; token: string };
function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-labelledby="modal-title"><div className="modal-inner"><button className="icon-button modal-close" onClick={onClose} aria-label={c.close}>×</button><h2 id="modal-title">{title}</h2>{children}</div></dialog>;
}
function Results({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="result-dialog" onCancel={e => e.preventDefault()} aria-labelledby="result-title"><section className="result-card">{children}</section></dialog>;
}
export default function Home() {
  const [run, setRun] = useState<RunView | null>(null), runRef = useRef<RunView | null>(null);
  const [atHome, setAtHome] = useState(true);
  const credentials = useRef<Credentials | null>(null);
  const requestEpoch = useRef(0), pendingRequest = useRef<AbortController | null>(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), lock = useRef(false);
  const [selected, setSelected] = useState<number | null>(null);
  const { audio, soundOn, toggleSound } = useGameAudio();
  const lastSoundCue = useRef('');
  const [notice, setNotice] = useState<string>(c.choose), [error, setError] = useState('');
  const [modal, setModal] = useState<'help' | 'ranking' | 'register' | 'exit' | 'restart' | null>(null);
  const [motions, setMotions] = useState<PourMotion[]>([]);
  const [, redrawPours] = useState(0);
  const tubes = useRef<(HTMLSpanElement | null)[]>([]), settleTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const [now, setNow] = useState(0), clockOffset = useRef(0);
  const [nickname, setNickname] = useState(''), [rows, setRows] = useState<RankRow[]>([]), [rankState, setRankState] = useState('');
  const retry = useRef<() => void>(() => {});
  const controllerRef = useRef<PourController | null>(null);
  if (!controllerRef.current) controllerRef.current = new PourController({
    getRun: () => runRef.current,
    clock: () => Date.now() + clockOffset.current,
    send: (from, to) => call('pour', { from, to }),
    accept,
    start: startMotion,
    change: () => redrawPours(value => value + 1),
    reset: () => { setMotions([]); for (const timer of settleTimers.current.values()) clearTimeout(timer); settleTimers.current.clear(); },
    error: e => { audio.stop(); setError(e instanceof Error ? e.message : c.error); },
    invalid: () => { setNotice(c.invalid); audio.play('invalid'); },
  });
  const pours = controllerRef.current;
  function accept(next: RunView) { runRef.current = next; setRun(next); clockOffset.current = next.serverNow - Date.now(); setNow(next.serverNow); }
  async function call(type: string, extra: Record<string, unknown> = {}, retryTransition = true): Promise<RunView> {
    const epoch = requestEpoch.current, controller = new AbortController();
    pendingRequest.current = controller;
    try {
      const response = await fetch(API, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, ...credentials.current, version: runRef.current?.version, ...extra }) });
      const data = await response.json() as { error?: string; run: RunView; token?: string };
      if (epoch !== requestEpoch.current) throw new DOMException('Abandoned game', 'AbortError');
      if (!response.ok) {
        if (data.run) accept(data.run);
        // A pour may finish on the server while Home aborts its response.
        // Retry the transition once against that authoritative version.
        if ((type === 'resume' || type === 'leave') && retryTransition && data.error === 'conflict' && data.run) return await call(type, extra, false);
        throw new Error(data.error === 'nickname' ? c.nicknameError : data.error === 'conflict' ? c.syncChanged : c.error);
      }
      if (data.token) { credentials.current = { id: data.run.id, token: data.token }; try { localStorage.setItem(SESSION, JSON.stringify(credentials.current)); } catch { /* In-memory credentials still allow this run to finish. */ } }
      return data.run as RunView;
    } finally { if (pendingRequest.current === controller) pendingRequest.current = null; }
  }
  async function perform(type: string, extra: Record<string, unknown> = {}, showGame = true) {
    if (lock.current) return;
    const epoch = requestEpoch.current;
    lock.current = true; setBusy(true); setError(''); retry.current = () => { void perform(type, extra, showGame); };
    try {
      let next = await call(type, extra);
      if (epoch !== requestEpoch.current) return;
      cancelPreview();
      accept(next);
      // Reload opens the start screen too; save that interruption before enabling Continue.
      if (type === 'sync' && !showGame && !next.registered && next.status !== 'ended' && !next.suspended) {
        next = await call('leave');
        if (epoch !== requestEpoch.current) return;
        accept(next);
      }
      if (showGame) setAtHome(false);
      setSelected(null); setNotice(c.choose);
      if (type !== 'register') setModal(null);
      if (type === 'start') audio.play('start');
    }
    catch (e) { if (epoch === requestEpoch.current) setError(e instanceof Error ? e.message : c.error); }
    finally { if (epoch === requestEpoch.current) { lock.current = false; setBusy(false); setReady(true); } }
  }
  useEffect(() => {
    try { const raw = localStorage.getItem(SESSION); if (raw) { const saved = JSON.parse(raw); if (typeof saved.id === 'string' && typeof saved.token === 'string') credentials.current = saved; } } catch { /* A new run remains available. */ }
    if (credentials.current) void perform('sync', {}, false); else setReady(true);
    const ticker = setInterval(() => { setNow(Date.now() + clockOffset.current); pours.tick(); }, 50);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSelected(null); pours.cancelQueued(); setNotice(c.choose); } };
    const hidden = () => { if (document.hidden) pours.cancelQueued(); };
    const resized = () => pours.cancelQueued();
    window.addEventListener('keydown', key);
    window.addEventListener('resize', resized);
    document.addEventListener('visibilitychange', hidden);
    return () => { clearInterval(ticker); window.removeEventListener('keydown', key); window.removeEventListener('resize', resized); document.removeEventListener('visibilitychange', hidden); requestEpoch.current++; pendingRequest.current?.abort(); pours.clear(); };
  }, []);
  useEffect(() => { if (modal) pours.cancelQueued(); }, [modal]);
  const expired = run?.status === 'playing' && !run.suspended && now >= run.deadline;
  useEffect(() => {
    if (atHome || !expired) return;
    cancelPreview();
    if (!busy && !error) void perform('sync');
  }, [atHome, expired, busy, error]);
  useEffect(() => {
    if (!atHome && run?.status === 'cleared' && now >= run.availableAt + CLEAR_DELAY && !motions.length && !pours.entries.length && !busy && !error && !modal) void perform('sync');
  }, [atHome, run, now, motions, busy, error, modal]);
  function home() {
    requestEpoch.current++;
    pendingRequest.current?.abort(); pendingRequest.current = null;
    lock.current = false; setBusy(false); setReady(true); retry.current = () => {};
    audio.stop();
    cancelPreview();
    setAtHome(true); setModal(null); setError(''); setSelected(null);
    setNotice(c.choose); lastSoundCue.current = '';
    if (runRef.current && runRef.current.status !== 'ended' && !runRef.current.registered) void perform('leave', {}, false);
  }
  function cancelPreview() {
    pours.clear();
  }
  function finishMotion(id: number) {
    setMotions(items => items.filter(m => m.id !== id));
    const timer = settleTimers.current.get(id);
    if (timer) clearTimeout(timer);
    settleTimers.current.delete(id);
    pours.finish(id);
  }
  async function choose(index: number) {
    if (!pours.enabled) return;
    if (selected === index) { setSelected(null); setNotice(c.choose); return; }
    if (selected === null) { if (!pours.canStart(index)) { setNotice(c.empty); audio.play('invalid'); return; } setSelected(index); setNotice(c.target); audio.play('select'); return; }
    await pourFrom(selected, index);
  }
  async function pourFrom(from: number, index: number) {
    if (!pours.enabled) return;
    retry.current = () => { void perform('sync'); };
    const result = pours.request(from, index);
    setSelected(null);
    if (result === 'full') { setNotice(c.queueFull); audio.play('invalid'); }
    else if (result !== 'invalid') setNotice(result === 'queued' ? c.queued : hasMove(pours.board) ? c.choose : c.blocked);
  }
  function startMotion(entry: ActivePour) {
    const { id, from, to, before, amount } = entry;
    const source = tubes.current[from], destination = tubes.current[to];
    const geometry = source && destination ? measurePour(source, destination) : null;
    const seconds = pourDuration(amount) / 1000;
    audio.play('pour', seconds * .27, seconds * .46);
    const h = window.visualViewport?.height ?? innerHeight;
    if (geometry && !matchMedia('(prefers-reduced-motion: reduce)').matches && geometry.source.y > 30 && geometry.destination.y > 48 && Math.max(geometry.source.y + geometry.source.height, geometry.destination.y + geometry.destination.height) < h - 6) {
      setMotions(items => [...items, { id, from, to, before, amount, started: performance.now(), ...geometry }]);
    } else {
      settleTimers.current.set(id, setTimeout(() => { finishMotion(id); setNow(Date.now() + clockOffset.current); }, pourDuration(amount)));
    }
  }
  async function loadRanks() {
    setRankState(c.rankLoading);
    try { const response = await fetch(API); if (!response.ok) throw new Error(); const data = await response.json() as { rows: RankRow[] }; setRows(data.rows); setRankState(''); }
    catch { setRankState(c.rankError); }
  }
  function openRanks() { setModal('ranking'); void loadRanks(); }
  const level = run?.level ?? 1, active = run?.status === 'playing' && !run.suspended && !expired;
  const animating = !!motions.length || !!pours.entries.length || !!run && now < run.availableAt;
  const ended = run?.status === 'ended' || expired;
  const board = pours.board;
  const remaining = run ? Math.max(0, Math.ceil((run.deadline - now) / 1000)) : timeLimit(1);
  const disabled = !active || busy || !!error || won(board);
  pours.enabled = !atHome && !disabled && !modal;
  const clockKey = run ? `${run.id}:${run.level}` : null;
  const clockRunning = !atHome && !!run && !ended && (run.status === 'playing' || now < run.availableAt);
  useEffect(() => { audio.countdown(clockKey, remaining, clockRunning); }, [audio, clockKey, remaining, clockRunning]);
  useEffect(() => {
    if (atHome || !run) return;
    const cue = ended && run.cleared < 100 ? 'timeout' : run.status === 'cleared' && !animating ? 'clear' : null;
    const key = `${run.id}:${run.level}:${cue}`;
    if (!cue || lastSoundCue.current === key) return;
    lastSoundCue.current = key;
    if (cue === 'timeout') audio.stop();
    audio.play(cue);
  }, [atHome, run, ended, animating, audio]);
  const drag = useBottleDrag({
    disabled: atHome || disabled || !!modal,
    canStart: from => pours.canStart(from),
    canPour: (from, to) => pours.canRequest(from, to),
    onDragStart: () => audio.play('select'),
    onTargetEnter: () => audio.play('target'),
    onDrop: (from, to) => { setSelected(null); void pourFrom(from, to); },
  });
  const savedRun = !!run && !run.registered;
  const { canContinue } = menuState(run, now);
  return <div className={'lab-app ' + (!atHome && run ? 'in-game' : 'at-home')} onPointerDownCapture={() => audio.unlock()} onKeyDownCapture={e => { if (e.key === 'Enter' || e.key === ' ') audio.unlock(); }}>
    <div className="lab-scenery" aria-hidden="true"/><div className="lab-haze" aria-hidden="true"/>
    <main id="game" className="lab-main">
      {atHome || !run ? <section className="start-screen">
        <div className="lab-badge"><span aria-hidden="true">✦</span> BUBBLY LAB</div>
        <h1 className="game-title" aria-label="보글보글 실험실"><span>보글보글</span><span>실험실<span className="title-bubble" aria-hidden="true">✧</span></span></h1>
        <p className="start-tagline">{c.tagline}</p>
        <div className="hero-art"><img src="/water-sort/lab-background.png" alt="" fetchPriority="high"/><span className="hero-spark spark-a" aria-hidden="true">✦</span><span className="hero-spark spark-b" aria-hidden="true">✧</span></div>
        <div className="start-actions">
          <button className="primary-button play-button" disabled={!ready || busy} onClick={() => { if (savedRun) setModal('restart'); else void perform('start'); }}><span aria-hidden="true">▶</span>{c.newGame}</button>
          <button className="secondary-button continue-button" disabled={!ready || busy || !canContinue} onClick={() => { void perform('resume'); }}><span aria-hidden="true">▶</span>{c.continueGame}</button>
          <div className="start-secondary"><button className="secondary-button" onClick={openRanks}><span aria-hidden="true">♛</span>{c.ranking}</button><button className="secondary-button" onClick={() => setModal('help')}><span aria-hidden="true">?</span>{c.how}</button></div>
        </div>
        <p className="start-caption">{c.readyBody}</p>
        <div className="start-footer"><button className="sound-toggle" aria-pressed={soundOn} onClick={toggleSound}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/>{soundOn ? <path d="M16 8q5 4 0 8M19 5q8 7 0 14"/> : <path d="m17 9 5 6m0-6-5 6"/>}</svg>{soundOn ? c.soundOn : c.soundOff}</button><a className="archerlab-link" href="https://archerlab.dev/"><span aria-hidden="true">↗</span>{c.archerlab}</a></div>
      </section> : <section className="play-screen" aria-label="보글보글 실험실">
        <div className="game-hud"><div className="hud-stat stage-stat"><span>{c.stage}</span><strong>{level.toString().padStart(2, '0')}</strong></div><button type="button" className="hud-home" onClick={() => setModal('exit')} aria-label={c.home} title={c.home}><span aria-hidden="true">🏠</span></button><div className="hud-stat score-stat"><span>{c.score}</span><strong data-testid="score">{run.score.toLocaleString()}</strong></div></div>
        <div className={'timer-strip ' + (remaining <= 10 && active ? 'low' : '')} role="timer" aria-label={`${remaining}${c.seconds}`}><div className="timer-track"><div className="timer-fill" style={{ transform: `scaleX(${Math.max(0, Math.min(1, (run.deadline - now) / 60000))})` }}/></div><span className="timer-number">{ended ? 0 : remaining}<small>s</small></span></div>
        <div className="experiment-tray">
          {!!pours.queued.length && <div className="queue-count" role="status">{c.queueBadge} {pours.queued.length}/{MAX_QUEUED_POURS}</div>}
          <div className="tray-spark tray-spark-one" aria-hidden="true">✦</div><div className="tray-spark tray-spark-two" aria-hidden="true">✧</div>
          <div className={'board ' + (board.length > 7 ? 'many-tubes' : '')} role="group" aria-label={c.play}>
            {board.map((tube, i) => {
              const orders = pours.queued.flatMap((intent, index) => intent.from === i || intent.to === i ? [index + 1] : []);
              const queued = orders.length > 0;
              const pouring = pours.busy(i);
              const settled = !pouring && complete(tube) && complete(run.board[i] ?? []);
              return <button key={i} data-testid={`bottle-${i}`} data-bottle-index={i} data-pouring={pouring || undefined} data-queued={queued || undefined} disabled={disabled} aria-pressed={selected === i} aria-label={`${i + 1}${c.bottle}, ${tube.length ? c.bottomUp + ' ' + tube.map(n => c.colorNames[n]).join(', ') : c.emptyBottle}${settled ? ', ' + c.filled : ''}${queued ? ', ' + c.queueOrder + ' ' + orders.join(', ') : ''}`} className={'bottle-button ' + (selected === i ? 'selected ' : '') + (complete(tube) ? 'complete ' : '') + (motions.some(m => m.from === i) ? 'pour-source ' : '') + (motions.some(m => m.to === i) ? 'pour-target ' : '') + (queued ? 'pour-queued ' : '') + (pouring ? 'in-flight' : '')} onPointerDown={e => drag.onPointerDown(e, i)} onPointerMove={drag.onPointerMove} onPointerUp={drag.onPointerUp} onPointerCancel={drag.onPointerCancel} onLostPointerCapture={drag.onLostPointerCapture} onClick={e => { if (drag.allowClick(e.detail)) void choose(i); }}>
                <span className="tube" ref={node => { tubes.current[i] = node; }}><BottleVisual colors={tube} selected={selected === i}/></span>
                <span className="drop-cue" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14m-6-6 6 6 6-6"/></svg></span>
                <span className={'bottle-status ' + (queued ? 'queue-label' : '')} aria-hidden="true">{queued ? orders.join('·') : ''}</span>
                <BottleCompletion key={`${run.level}:${i}`} ready={settled} color={tube[0]} hideLabel={queued}/>
              </button>;
            })}
          </div>
          {run.status === 'cleared' && !animating && <div className="clear-burst" role="status">✦ {c.success} ✦</div>}
        </div>
        <p className={'board-notice ' + ([c.invalid, c.empty, c.blocked, c.queueFull].includes(notice as typeof c.invalid) ? 'visible' : 'sr-only')} role="status">{notice}</p>
      </section>}
      {error && <div className="connection-error" role="alert"><p>{error}</p><button className="secondary-button" disabled={busy} onClick={() => retry.current()}>{c.retry}</button></div>}
    </main>
    {!!motions.length && <PourAnimation motions={motions} onFinish={finishMotion}/>}
    {!atHome && ended && run && !modal && <Results><span className="result-sticker" aria-hidden="true">{run.cleared === 100 ? '★' : '⌛'}</span><p className="result-eyebrow">{run.cleared === 100 ? 'ALL CLEAR!' : 'TIME OVER'}</p><h2 id="result-title">{run.cleared === 100 ? c.allClear : c.ended}</h2><div className="result-score">{run.score.toLocaleString()}<small>{c.point}</small></div><p className="result-stage">{c.stage} {run.level} · {c.cleared} {run.cleared}</p>{run.registered && <p role="status">{c.registered}</p>}<button className="primary-button" disabled={busy || run.status !== 'ended'} onClick={() => run.registered ? openRanks() : setModal('register')}>{run.registered ? c.ranking : c.register}</button><button className="secondary-button" disabled={busy} onClick={home}>{c.home}</button></Results>}
    {modal === 'exit' && <Modal title={c.homeTitle} onClose={() => setModal(null)}><p>{c.homeBody}</p><div className="confirmation-actions"><button className="secondary-button" onClick={() => setModal(null)}>{c.keepPlaying}</button><button className="primary-button" onClick={home}>{c.leaveGame}</button></div></Modal>}
    {modal === 'restart' && <Modal title={c.restartTitle} onClose={() => setModal(null)}><p>{c.restartBody}</p><div className="confirmation-actions"><button className="secondary-button" onClick={() => setModal(null)}>{c.cancel}</button><button className="primary-button" disabled={busy} onClick={() => { void perform('start'); }}>{c.newGame}</button></div></Modal>}
    {modal === 'help' && <Modal title={c.rulesTitle} onClose={() => setModal(null)}><ol className="rules">{c.rules.map(rule => <li key={rule}>{rule}</li>)}</ol><p className="modal-note">{c.recordRule}</p><p className="keyboard-note">{c.keyboard}</p></Modal>}
    {modal === 'register' && run && <Modal title={c.register} onClose={() => setModal(null)}>{run.registered ? <div className="registration-done"><span aria-hidden="true">★</span><p role="status">{c.registered}</p><button className="primary-button" onClick={openRanks}>{c.ranking}</button><button className="secondary-button" onClick={home}>{c.home}</button></div> : <form className="ranking-form" onSubmit={e => { e.preventDefault(); void perform('register', { nickname }); }}><p>{run.score.toLocaleString()}{c.point} · {c.cleared} {run.cleared}</p><label htmlFor="nickname">{c.nickname}</label><input id="nickname" value={nickname} onChange={e => setNickname(e.target.value)} maxLength={16} required autoComplete="nickname" aria-describedby="nickname-help"/><small id="nickname-help">{c.nicknameHelp}</small><button className="primary-button" disabled={busy}>{busy ? c.submitting : c.register}</button>{error && <p className="form-error" role="alert">{error}</p>}</form>}</Modal>}
    {modal === 'ranking' && <Modal title={c.ranking} onClose={() => setModal(null)}><p>{c.rankRule}</p>{rankState ? <p role="status">{rankState}</p> : rows.length ? <ol className="rank-list">{rows.map((row, i) => <li key={row.id} className={row.id === run?.id ? 'my-rank' : ''}><span className="rank-number">{i + 1}</span><strong>{row.nickname}</strong><span>{row.cleared}{c.level}<small>{row.score.toLocaleString()}{c.point}</small></span></li>)}</ol> : <p>{c.rankEmpty}</p>}{rankState === c.rankError && <button className="secondary-button" onClick={() => { void loadRanks(); }}>{c.retry}</button>}</Modal>}
  </div>;
}
