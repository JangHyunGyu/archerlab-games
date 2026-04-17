// 고양이 타워 — 메인 게임 로직
// Matter.js 물리 기반 수박게임 메커니즘
(function () {
  'use strict';

  // -------- 디버그 로깅 --------
  // URL에 ?debug=0 붙이면 일반 로그 숨김 (경고/에러는 항상 출력)
  const DBG = new URLSearchParams(location.search).get('debug') !== '0';
  const T0 = performance.now();
  const _ts = () => `+${((performance.now() - T0) / 1000).toFixed(2)}s`;
  const log  = (...a) => { if (DBG) console.log('[CT]', _ts(), ...a); };
  const warn = (...a) => console.warn('[CT!]', _ts(), ...a);
  const err  = (...a) => {
    console.error('[CT✖]', _ts(), ...a);
    try { _remoteError('AppError', a.map(x => typeof x === 'string' ? x : (x && x.message) || String(x)).join(' '), (a.find(x => x && x.stack) || {}).stack || '', location.href); } catch (_) {}
  };

  // -------- 원격 오류 로그 (harem worker /error-logs) --------
  // solo-leveling 패턴을 그대로 차용 — appId만 cat-tower로 분리
  const ERROR_ENDPOINT = 'https://chatbot-api.yama5993.workers.dev/error-logs';
  const ERROR_APP_ID_BASE = 'cat-tower';
  const _errSession = Math.random().toString(36).substring(2, 8);
  let _errLast = '';
  let _errRepeat = 0;

  function _classifyError(msg, stack, src) {
    if (!msg) return 'noise';
    if (msg === 'Script error.' && !stack) return 'noise';
    if (/ResizeObserver loop/.test(msg)) return 'noise';
    if (src && /googletagmanager|google-analytics|gtag\/js|cloudflare|chrome-extension|moz-extension|safari-extension/.test(src)) return 'external';
    if (/Loading chunk|dynamically imported module|Failed to fetch/.test(msg)) return 'network';
    return 'app';
  }

  function _remoteError(type, msg, stack, src) {
    if (!msg) return;
    const cls = _classifyError(msg, stack, src);
    if (cls === 'noise') return;
    const key = msg + '|' + src;
    if (key === _errLast) { _errRepeat++; if (_errRepeat > 5) return; }
    else { _errLast = key; _errRepeat = 1; }
    const lang = (window.I18N && window.I18N.getLang && window.I18N.getLang()) || (document.documentElement.lang || 'ko').substring(0, 2);
    const appId = lang === 'ko' ? ERROR_APP_ID_BASE : `${ERROR_APP_ID_BASE}-${lang}`;
    const ctx = `sess:${_errSession} | path:${location.pathname} | online:${navigator.onLine} | vw:${innerWidth}x${innerHeight} | running=${typeof running !== 'undefined' ? running : '?'} | paused=${typeof paused !== 'undefined' ? paused : '?'} | score=${typeof score !== 'undefined' ? score : '?'}`;
    const payload = {
      appId, userId: '',
      message: `[${cls}:${type}] ${msg}`.substring(0, 500),
      stack: (
        '[ctx] ' + ctx +
        '\n[src] ' + (src || 'N/A') +
        '\n[ua] ' + navigator.userAgent.substring(0, 150) +
        '\n[ref] ' + (document.referrer || 'direct') +
        '\n[time] ' + new Date().toISOString() +
        '\n[trace]\n' + (stack || 'no stack')
      ).substring(0, 2000),
      url: (src || location.href).substring(0, 500),
    };
    try { navigator.sendBeacon(ERROR_ENDPOINT, JSON.stringify(payload)); } catch (_) {}
  }

  // 전역 에러 핸들러 — 게임 내 어떤 예외든 바로 캐치 + 원격 전송
  window.addEventListener('error', (e) => {
    const src = (e.filename || '') + ':' + e.lineno + ':' + e.colno;
    console.error('[CT✖]', _ts(), 'uncaught:', e.message, 'at', src, e.error?.stack || '');
    _remoteError(e.error?.name || 'Error', e.message, e.error?.stack || '', src);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    const msg = reason?.message || String(reason || 'Unhandled rejection');
    console.error('[CT✖]', _ts(), 'unhandled promise:', msg, reason?.stack || '');
    _remoteError('UnhandledRejection', msg, reason?.stack || '', location.href);
  });

  // NaN 바디 감지 — 물리가 터지면 즉시 알림
  let _lastNanWarnAt = 0;
  function assertBodiesFinite(label) {
    if (!world) return;
    const now = performance.now();
    if (now - _lastNanWarnAt < 500) return; // 중복 알림 스팸 방지
    for (const b of Composite.allBodies(world)) {
      if (b.label !== 'cat') continue;
      if (!Number.isFinite(b.position.x) || !Number.isFinite(b.position.y)
          || !Number.isFinite(b.velocity.x) || !Number.isFinite(b.velocity.y)) {
        err(`NaN body detected at [${label}] tier=${b.cat?.tier} pos=(${b.position.x}, ${b.position.y}) vel=(${b.velocity.x}, ${b.velocity.y}) mass=${b.mass} invMass=${b.inverseMass}`);
        _lastNanWarnAt = now;
        return;
      }
    }
  }

  log('boot 시작');

  const { Engine, World, Bodies, Body, Composite, Events } = Matter;
  if (!Matter) err('Matter.js 로드 실패');
  const TIERS = CatAssets.TIERS;
  if (!TIERS || TIERS.length !== 10) err('CatAssets.TIERS 비정상:', TIERS);

  // 내부 좌표계 (CSS로 스케일), 세로 비율 5:7
  const FIELD_W = 400;
  const FIELD_H = 560;
  const DANGER_LINE = 88;      // 이 선 위로 오래 머무르면 게임 오버
  const SPAWN_Y = 48;           // 대기 고양이 Y 위치
  const GAME_OVER_GRACE_MS = 2000;
  const POST_DROP_GRACE_MS = 1400;
  const DROP_COOLDOWN_MS = 550;
  const MAX_SPAWN_TIER = 4;    // 0~4 단계까지만 랜덤 스폰 (1~5단계 고양이)

  // 상태
  let engine, world;
  let canvas, ctx;
  let nextCanvas, nextCtx;
  let dpr = 1;
  let running = false;
  let paused = false;
  let gameOver = false;
  let score = 0;
  let bestScore = 0;
  let currentCat = null;        // 위에서 조작중인 고양이 (isStatic)
  let nextTier = 0;             // 다음에 생성될 단계
  let dropCooldown = false;
  let pointerX = FIELD_W / 2;
  let pointerActive = false;
  let comboCount = 0;
  let lastMergeAt = 0;
  let reachedFinal = false;     // 사바나(최종단계) 최초 달성 여부 — 축하 플래시 1회용
  const mergeEffects = [];      // 합성 이펙트 파티클

  // DOM refs
  const $ = (id) => document.getElementById(id);
  const screens = {
    menu: $('menu'),
    game: $('game'),
  };
  const modals = {
    pause: $('pause-modal'),
    gameover: $('gameover-modal'),
    how: $('how-modal'),
    rank: $('rank-modal'),
  };

  // -------- 랭킹 API (blockpang과 공유하는 game-api-worker) --------
  const RANK_API_BASE = 'https://game-api.yama5993.workers.dev';
  const GAME_ID = 'cat-tower';
  const RANK_LIMIT = 20;
  const NICK_MAX = 20;
  const NICK_KEY = 'cat-tower.nick';

  function tt(key, vars) { return (window.I18N && window.I18N.t(key, vars)) || key; }

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  // -------- 로컬 스토리지 --------
  const STORAGE_KEY = 'cat-tower.v1';
  function loadBest() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return 0;
      return JSON.parse(raw).best || 0;
    } catch { return 0; }
  }
  function saveBest(v) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ best: v }));
    } catch {}
  }

  // -------- 캔버스 & 리사이즈 --------
  function setupCanvas() {
    canvas = $('canvas');
    ctx = canvas.getContext('2d');
    nextCanvas = $('next-cat');
    nextCtx = nextCanvas.getContext('2d');
    if (!canvas || !ctx) err('canvas 엘리먼트 또는 2d context 획득 실패');
    if (!nextCanvas || !nextCtx) err('next-cat canvas 획득 실패');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    log('setupCanvas 완료');
  }

  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = FIELD_W * dpr;
    canvas.height = FIELD_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const ndpr = window.devicePixelRatio || 1;
    nextCanvas.width = 72 * ndpr;
    nextCanvas.height = 72 * ndpr;
    nextCtx.setTransform(ndpr, 0, 0, ndpr, 0, 0);
    log(`resizeCanvas dpr=${dpr} buf=${canvas.width}x${canvas.height} css=${canvas.offsetWidth}x${canvas.offsetHeight}`);
  }

  // -------- 엔진 초기화 --------
  function initEngine() {
    log('initEngine: Matter 엔진/월드 생성');
    engine = Engine.create({
      gravity: { x: 0, y: 1, scale: 0.0012 },
      enableSleeping: false,
    });
    world = engine.world;

    const wallT = 60;
    World.add(world, [
      // 바닥
      Bodies.rectangle(FIELD_W / 2, FIELD_H + wallT / 2, FIELD_W + wallT * 2, wallT, {
        isStatic: true, label: 'wall',
        friction: 0.8, restitution: 0.02,
      }),
      // 좌벽
      Bodies.rectangle(-wallT / 2, FIELD_H / 2, wallT, FIELD_H * 2, {
        isStatic: true, label: 'wall',
      }),
      // 우벽
      Bodies.rectangle(FIELD_W + wallT / 2, FIELD_H / 2, wallT, FIELD_H * 2, {
        isStatic: true, label: 'wall',
      }),
    ]);

    Events.on(engine, 'collisionStart', handleCollision);
    log('initEngine 완료: 벽/바닥 추가 + collisionStart 핸들러 등록');
  }

  // -------- 고양이 생성/충돌/합성 --------
  function createCat(tierIdx, x, y, asStatic) {
    if (tierIdx < 0 || tierIdx >= TIERS.length) {
      err(`createCat: 잘못된 tierIdx=${tierIdx}`);
      return null;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      err(`createCat: NaN 좌표로 생성 시도 tier=${tierIdx} x=${x} y=${y}`);
      return null;
    }
    const tier = TIERS[tierIdx];
    // 반드시 dynamic으로 먼저 생성: Matter.js v0.20의 Body.setStatic은
    // _original 속성(mass/inertia 등)이 저장돼 있어야 static→dynamic 복구가 가능한데,
    // isStatic:true로 바로 생성하면 _original이 저장되지 않아 드롭 시 mass가 undefined가 되고
    // 이어지는 물리 스텝에서 position이 NaN으로 터진다.
    const body = Bodies.circle(x, y, tier.radius, {
      restitution: 0.08,
      friction: 0.55,
      frictionStatic: 0.6,
      frictionAir: 0.005,
      density: 0.0012 + tierIdx * 0.00015,
      slop: 0.03,
      label: 'cat',
    });
    body.cat = { tier: tierIdx, merging: false, spawnedAt: performance.now(), aboveSince: 0 };
    World.add(world, body);
    if (asStatic) Body.setStatic(body, true);
    log(`createCat tier=${tierIdx}(${tier.name}) pos=(${x.toFixed(1)}, ${y.toFixed(1)}) ${asStatic ? 'STATIC' : 'dynamic'}`);
    return body;
  }

  function handleCollision(evt) {
    const now = performance.now();
    for (const pair of evt.pairs) {
      const a = pair.bodyA, b = pair.bodyB;
      if (a.label !== 'cat' || b.label !== 'cat') continue;
      if (!a.cat || !b.cat) continue;
      if (a.isStatic || b.isStatic) continue;
      if (a.cat.merging || b.cat.merging) continue;
      if (a.cat.tier !== b.cat.tier) continue;

      const tier = a.cat.tier;
      a.cat.merging = true;
      b.cat.merging = true;

      const midX = (a.position.x + b.position.x) / 2;
      const midY = (a.position.y + b.position.y) / 2;

      World.remove(world, a);
      World.remove(world, b);

      if (tier < TIERS.length - 1) {
        // 진화
        const next = createCat(tier + 1, midX, midY, false);
        if (!next) { err('merge: createCat가 null 반환 — tier 체인 손상'); continue; }
        // 합성 직후는 살짝 튀어오르는 느낌 (위로 소폭 임펄스)
        Body.setVelocity(next, { x: 0, y: -0.8 });

        score += TIERS[tier + 1].score;

        // 콤보 (0.7초 이내 연쇄 시 배수)
        if (now - lastMergeAt < 700) comboCount += 1;
        else comboCount = 1;
        lastMergeAt = now;
        if (comboCount >= 2) {
          const bonus = Math.floor(TIERS[tier + 1].score * 0.25 * (comboCount - 1));
          score += bonus;
          showComboFlash(comboCount);
          log(`콤보! ${comboCount}연쇄 +${bonus}pt`);
        }

        mergeEffects.push({ x: midX, y: midY, r: TIERS[tier + 1].radius, age: 0, max: 22, color: '#FFB84D' });
        log(`merge tier ${tier}→${tier + 1}(${TIERS[tier + 1].name}) at (${midX.toFixed(1)}, ${midY.toFixed(1)}) score=${score}`);

        // 최종단계(사바나) 최초 달성 축하 — 1게임당 한 번만
        if (tier + 1 === TIERS.length - 1 && !reachedFinal) {
          reachedFinal = true;
          showFlash(tt('flash.legend'), true);
          log('🏆 사바나 최초 달성!');
        }
      } else {
        // 최종 단계 끼리 붙음 → 소멸 + 보너스
        score += TIERS[tier].score * 2;
        mergeEffects.push({ x: midX, y: midY, r: TIERS[tier].radius * 1.3, age: 0, max: 32, color: '#F2B43A' });
        log(`최종단계 소멸 (tier ${tier}) +${TIERS[tier].score * 2}pt score=${score}`);
      }
      updateScoreUI();
    }
  }

  function showComboFlash(n) {
    showFlash(tt('flash.combo', { n }), false);
  }

  function showFlash(text, isLegend) {
    const el = $('combo-flash');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('pop', 'legend');
    if (isLegend) el.classList.add('legend');
    // reflow
    void el.offsetWidth;
    el.classList.add('pop');
  }

  // -------- 스폰 로직 --------
  function pickNextTier() {
    // 가중치: 낮은 단계일수록 자주
    const weights = [40, 32, 18, 7, 3];
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (let i = 0; i <= MAX_SPAWN_TIER; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return 0;
  }

  function spawnCurrent() {
    if (gameOver) { log('spawnCurrent skip: gameOver'); return; }
    if (nextTier == null) nextTier = pickNextTier();
    const tier = nextTier;
    const r = TIERS[tier].radius;
    const x = Math.min(FIELD_W - r, Math.max(r, pointerX));
    currentCat = createCat(tier, x, SPAWN_Y, true);
    if (!currentCat) { err('spawnCurrent: currentCat 생성 실패'); return; }
    nextTier = pickNextTier();
    drawNextPreview();
    log(`spawnCurrent tier=${tier}(${TIERS[tier].name}) next=${nextTier}`);
  }

  function dropCurrent() {
    if (!currentCat) { log('dropCurrent skip: currentCat 없음'); return; }
    if (dropCooldown) { log('dropCurrent skip: cooldown'); return; }
    if (paused) { log('dropCurrent skip: paused'); return; }
    if (gameOver) { log('dropCurrent skip: gameOver'); return; }
    const tier = currentCat.cat.tier;
    const pos = { x: currentCat.position.x, y: currentCat.position.y };
    Body.setStatic(currentCat, false);
    // 복구가 정상인지 즉시 검증 (Matter.js v0.20 setStatic 회귀 조기 감지)
    if (!Number.isFinite(currentCat.mass) || currentCat.inverseMass === 0) {
      err(`dropCurrent: setStatic(false) 후 mass 이상 mass=${currentCat.mass} invMass=${currentCat.inverseMass} — _original이 누락됐을 가능성 (createCat 수정 회귀?)`);
    }
    currentCat.cat.spawnedAt = performance.now();
    log(`dropCurrent tier=${tier} at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`);
    currentCat = null;
    dropCooldown = true;
    setTimeout(() => {
      dropCooldown = false;
      if (!gameOver && !paused) spawnCurrent();
    }, DROP_COOLDOWN_MS);
  }

  // -------- 입력 --------
  function setupInput() {
    const onPointer = (e) => {
      const rect = canvas.getBoundingClientRect();
      const xInCss = (e.clientX - rect.left);
      const scale = FIELD_W / rect.width;
      pointerX = Math.max(0, Math.min(FIELD_W, xInCss * scale));
      if (currentCat && currentCat.isStatic) {
        const r = TIERS[currentCat.cat.tier].radius;
        Body.setPosition(currentCat, {
          x: Math.max(r, Math.min(FIELD_W - r, pointerX)),
          y: SPAWN_Y,
        });
      }
    };
    canvas.addEventListener('pointerdown', (e) => {
      pointerActive = true;
      canvas.setPointerCapture(e.pointerId);
      onPointer(e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!pointerActive && e.pointerType !== 'mouse') return;
      onPointer(e);
    });
    // 마우스도 움직임 추적 (탭 아니어도)
    canvas.addEventListener('mousemove', (e) => onPointer(e));
    canvas.addEventListener('pointerup', (e) => {
      onPointer(e);
      pointerActive = false;
      dropCurrent();
    });
    canvas.addEventListener('pointercancel', () => { pointerActive = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // -------- 게임 오버 판정 --------
  function checkGameOver() {
    if (gameOver) return;
    const now = performance.now();
    const bodies = Composite.allBodies(world);
    for (const b of bodies) {
      if (b.label !== 'cat' || b.isStatic || !b.cat) continue;
      if (now - b.cat.spawnedAt < POST_DROP_GRACE_MS) continue;
      // 캔버스를 벗어난 바디(물리 이탈) 감지
      if (b.position.y > FIELD_H + 200 || b.position.x < -100 || b.position.x > FIELD_W + 100) {
        warn(`off-canvas 바디 tier=${b.cat.tier} pos=(${b.position.x.toFixed(1)}, ${b.position.y.toFixed(1)}) — 제거`);
        World.remove(world, b);
        continue;
      }
      const r = TIERS[b.cat.tier].radius;
      const top = b.position.y - r;
      if (top < DANGER_LINE) {
        if (!b.cat.aboveSince) {
          b.cat.aboveSince = now;
          log(`danger 진입 tier=${b.cat.tier} top=${top.toFixed(1)} (DANGER_LINE=${DANGER_LINE})`);
        }
        if (now - b.cat.aboveSince > GAME_OVER_GRACE_MS) {
          triggerGameOver();
          return;
        }
      } else {
        b.cat.aboveSince = 0;
      }
    }
  }

  function triggerGameOver() {
    const isNew = score > bestScore;
    log(`triggerGameOver score=${score} best=${bestScore} newRecord=${isNew}`);
    gameOver = true;
    running = false;
    if (isNew) { bestScore = score; saveBest(bestScore); }
    $('final-score').textContent = score.toLocaleString();
    const nr = $('new-record');
    if (isNew) nr.classList.remove('hidden'); else nr.classList.add('hidden');
    resetRankSubmit();
    show(modals.gameover);
  }

  // -------- 렌더링 --------
  function render() {
    // 배경 — 은은한 베이지 + 경계선
    ctx.clearRect(0, 0, FIELD_W, FIELD_H);
    // 필드 내부 부드러운 그라데이션 (AI 같지 않게 톤온톤 1.5단계)
    const bg = ctx.createLinearGradient(0, 0, 0, FIELD_H);
    bg.addColorStop(0, '#FFF7EA');
    bg.addColorStop(1, '#F9EAD3');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);

    // 위험선
    ctx.save();
    ctx.strokeStyle = 'rgba(232, 90, 79, 0.55)';
    ctx.setLineDash([9, 7]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(6, DANGER_LINE);
    ctx.lineTo(FIELD_W - 6, DANGER_LINE);
    ctx.stroke();
    ctx.restore();

    // 벽/바닥 라인 (내부 아트)
    ctx.strokeStyle = 'rgba(58, 41, 32, 0.12)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, FIELD_W - 3, FIELD_H - 3);

    // 고양이
    const bodies = Composite.allBodies(world);
    for (const b of bodies) {
      if (b.label !== 'cat' || !b.cat) continue;
      CatAssets.drawCat(ctx, b.cat.tier, b.position.x, b.position.y, b.angle, TIERS[b.cat.tier].radius);
    }

    // 합성 이펙트
    for (let i = mergeEffects.length - 1; i >= 0; i--) {
      const e = mergeEffects[i];
      e.age++;
      if (e.age >= e.max) { mergeEffects.splice(i, 1); continue; }
      const t = e.age / e.max;
      const alpha = 1 - t;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3 + (1 - t) * 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * (1 + t * 1.2), 0, Math.PI * 2);
      ctx.stroke();
      // 중앙 스파클
      ctx.fillStyle = e.color;
      ctx.globalAlpha = alpha * 0.5;
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2 + t * 2;
        const dist = e.r * (0.6 + t * 0.8);
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(ang) * dist, e.y + Math.sin(ang) * dist, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawNextPreview() {
    nextCtx.clearRect(0, 0, 72, 72);
    if (nextTier == null) return;
    const r = Math.min(30, TIERS[nextTier].radius);
    CatAssets.drawCat(nextCtx, nextTier, 36, 36, 0, r);
  }

  function updateScoreUI() {
    $('score').textContent = score.toLocaleString();
  }

  // -------- 메인 루프 --------
  let lastTs = 0;
  let loopToken = 0; // 중복 RAF 체인 방지: restart 시 이전 루프를 무효화
  let _frameCount = 0;
  let _lastFpsAt = 0;
  let _framesSinceFps = 0;

  function makeTick(myToken) {
    return function tick(ts) {
      if (!running || myToken !== loopToken) {
        if (myToken !== loopToken) log(`loop #${myToken} 종료 (현재 활성=${loopToken})`);
        return;
      }
      try {
        if (!paused) {
          const dt = Math.min(16.666, ts - lastTs || 16.666);
          if (dt > 50) warn(`프레임 지연 감지 dt=${dt.toFixed(1)}ms (탭 백그라운드?)`);
          Engine.update(engine, dt);
          checkGameOver();
          _frameCount++;
          // 매 60프레임(약 1초)마다 NaN 감시 + 옵션으로 상태 스냅샷
          if (_frameCount % 60 === 0) {
            assertBodiesFinite('tick');
            if (DBG) {
              const catBodies = Composite.allBodies(world).filter(b => b.label === 'cat');
              const fps = _lastFpsAt ? Math.round(1000 * _framesSinceFps / (ts - _lastFpsAt)) : 60;
              log(`heartbeat fps=${fps} bodies=${catBodies.length} score=${score} paused=${paused}`);
              _lastFpsAt = ts;
              _framesSinceFps = 0;
            }
          }
          _framesSinceFps++;
        }
        render();
      } catch (e) {
        err('loop tick 예외:', e.message, e.stack);
        running = false;
        return;
      }
      lastTs = ts;
      requestAnimationFrame(tick);
    };
  }

  // -------- 게임 제어 --------
  function startGame() {
    log('startGame 진입');
    score = 0;
    comboCount = 0;
    lastMergeAt = 0;
    reachedFinal = false;
    gameOver = false;
    paused = false;
    running = true;
    dropCooldown = false;
    mergeEffects.length = 0;
    nextTier = null;
    _frameCount = 0;
    _lastFpsAt = 0;
    _framesSinceFps = 0;

    // 기존 월드 초기화
    if (world) {
      const bodies = Composite.allBodies(world).filter((b) => b.label === 'cat');
      bodies.forEach((b) => World.remove(world, b));
      log(`월드 재사용: 이전 cat 바디 ${bodies.length}개 제거`);
    } else {
      initEngine();
    }
    updateScoreUI();
    spawnCurrent();
    lastTs = 0;
    loopToken++;
    log(`새 루프 시작 (token=${loopToken})`);
    requestAnimationFrame(makeTick(loopToken));
  }

  function togglePause() {
    if (gameOver) { log('togglePause skip: gameOver'); return; }
    paused = !paused;
    log(`togglePause → paused=${paused}`);
    if (paused) show(modals.pause); else hide(modals.pause);
  }

  function exitToMenu() {
    log('exitToMenu');
    running = false;
    paused = false;
    gameOver = false;
    hide(modals.pause);
    hide(modals.gameover);
    hide(screens.game);
    show(screens.menu);
    $('best-score').textContent = bestScore.toLocaleString();
  }

  // -------- 조작법 모달 티어 프리뷰 --------
  function buildTierPreview() {
    const wrap = $('tier-preview');
    if (!wrap) return;
    wrap.innerHTML = '';
    TIERS.forEach((_tier, i) => {
      const cell = document.createElement('div');
      cell.className = 'tier-cell';
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const cctx = c.getContext('2d');
      CatAssets.drawCat(cctx, i, 32, 32, 0, 24);
      cell.appendChild(c);
      const label = document.createElement('div');
      label.className = 'tier-name';
      label.textContent = (i + 1) + '. ' + tt('cat.' + i);
      cell.appendChild(label);
      wrap.appendChild(cell);
    });
  }

  // -------- 랭킹 API --------
  async function fetchTopRanks(limit) {
    const url = `${RANK_API_BASE}/rankings?game_id=${encodeURIComponent(GAME_ID)}&limit=${limit || RANK_LIMIT}`;
    const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data.rankings)) throw new Error('invalid response');
    return data.rankings;
  }

  async function submitScore(playerName, finalScore) {
    const res = await fetch(`${RANK_API_BASE}/rankings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_id: GAME_ID,
        player_name: playerName,
        score: finalScore,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error('HTTP ' + res.status + ' ' + text);
    }
    return res.json();
  }

  async function openRankModal() {
    const content = $('rank-content');
    content.innerHTML = `<div class="rank-loading">${tt('rank.loading')}</div>`;
    show(modals.rank);
    try {
      const rows = await fetchTopRanks(RANK_LIMIT);
      renderRankRows(rows);
    } catch (e) {
      err('랭킹 조회 실패:', e.message);
      content.innerHTML = `<div class="rank-error">${tt('rank.error')}</div>`;
    }
  }

  function renderRankRows(rows) {
    const content = $('rank-content');
    if (!rows || rows.length === 0) {
      content.innerHTML = `<div class="rank-empty">${tt('rank.empty')}</div>`;
      return;
    }
    const myName = (function () { try { return localStorage.getItem(NICK_KEY) || ''; } catch { return ''; } })();
    const html = rows.map((r, i) => {
      const pos = r.rank || (i + 1);
      const isMe = myName && r.player_name === myName;
      const cls = ['rank-row'];
      if (pos === 1) cls.push('top1');
      else if (pos === 2) cls.push('top2');
      else if (pos === 3) cls.push('top3');
      if (isMe) cls.push('me');
      const nameEsc = String(r.player_name || '').replace(/[<>&"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[c]));
      return `<div class="${cls.join(' ')}"><div class="rank-pos">${pos}</div><div class="rank-name">${nameEsc}</div><div class="rank-score">${Number(r.score).toLocaleString()}</div></div>`;
    }).join('');
    content.innerHTML = html;
  }

  async function handleSubmitRank() {
    const inp = $('nickname-input');
    const btn = $('submit-rank-btn');
    const skipBtn = $('skip-rank-btn');
    const status = $('submit-status');
    const name = (inp.value || '').trim().slice(0, NICK_MAX);
    if (!name) {
      status.className = 'submit-status fail';
      status.textContent = tt('over.nicknamePh');
      inp.focus();
      return;
    }
    btn.disabled = true;
    if (skipBtn) skipBtn.disabled = true;
    inp.disabled = true;
    status.className = 'submit-status';
    status.textContent = tt('over.submitting');
    try {
      const res = await submitScore(name, score);
      try { localStorage.setItem(NICK_KEY, name); } catch {}
      status.className = 'submit-status ok';
      status.textContent = tt('over.submitOk') + (res && res.rank ? ` (#${res.rank})` : '');
      log(`랭킹 등록 성공: ${name} = ${score} rank=${res && res.rank}`);
    } catch (e) {
      err('랭킹 등록 실패:', e.message);
      status.className = 'submit-status fail';
      status.textContent = tt('over.submitFail');
      btn.disabled = false;
      if (skipBtn) skipBtn.disabled = false;
      inp.disabled = false;
    }
  }

  function handleSkipRank() {
    const row = $('rank-submit-row');
    if (row) row.style.display = 'none';
    log('UI: 랭킹 등록 Skip');
  }

  function resetRankSubmit() {
    const row = $('rank-submit-row');
    const inp = $('nickname-input');
    const btn = $('submit-rank-btn');
    const skipBtn = $('skip-rank-btn');
    const status = $('submit-status');
    if (!row || !inp || !btn || !status) return;
    inp.disabled = false;
    btn.disabled = false;
    if (skipBtn) skipBtn.disabled = false;
    status.textContent = '';
    status.className = 'submit-status';
    try { inp.value = localStorage.getItem(NICK_KEY) || ''; } catch { inp.value = ''; }
    // 점수 0은 등록 의미 없음 — 입력 영역 숨김
    row.style.display = score > 0 ? '' : 'none';
  }

  function updateLangButtons() {
    const cur = window.I18N ? window.I18N.getLang() : 'ko';
    document.querySelectorAll('.lang-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.lang === cur);
    });
    document.documentElement.lang = cur;
  }

  // -------- 초기화 --------
  async function boot() {
    try {
      log('DOM 준비됨, boot() 실행');

      // i18n 초기 적용 — DOM 문자열을 현재 언어로 스왑
      if (window.I18N) window.I18N.applyDom();

      setupCanvas();
      setupInput();
      bestScore = loadBest();
      $('best-score').textContent = bestScore.toLocaleString();
      log(`best 로드: ${bestScore}`);

      // 필수 DOM 엘리먼트 검증 — 하나라도 누락되면 게임 자체가 동작 안 함
      const required = ['play-btn', 'how-btn', 'how-close', 'pause-btn', 'resume-btn',
        'restart-btn', 'exit-btn', 'replay-btn', 'menu-btn', 'rank-btn', 'rank-close',
        'rank-content', 'submit-rank-btn', 'skip-rank-btn', 'nickname-input', 'submit-status',
        'lang-ko', 'lang-en', 'score', 'best-score',
        'final-score', 'new-record', 'combo-flash', 'tier-preview'];
      for (const id of required) {
        if (!$(id)) err(`필수 엘리먼트 #${id} 누락`);
      }

      // 버튼 바인딩
      const playBtn = $('play-btn');
      playBtn.disabled = true;
      playBtn.textContent = '불러오는 중…';

      $('how-btn').addEventListener('click', () => { log('UI: how 열기'); show(modals.how); });
      $('how-close').addEventListener('click', () => { log('UI: how 닫기'); hide(modals.how); });

      $('pause-btn').addEventListener('click', togglePause);
      $('resume-btn').addEventListener('click', togglePause);
      $('restart-btn').addEventListener('click', () => { log('UI: 재시작 클릭'); hide(modals.pause); startGame(); });
      $('exit-btn').addEventListener('click', exitToMenu);
      $('replay-btn').addEventListener('click', () => { log('UI: 다시도전 클릭'); hide(modals.gameover); startGame(); });
      $('menu-btn').addEventListener('click', exitToMenu);

      // 랭킹 모달
      $('rank-btn').addEventListener('click', () => { log('UI: 랭킹 클릭'); openRankModal(); });
      $('rank-close').addEventListener('click', () => hide(modals.rank));

      // 게임오버 랭킹 등록 / Skip
      $('submit-rank-btn').addEventListener('click', handleSubmitRank);
      $('skip-rank-btn').addEventListener('click', handleSkipRank);
      $('nickname-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleSubmitRank(); }
      });

      // 언어 토글
      document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const l = btn.dataset.lang;
          log(`UI: 언어 전환 → ${l}`);
          if (window.I18N) window.I18N.setLang(l);
        });
      });
      updateLangButtons();
      window.addEventListener('cattower:langchange', () => {
        updateLangButtons();
        // 티어 프리뷰는 텍스트에 언어별 고양이 이름이 들어있어 재생성 필요
        buildTierPreview();
        // 플레이 버튼이 '불러오는 중…'이 아닐 때만 i18n 라벨 복원 (preload 실패 시 보존)
        const pb = $('play-btn');
        if (!pb.disabled) pb.textContent = tt('menu.play');
      });

      playBtn.addEventListener('click', () => {
        log('UI: 플레이 클릭');
        hide(screens.menu);
        show(screens.game);
        startGame();
      });

      // 에셋 프리로드
      try {
        log('에셋 프리로드 시작');
        await CatAssets.preloadAll();
        log('에셋 프리로드 완료');
        buildTierPreview();
        playBtn.disabled = false;
        playBtn.textContent = tt('menu.play');
      } catch (e) {
        err('에셋 로드 실패:', e.message, e.stack);
        playBtn.textContent = '불러오기 실패';
      }

      // 키보드 접근성
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (!modals.how.classList.contains('hidden')) hide(modals.how);
          else if (!modals.rank.classList.contains('hidden')) hide(modals.rank);
          else if (running) togglePause();
        }
        if (e.key === ' ' && running && !paused && !gameOver) {
          // 닉네임 입력 중 스페이스는 그대로 허용
          if (document.activeElement && document.activeElement.id === 'nickname-input') return;
          e.preventDefault();
          dropCurrent();
        }
      });
      log('boot 완료');
    } catch (e) {
      err('boot 예외:', e.message, e.stack);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
