'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { complete, hasMove, pour } from '../lib/game';
import { timeLimit, pourDuration, CLEAR_DELAY, type RunView, type RankRow } from '../lib/challenge-rules';
import { copy as c } from './copy';
import { PourAnimation, measurePour, type PourMotion } from './PourAnimation';
import { useBottleDrag } from './useBottleDrag';
import { useGameAudio } from './useGameAudio';
import { BottleVisual } from './BottleVisual';

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
  const [motion, setMotion] = useState<PourMotion | null>(null), motionLock = useRef(false), sequence = useRef(0);
  const tubes = useRef<(HTMLSpanElement | null)[]>([]), settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [now, setNow] = useState(0), clockOffset = useRef(0);
  const [nickname, setNickname] = useState(''), [rows, setRows] = useState<RankRow[]>([]), [rankState, setRankState] = useState('');
  const retry = useRef<() => void>(() => {});
  function accept(next: RunView) { runRef.current = next; setRun(next); clockOffset.current = next.serverNow - Date.now(); setNow(next.serverNow); }
  async function call(type: string, extra: Record<string, unknown> = {}) {
    const epoch = requestEpoch.current, controller = new AbortController();
    pendingRequest.current = controller;
    try {
      const response = await fetch(API, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, ...credentials.current, version: runRef.current?.version, ...extra }) });
      const data = await response.json() as { error?: string; run: RunView; token?: string };
      if (epoch !== requestEpoch.current) throw new DOMException('Abandoned game', 'AbortError');
      if (!response.ok) {
        if (data.run) accept(data.run);
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
    try { const next = await call(type, extra); if (epoch !== requestEpoch.current) return; accept(next); if (showGame) setAtHome(false); setSelected(null); setNotice(c.choose); if (type !== 'register') setModal(null); if (type === 'start') audio.play('start'); }
    catch (e) { if (epoch === requestEpoch.current) setError(e instanceof Error ? e.message : c.error); }
    finally { if (epoch === requestEpoch.current) { lock.current = false; setBusy(false); setReady(true); } }
  }
  useEffect(() => {
    try { const raw = localStorage.getItem(SESSION); if (raw) { const saved = JSON.parse(raw); if (typeof saved.id === 'string' && typeof saved.token === 'string') credentials.current = saved; } } catch { /* A new run remains available. */ }
    if (credentials.current) void perform('sync', {}, false); else setReady(true);
    const ticker = setInterval(() => setNow(Date.now() + clockOffset.current), 100);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSelected(null); setNotice(c.choose); } };
    window.addEventListener('keydown', key);
    return () => { clearInterval(ticker); window.removeEventListener('keydown', key); if (settleTimer.current) clearTimeout(settleTimer.current); };
  }, []);
  const expired = run?.status === 'playing' && now >= run.deadline;
  useEffect(() => {
    if (atHome || !expired || busy) return;
    setMotion(null); motionLock.current = false;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    if (!error) void perform('sync');
  }, [atHome, expired, busy, error]);
  useEffect(() => {
    if (!atHome && run?.status === 'cleared' && now >= run.availableAt + CLEAR_DELAY && !motion && !motionLock.current && !busy && !error && !modal) void perform('sync');
  }, [atHome, run, now, motion, busy, error, modal]);
  function home() {
    requestEpoch.current++;
    pendingRequest.current?.abort(); pendingRequest.current = null;
    lock.current = false; setBusy(false); setReady(true); retry.current = () => {};
    audio.stop();
    setMotion(null); motionLock.current = false;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    setAtHome(true); setModal(null); setError(''); setSelected(null);
    setNotice(c.choose); lastSoundCue.current = '';
  }
  function finishMotion(id: number) { setMotion(m => m?.id === id ? null : m); motionLock.current = false; }
  async function choose(index: number) {
    const current = runRef.current;
    if (atHome || modal || !current || lock.current || motionLock.current || current.status !== 'playing' || Date.now() + clockOffset.current >= current.deadline) return;
    if (selected === index) { setSelected(null); setNotice(c.choose); return; }
    if (selected === null) { if (!current.board[index].length) { setNotice(c.empty); audio.play('invalid'); return; } setSelected(index); setNotice(c.target); audio.play('select'); return; }
    await pourFrom(selected, index);
  }
  async function pourFrom(from: number, index: number) {
    const epoch = requestEpoch.current;
    const current = runRef.current;
    const time = Date.now() + clockOffset.current;
    if (atHome || modal || !current || lock.current || motionLock.current || current.status !== 'playing' || time >= current.deadline || time < current.availableAt) return;
    const board = pour(current.board, from, index);
    if (!board) { setNotice(c.invalid); audio.play('invalid'); return; }
    const amount = board[index].length - current.board[index].length;
    const source = tubes.current[from], destination = tubes.current[index];
    const geometry = source && destination ? measurePour(source, destination) : null;
    lock.current = true; setBusy(true); setError(''); setSelected(null);
    retry.current = () => { void perform('sync'); };
    try {
      const next = await call('pour', { from, to: index });
      if (epoch !== requestEpoch.current) return;
      accept(next);
      if (next.version > current.version && next.moves === current.moves + 1 && next.status !== 'ended') {
        const id = ++sequence.current;
        motionLock.current = true;
        const seconds = pourDuration(amount) / 1000;
        audio.play('pour', seconds * .27, seconds * .46);
        const h = window.visualViewport?.height ?? innerHeight;
        if (geometry && !matchMedia('(prefers-reduced-motion: reduce)').matches && geometry.source.y > 30 && geometry.destination.y > 48 && Math.max(geometry.source.y + geometry.source.height, geometry.destination.y + geometry.destination.height) < h - 6) {
          setMotion({ id, from, to: index, before: current.board, amount, ...geometry });
        } else {
          settleTimer.current = setTimeout(() => { motionLock.current = false; setNow(Date.now() + clockOffset.current); }, pourDuration(amount));
        }
      }
      setNotice(hasMove(next.board) ? c.choose : c.blocked);
    } catch (e) { if (epoch === requestEpoch.current) setError(e instanceof Error ? e.message : c.error); }
    finally { if (epoch === requestEpoch.current) { lock.current = false; setBusy(false); } }
  }
  async function loadRanks() {
    setRankState(c.rankLoading);
    try { const response = await fetch(API); if (!response.ok) throw new Error(); const data = await response.json() as { rows: RankRow[] }; setRows(data.rows); setRankState(''); }
    catch { setRankState(c.rankError); }
  }
  function openRanks() { setModal('ranking'); void loadRanks(); }
  const level = run?.level ?? 1, active = run?.status === 'playing' && !expired;
  const animating = !!motion || motionLock.current || !!run && now < run.availableAt;
  const ended = run?.status === 'ended' || expired;
  const board = motion?.before ?? run?.board ?? [];
  const remaining = run ? Math.max(0, Math.ceil((run.deadline - now) / 1000)) : timeLimit(1);
  const disabled = !active || busy || animating;
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
    canStart: from => !!run?.board[from]?.length,
    canPour: (from, to) => !!run && !!pour(run.board, from, to),
    onDragStart: () => audio.play('select'),
    onDrop: (from, to) => { setSelected(null); void pourFrom(from, to); },
  });
  const savedRun = !!run && !run.registered;
  return <div className={'lab-app ' + (!atHome && run ? 'in-game' : 'at-home') + (savedRun ? ' has-saved-run' : '')} onPointerDownCapture={() => audio.unlock()} onKeyDownCapture={e => { if (e.key === 'Enter' || e.key === ' ') audio.unlock(); }}>
    <div className="lab-scenery" aria-hidden="true"/><div className="lab-haze" aria-hidden="true"/>
    <main id="game" className="lab-main">
      {atHome || !run ? <section className="start-screen">
        <div className="lab-badge"><span aria-hidden="true">✦</span> LITTLE POTION LAB</div>
        <h1 className="game-title"><span>WATER</span><span>SORT<span className="title-bubble" aria-hidden="true">✧</span></span></h1>
        <p className="start-tagline">{c.tagline}</p>
        <div className="hero-art"><img src="/water-sort/lab-background.png" alt="" fetchPriority="high"/><span className="hero-spark spark-a" aria-hidden="true">✦</span><span className="hero-spark spark-b" aria-hidden="true">✧</span></div>
        <div className="start-actions">{savedRun && <button className="primary-button play-button" disabled={!ready || busy} onClick={() => { void perform('sync'); }}><span aria-hidden="true">▶</span>{busy ? c.busy : ended ? c.viewRecord : c.continueGame}</button>}<button className={savedRun ? 'secondary-button new-game-button' : 'primary-button play-button'} disabled={!ready || busy} onClick={() => { if (savedRun) setModal('restart'); else void perform('start'); }}><span aria-hidden="true">▶</span>{!ready ? c.resume : busy ? c.busy : savedRun ? c.newGame : c.start}</button><div className="start-secondary"><button className="secondary-button" onClick={openRanks}><span aria-hidden="true">♛</span>{c.ranking}</button><button className="secondary-button" onClick={() => setModal('help')}><span aria-hidden="true">?</span>{c.how}</button></div></div>
        <p className="start-caption">{c.readyBody}</p>
        <button className="sound-toggle" aria-pressed={soundOn} onClick={toggleSound}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/>{soundOn ? <path d="M16 8q5 4 0 8M19 5q8 7 0 14"/> : <path d="m17 9 5 6m0-6-5 6"/>}</svg>{soundOn ? c.soundOn : c.soundOff}</button>
      </section> : <section className="play-screen" aria-label="Water Sort">
        <div className="game-hud"><div className="hud-stat stage-stat"><span>{c.stage}</span><strong>{level.toString().padStart(2, '0')}</strong></div><button type="button" className="hud-home" onClick={() => setModal('exit')} aria-label={c.home} title={c.home}><span aria-hidden="true">🏠</span></button><div className="hud-stat score-stat"><span>{c.score}</span><strong data-testid="score">{run.score.toLocaleString()}</strong></div></div>
        <div className={'timer-strip ' + (remaining <= 10 && active ? 'low' : '')} role="timer" aria-label={`${remaining}${c.seconds}`}><div className="timer-track"><div className="timer-fill" style={{ transform: `scaleX(${Math.max(0, Math.min(1, (run.deadline - now) / 60000))})` }}/></div><span className="timer-number">{ended ? 0 : remaining}<small>s</small></span></div>
        <div className="experiment-tray">
          <div className="tray-spark tray-spark-one" aria-hidden="true">✦</div><div className="tray-spark tray-spark-two" aria-hidden="true">✧</div>
          <div className={'board ' + (board.length > 7 ? 'many-tubes' : '')} role="group" aria-label={c.play}>
            {board.map((tube, i) => <button key={i} data-testid={`bottle-${i}`} data-bottle-index={i} disabled={disabled} aria-pressed={selected === i} aria-label={`${i + 1}${c.bottle}, ${tube.length ? c.bottomUp + ' ' + tube.map(n => c.colorNames[n]).join(', ') : c.emptyBottle}${complete(tube) ? ', ' + c.done : ''}`} className={'bottle-button ' + (selected === i ? 'selected ' : '') + (complete(tube) ? 'complete ' : '') + (motion?.from === i ? 'pour-source ' : '') + (motion?.to === i ? 'pour-target' : '')} onPointerDown={e => drag.onPointerDown(e, i)} onPointerMove={drag.onPointerMove} onPointerUp={drag.onPointerUp} onPointerCancel={drag.onPointerCancel} onLostPointerCapture={drag.onLostPointerCapture} onClick={e => { if (drag.allowClick(e.detail)) void choose(i); }}><span className="tube" ref={node => { tubes.current[i] = node; }}><BottleVisual colors={tube} selected={selected === i}/></span><span className="completion-star" aria-hidden="true">{complete(tube) ? '★' : ''}</span></button>)}
          </div>
          {run.status === 'cleared' && !animating && <div className="clear-burst" role="status">✦ {c.success} ✦</div>}
        </div>
        <p className={'board-notice ' + ([c.invalid, c.empty, c.blocked].includes(notice as typeof c.invalid) ? 'visible' : 'sr-only')} role="status">{notice}</p>
      </section>}
      {error && <div className="connection-error" role="alert"><p>{error}</p><button className="secondary-button" disabled={busy} onClick={() => retry.current()}>{c.retry}</button></div>}
    </main>
    {motion && <PourAnimation motion={motion} onFinish={finishMotion}/>}
    {!atHome && ended && run && !modal && <Results><span className="result-sticker" aria-hidden="true">{run.cleared === 100 ? '★' : '⌛'}</span><p className="result-eyebrow">{run.cleared === 100 ? 'ALL CLEAR!' : 'TIME OVER'}</p><h2 id="result-title">{run.cleared === 100 ? c.allClear : c.ended}</h2><div className="result-score">{run.score.toLocaleString()}<small>{c.point}</small></div><p className="result-stage">{c.stage} {run.level} · {c.cleared} {run.cleared}</p>{run.registered && <p role="status">{c.registered}</p>}<button className="primary-button" disabled={busy || run.status !== 'ended'} onClick={() => run.registered ? openRanks() : setModal('register')}>{run.registered ? c.ranking : c.register}</button><button className="secondary-button" disabled={busy} onClick={home}>{c.home}</button></Results>}
    {modal === 'exit' && <Modal title={c.homeTitle} onClose={() => setModal(null)}><p>{c.homeBody}</p><div className="confirmation-actions"><button className="secondary-button" onClick={() => setModal(null)}>{c.keepPlaying}</button><button className="primary-button" onClick={home}>{c.leaveGame}</button></div></Modal>}
    {modal === 'restart' && <Modal title={c.restartTitle} onClose={() => setModal(null)}><p>{c.restartBody}</p><div className="confirmation-actions"><button className="secondary-button" onClick={() => setModal(null)}>{c.cancel}</button><button className="primary-button" disabled={busy} onClick={() => { void perform('start'); }}>{c.newGame}</button></div></Modal>}
    {modal === 'help' && <Modal title={c.rulesTitle} onClose={() => setModal(null)}><ol className="rules">{c.rules.map(rule => <li key={rule}>{rule}</li>)}</ol><p className="modal-note">{c.recordRule}</p><p className="keyboard-note">{c.keyboard}</p></Modal>}
    {modal === 'register' && run && <Modal title={c.register} onClose={() => setModal(null)}>{run.registered ? <div className="registration-done"><span aria-hidden="true">★</span><p role="status">{c.registered}</p><button className="primary-button" onClick={openRanks}>{c.ranking}</button><button className="secondary-button" onClick={home}>{c.home}</button></div> : <form className="ranking-form" onSubmit={e => { e.preventDefault(); void perform('register', { nickname }); }}><p>{run.score.toLocaleString()}{c.point} · {c.cleared} {run.cleared}</p><label htmlFor="nickname">{c.nickname}</label><input id="nickname" value={nickname} onChange={e => setNickname(e.target.value)} maxLength={16} required autoComplete="nickname" aria-describedby="nickname-help"/><small id="nickname-help">{c.nicknameHelp}</small><button className="primary-button" disabled={busy}>{busy ? c.submitting : c.register}</button>{error && <p className="form-error" role="alert">{error}</p>}</form>}</Modal>}
    {modal === 'ranking' && <Modal title={c.ranking} onClose={() => setModal(null)}><p>{c.rankRule}</p>{rankState ? <p role="status">{rankState}</p> : rows.length ? <ol className="rank-list">{rows.map((row, i) => <li key={row.id} className={row.id === run?.id ? 'my-rank' : ''}><span className="rank-number">{i + 1}</span><strong>{row.nickname}</strong><span>{row.cleared}{c.level}<small>{row.score.toLocaleString()}{c.point}</small></span></li>)}</ol> : <p>{c.rankEmpty}</p>}{rankState === c.rankError && <button className="secondary-button" onClick={() => { void loadRanks(); }}>{c.retry}</button>}</Modal>}
  </div>;
}
