// 고양이 타워 — 메인 게임 로직
// Matter.js 물리 기반 수박게임 메커니즘
(function () {
  'use strict';

  // -------- 디버그 로깅 --------
  // URL에 ?debug=1 붙였을 때만 일반 로그 출력 (경고/에러는 항상 출력)
  const DBG = new URLSearchParams(location.search).get('debug') === '1';
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
    const ctx = `sess:${_errSession} | path:${location.pathname} | online:${navigator.onLine} | vw:${innerWidth}x${innerHeight} | running=${typeof running !== 'undefined' ? running : '?'} | score=${typeof score !== 'undefined' ? score : '?'}`;
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
  function assertBodiesFinite(label, bodiesSnapshot = null) {
    if (!world) return;
    const now = performance.now();
    if (now - _lastNanWarnAt < 500) return; // 중복 알림 스팸 방지
    for (const b of (bodiesSnapshot || Composite.allBodies(world))) {
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

  // -------- 사운드 매니저 (Tone.js) --------
  const sound = (typeof SoundManager !== 'undefined') ? new SoundManager() : null;
  if (!sound) warn('SoundManager 미로드 — 무음 모드');

  const { Engine, World, Bodies, Body, Composite, Events } = Matter;
  if (!Matter) err('Matter.js 로드 실패');
  const TIERS = CatAssets.TIERS;
  if (!TIERS || TIERS.length !== 10) err('CatAssets.TIERS 비정상:', TIERS);

  // 내부 좌표계 (CSS로 스케일), 세로 비율 5:7
  const FIELD_W = 400;
  const FIELD_H = 540;
  const DANGER_LINE = 85;      // 이 선 위로 오래 머무르면 게임 오버
  const SPAWN_Y = 46;           // 대기 고양이 Y 위치
  const GAME_OVER_GRACE_MS = 2000;
  const POST_DROP_GRACE_MS = 1400;
  const DROP_COOLDOWN_MS = 550;
  const MAX_SPAWN_TIER = 4;    // 0~4 단계까지만 랜덤 스폰 (1~5단계 고양이)

  // 상태
  let engine, world;
  let canvas, ctx;
  let nextCanvas, nextCtx;
  let dpr = 1;
  let fieldBgGradient = null;
  let fieldBgImage = null;
  let mergeParticleImage = null;
  let mergeBurstImage = null;
  let landingDustImage = null;
  let running = false;
  let gameOver = false;
  let dangerActive = false;
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
  let newRecordTimeoutId = null; // 신기록 팡파레 대기 setTimeout 핸들 (게임 전환 시 취소용)
  let dropCooldownTimeoutId = null; // 이전 게임의 드롭 쿨다운 콜백이 새 게임에 끼어들지 않도록 추적
  let saveDirty = false;
  let lastAutoSaveAt = 0;
  const AUTO_SAVE_INTERVAL_MS = 5000;
  const mergeEffects = [];      // 합성 이펙트 파티클
  const bonkCooldown = new Map(); // body.id → 마지막 bonk 시각 (ms) — 연속 충돌 스팸 방지
  const landingDustEffects = [];
  const BONK_COOLDOWN_MS = 110;
  const BONK_TRIGGER_SPEED = 1.35;
  const MERGE_PARTICLE_CELL = 64;
  const MERGE_BURST_CELL = 192;
  const MERGE_BURST_FRAMES = 8;
  const LANDING_DUST_CELL = 64;
  const LANDING_DUST_FRAMES = 6;
  const LANDING_DUST_MAX = 20;
  const BONK_DROP_GRACE_MS = 0;

  // DOM refs
  const $ = (id) => document.getElementById(id);
  const screens = {
    menu: $('menu'),
    game: $('game'),
  };
  const modals = {
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

  function setDangerActive(active) {
    if (dangerActive === active) return;
    dangerActive = active;
    const gameEl = $('game');
    if (gameEl) gameEl.classList.toggle('danger', dangerActive);
  }

  let fitLayoutRaf = 0;
  function scheduleFitGameLayout() {
    if (fitLayoutRaf) cancelAnimationFrame(fitLayoutRaf);
    fitLayoutRaf = requestAnimationFrame(() => {
      fitLayoutRaf = 0;
      fitGameLayout();
    });
  }

  function fitGameLayout() {
    const gameEl = $('game');
    const field = document.querySelector('.field-wrap');
    if (!gameEl || !field || gameEl.classList.contains('hidden')) return;

    const fieldRect = field.getBoundingClientRect();
    const fieldHeight = Math.floor(fieldRect.height);
    if (!Number.isFinite(fieldHeight) || fieldHeight <= 0) return;

    const fitWidth = Math.max(1, Math.floor(fieldHeight * FIELD_W / FIELD_H));
    gameEl.style.setProperty('--field-fit-width', `${fitWidth}px`);
  }

  function show(el) {
    el.classList.remove('hidden');
    if (el && el.id === 'game') scheduleFitGameLayout();
  }
  function hide(el) { el.classList.add('hidden'); }

  // -------- 로컬 스토리지 --------
  const STORAGE_KEY = 'cat-tower.v1';
  const SAVE_KEY = 'cat-tower.save.v1';
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

  // ── 진행중 게임 스냅샷 저장/복원 ──
  // 물리 상태(위치/속도/각속도)를 직렬화하므로 이어서하기는 비결정적(재개 후 경로가 약간 달라질 수 있음).
  // 게임 체감상 문제 없음 — 중요 상태(점수/티어/필드 구성)는 완벽히 보존된다.
  function markSaveDirty() {
    saveDirty = true;
  }

  function autoSave(force = false, bodiesSnapshot = null) {
    if (!running || gameOver || !world) return;
    const now = performance.now();
    if (!force) {
      if (!saveDirty) return;
      if (now - lastAutoSaveAt < AUTO_SAVE_INTERVAL_MS) return;
    }
    try {
      const bodies = (bodiesSnapshot || Composite.allBodies(world))
        .filter(b => b.label === 'cat' && !b.isStatic && b.cat && !b.cat.merging);
      const snap = {
        cats: bodies.map(b => ({
          t: b.cat.tier,
          x: b.position.x, y: b.position.y,
          a: b.angle,
          vx: b.velocity.x, vy: b.velocity.y,
          av: b.angularVelocity,
        })),
        current: currentCat && currentCat.cat
          ? { t: currentCat.cat.tier, x: currentCat.position.x }
          : null,
        nextTier,
        score,
        reachedFinal,
        ts: Date.now(),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(snap));
      lastAutoSaveAt = now;
      saveDirty = false;
    } catch (_) { /* quota / privacy mode */ }
  }
  function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch {}
    saveDirty = false;
    lastAutoSaveAt = 0;
  }
  function hasSavedGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      // 진행도 없는 저장본은 이어서할 가치가 없음 — 버튼 감춤
      return (data.score > 0) || (Array.isArray(data.cats) && data.cats.length > 0);
    } catch { return false; }
  }
  function getSavedScore() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
      return data.score || 0;
    } catch { return 0; }
  }

  // -------- 캔버스 & 리사이즈 --------
  function setupCanvas() {
    canvas = $('canvas');
    nextCanvas = $('next-cat');
    if (!canvas || typeof canvas.getContext !== 'function' || !nextCanvas || typeof nextCanvas.getContext !== 'function') {
      err('required canvas elements missing');
      return false;
    }

    ctx = canvas.getContext('2d');
    nextCtx = nextCanvas.getContext('2d');
    if (!ctx || !nextCtx) {
      err('canvas 2d context 획득 실패');
      return false;
    }
    fieldBgImage = new Image();
    fieldBgImage.src = 'assets/ui/cushion-field.webp';
    mergeParticleImage = new Image();
    mergeParticleImage.src = 'assets/ui/merge-particles.png';
    mergeBurstImage = new Image();
    mergeBurstImage.src = 'assets/ui/merge-burst-sheet.png';
    landingDustImage = new Image();
    landingDustImage.src = 'assets/ui/landing-dust-sheet.png';
    resizeCanvas();
    window.addEventListener('resize', () => {
      scheduleFitGameLayout();
      resizeCanvas();
    });
    window.addEventListener('orientationchange', scheduleFitGameLayout);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleFitGameLayout);
    }
    log('setupCanvas 완료');
    return true;
  }

  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = FIELD_W * dpr;
    canvas.height = FIELD_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    fieldBgGradient = ctx.createLinearGradient(0, 0, 0, FIELD_H);
    fieldBgGradient.addColorStop(0, '#EAF6F2');
    fieldBgGradient.addColorStop(1, '#C5DDD7');

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
    // 접촉 유지 중에도 체크: 최초 접촉 시 merging 플래그로 스킵된 쌍이
    // 이후 정착 상태로 붙어있기만 하면 영원히 합쳐지지 않는 문제 방지
    Events.on(engine, 'collisionActive', handleCollision);
    // bonk(부딪힘)는 start에만: Active에서 쏘면 매 프레임 중첩 재생됨
    Events.on(engine, 'collisionStart', handleBonk);
    log('initEngine 완료: 벽/바닥 추가 + collisionStart/Active 핸들러 등록');
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

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function getCollisionPoint(pair) {
    const supports = pair.collision && pair.collision.supports;
    if (supports && supports.length) {
      const validSupports = supports.filter((p) => (
        p && Number.isFinite(p.x) && Number.isFinite(p.y)
      ));
      if (!validSupports.length) {
        return {
          x: (pair.bodyA.position.x + pair.bodyB.position.x) / 2,
          y: (pair.bodyA.position.y + pair.bodyB.position.y) / 2,
        };
      }
      const sum = validSupports.reduce((acc, p) => {
        acc.x += p.x;
        acc.y += p.y;
        return acc;
      }, { x: 0, y: 0 });
      return {
        x: sum.x / validSupports.length,
        y: sum.y / validSupports.length,
      };
    }
    return {
      x: (pair.bodyA.position.x + pair.bodyB.position.x) / 2,
      y: (pair.bodyA.position.y + pair.bodyB.position.y) / 2,
    };
  }

  function createLandingDustEffect(pair, intensity, tierIdx) {
    if (prefersReducedMotion()) return;
    const p = getCollisionPoint(pair);
    const tierScale = typeof tierIdx === 'number' ? tierIdx * 0.035 : 0;
    landingDustEffects.push({
      x: clamp(p.x, 8, FIELD_W - 8),
      y: clamp(p.y, 12, FIELD_H - 4),
      age: 0,
      max: 16,
      scale: clamp(0.62 + intensity * 0.82 + tierScale, 0.72, 1.48),
      flip: Math.random() < 0.5 ? -1 : 1,
    });
    if (landingDustEffects.length > LANDING_DUST_MAX) landingDustEffects.shift();
  }

  function createMergeEffect(x, y, r, color, isFinal) {
    const count = isFinal ? 20 : 12;
    const radiusScale = clamp(r / 55, 0.62, isFinal ? 1.85 : 1.45);
    const particleMin = (isFinal ? 15 : 9) * radiusScale;
    const particleMax = (isFinal ? 30 : 20) * radiusScale;
    const particles = [];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i / count) + randomBetween(-0.18, 0.18);
      const finalFrame = isFinal ? 5 : (i % 5);
      particles.push({
        frame: finalFrame,
        angle,
        distance: randomBetween(r * 0.30, r * (isFinal ? 1.90 : 1.35)),
        size: randomBetween(particleMin, particleMax),
        spin: randomBetween(-1.8, 1.8),
        rot: randomBetween(-Math.PI, Math.PI),
        delay: randomBetween(0, 0.16),
      });
    }
    return {
      x, y, r, color,
      age: 0,
      max: isFinal ? 34 : 26,
      isFinal,
      particles,
    };
  }

  function mergePair(a, b, now) {
    const tier = a.cat.tier;
    a.cat.merging = true;
    b.cat.merging = true;

    const midX = (a.position.x + b.position.x) / 2;
    const midY = (a.position.y + b.position.y) / 2;

    World.remove(world, a);
    World.remove(world, b);
    bonkCooldown.delete(a.id);
    bonkCooldown.delete(b.id);

    if (tier < TIERS.length - 1) {
      // 진화
      const next = createCat(tier + 1, midX, midY, false);
      if (!next) { err('merge: createCat가 null 반환 — tier 체인 손상'); return; }
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
        sound?.playCombo(comboCount);
        log(`콤보! ${comboCount}연쇄 +${bonus}pt`);
      } else {
        sound?.playMerge(tier + 1);
      }

      mergeEffects.push(createMergeEffect(midX, midY, TIERS[tier + 1].radius, '#FFB84D', false));
      log(`merge tier ${tier}→${tier + 1}(${TIERS[tier + 1].name}) at (${midX.toFixed(1)}, ${midY.toFixed(1)}) score=${score}`);

      // 최종단계(사바나) 최초 달성 축하 — 1게임당 한 번만
      if (tier + 1 === TIERS.length - 1 && !reachedFinal) {
        reachedFinal = true;
        showFlash(tt('flash.legend'), true);
        sound?.playLegend();
        log('사바나 최초 달성!');
      }
    } else {
      // 최종 단계 끼리 붙음 → 소멸 + 보너스
      score += TIERS[tier].score * 2;
      mergeEffects.push(createMergeEffect(midX, midY, TIERS[tier].radius * 1.3, '#F2B43A', true));
      sound?.playFinalMerge();
      log(`최종단계 소멸 (tier ${tier}) +${TIERS[tier].score * 2}pt score=${score}`);
    }
    updateScoreUI();
    markSaveDirty();
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
      mergePair(a, b, now);
    }
  }

  // Matter.js의 collision 이벤트는 두 바디가 slop 이상 겹쳐야 발사된다.
  // 마찰로 천천히 미끄러져 들어와 "접촉 거리에 정착"하면 영원히 안 합쳐지는
  // 케이스가 발생 — 주기적으로 같은 tier 인접쌍을 직접 검사해서 강제 merge.
  function scanStuckMerges(bodiesSnapshot = null) {
    if (!world) return false;
    const now = performance.now();
    const cats = (bodiesSnapshot || Composite.allBodies(world)).filter(
      (b) => b.label === 'cat' && !b.isStatic && b.cat && !b.cat.merging
    );
    const byTier = new Map();
    let merged = false;
    for (const c of cats) {
      if (!byTier.has(c.cat.tier)) byTier.set(c.cat.tier, []);
      byTier.get(c.cat.tier).push(c);
    }
    for (const [tier, group] of byTier) {
      if (group.length < 2) continue;
      const threshold = TIERS[tier].radius * 2 + 1.0; // 접촉 + 1px slack
      const t2 = threshold * threshold;
      for (let i = 0; i < group.length; i++) {
        const a = group[i];
        if (a.cat.merging) continue;
        for (let j = i + 1; j < group.length; j++) {
          const b = group[j];
          if (b.cat.merging) continue;
          const dx = a.position.x - b.position.x;
          const dy = a.position.y - b.position.y;
          if (dx * dx + dy * dy < t2) {
            log(`stuck merge 감지 tier=${tier} dist=${Math.sqrt(dx * dx + dy * dy).toFixed(2)}`);
            mergePair(a, b, now);
            merged = true;
            break;
          }
        }
      }
    }
    return merged;
  }

  // merge 아닌 충돌(바닥/벽/다른 티어)에만 짧은 "톡" 재생
  function handleBonk(evt) {
    if (gameOver) return;
    const now = performance.now();
    for (const pair of evt.pairs) {
      const a = pair.bodyA, b = pair.bodyB;
      const aIsCat = a.label === 'cat' && !a.isStatic && a.cat;
      const bIsCat = b.label === 'cat' && !b.isStatic && b.cat;
      if (!aIsCat && !bIsCat) continue;
      // 같은 티어 쌍은 merge로 처리됨 — bonk 스킵
      if (aIsCat && bIsCat && a.cat.tier === b.cat.tier) continue;
      // 드롭 직후는 drop 사운드와 겹침 방지
      if (aIsCat && now - a.cat.spawnedAt < BONK_DROP_GRACE_MS) continue;
      if (bIsCat && now - b.cat.spawnedAt < BONK_DROP_GRACE_MS) continue;

      const vax = a.velocity?.x || 0, vay = a.velocity?.y || 0;
      const vbx = b.velocity?.x || 0, vby = b.velocity?.y || 0;
      const dvx = vax - vbx, dvy = vay - vby;
      const speed = Math.sqrt(dvx * dvx + dvy * dvy);
      if (speed < BONK_TRIGGER_SPEED) continue;

      const keyA = aIsCat ? a.id : -1;
      const keyB = bIsCat ? b.id : -1;
      const lastA = keyA >= 0 ? (bonkCooldown.get(keyA) || 0) : 0;
      const lastB = keyB >= 0 ? (bonkCooldown.get(keyB) || 0) : 0;
      if (now - lastA < BONK_COOLDOWN_MS && now - lastB < BONK_COOLDOWN_MS) continue;
      if (keyA >= 0) bonkCooldown.set(keyA, now);
      if (keyB >= 0) bonkCooldown.set(keyB, now);

      // 1.35 ~ 10.35 -> 0.2 ~ 1.0
      const intensity = Math.min(1, (speed - BONK_TRIGGER_SPEED) / 9 + 0.2);
      const tier = aIsCat ? a.cat.tier : b.cat.tier;
      createLandingDustEffect(pair, intensity, tier);
      sound?.playBonk(intensity, tier);
    }
  }

  function pruneBonkCooldown(bodiesSnapshot = null) {
    if (!world || bonkCooldown.size === 0) return;
    const activeCatIds = new Set(
      (bodiesSnapshot || Composite.allBodies(world))
        .filter((b) => b.label === 'cat' && b.cat)
        .map((b) => b.id)
    );
    for (const id of bonkCooldown.keys()) {
      if (!activeCatIds.has(id)) bonkCooldown.delete(id);
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

  function catLabel(tierIdx) {
    if (typeof tierIdx !== 'number') return '';
    return `${tierIdx + 1}. ${tt('cat.' + tierIdx)}`;
  }

  function updateCurrentCatLabel(tierIdx) {
    const el = $('current-cat-name');
    if (!el) return;
    if (typeof tierIdx !== 'number') {
      el.textContent = '';
      el.classList.add('hidden');
      return;
    }
    el.textContent = `${tt('hud.current')}: ${catLabel(tierIdx)}`;
    el.classList.remove('hidden');
  }

  function updateNextCatLabel() {
    const el = $('next-cat-name');
    if (!el) return;
    el.textContent = (typeof nextTier === 'number') ? catLabel(nextTier) : '';
  }

  // -------- 스폰 로직 --------
  function pickNextTier() {
    // 가중치: 원작 수박게임처럼 균등 분포 (5종 각 ~20%)
    const weights = [20, 20, 20, 20, 20];
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
    updateCurrentCatLabel(tier);
    nextTier = pickNextTier();
    drawNextPreview();
    log(`spawnCurrent tier=${tier}(${TIERS[tier].name}) next=${nextTier}`);
  }

  function dropCurrent() {
    if (!currentCat) { log('dropCurrent skip: currentCat 없음'); return; }
    if (dropCooldown) { log('dropCurrent skip: cooldown'); return; }
    if (gameOver) { log('dropCurrent skip: gameOver'); return; }
    const tier = currentCat.cat.tier;
    const pos = { x: currentCat.position.x, y: currentCat.position.y };
    Body.setStatic(currentCat, false);
    // 복구가 정상인지 즉시 검증 (Matter.js v0.20 setStatic 회귀 조기 감지)
    if (!Number.isFinite(currentCat.mass) || currentCat.inverseMass === 0) {
      err(`dropCurrent: setStatic(false) 후 mass 이상 mass=${currentCat.mass} invMass=${currentCat.inverseMass} — _original이 누락됐을 가능성 (createCat 수정 회귀?)`);
    }
    currentCat.cat.spawnedAt = performance.now();
    sound?.playDrop(tier);
    markSaveDirty();
    log(`dropCurrent tier=${tier} at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`);
    currentCat = null;
    updateCurrentCatLabel(null);
    dropCooldown = true;
    if (dropCooldownTimeoutId) clearTimeout(dropCooldownTimeoutId);
    dropCooldownTimeoutId = setTimeout(() => {
      dropCooldownTimeoutId = null;
      dropCooldown = false;
      // running 체크 추가: 메뉴 이탈 후 stray 고양이 생성 방지
      if (running && !gameOver) spawnCurrent();
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
  function checkGameOver(bodiesSnapshot = null) {
    if (gameOver) return false;
    const now = performance.now();
    const bodies = bodiesSnapshot || Composite.allBodies(world);
    let changed = false;
    let anyDanger = false;
    for (const b of bodies) {
      if (b.label !== 'cat' || b.isStatic || !b.cat) continue;
      if (now - b.cat.spawnedAt < POST_DROP_GRACE_MS) continue;
      // 캔버스를 벗어난 바디(물리 이탈) 감지
      if (b.position.y > FIELD_H + 200 || b.position.x < -100 || b.position.x > FIELD_W + 100) {
        warn(`off-canvas 바디 tier=${b.cat.tier} pos=(${b.position.x.toFixed(1)}, ${b.position.y.toFixed(1)}) — 제거`);
        World.remove(world, b);
        bonkCooldown.delete(b.id);
        changed = true;
        continue;
      }
      const r = TIERS[b.cat.tier].radius;
      const top = b.position.y - r;
      if (top < DANGER_LINE) {
        anyDanger = true;
        if (!b.cat.aboveSince) {
          b.cat.aboveSince = now;
          log(`danger 진입 tier=${b.cat.tier} top=${top.toFixed(1)} (DANGER_LINE=${DANGER_LINE})`);
        }
        if (now - b.cat.aboveSince > GAME_OVER_GRACE_MS) {
          triggerGameOver();
          return true;
        }
      } else {
        b.cat.aboveSince = 0;
      }
    }
    setDangerActive(anyDanger);
    return changed;
  }

  function triggerGameOver() {
    const isNew = score > bestScore;
    log(`triggerGameOver score=${score} best=${bestScore} newRecord=${isNew}`);
    gameOver = true;
    running = false;
    setDangerActive(false);
    updateCurrentCatLabel(null);
    if (dropCooldownTimeoutId) { clearTimeout(dropCooldownTimeoutId); dropCooldownTimeoutId = null; }
    clearSave();
    if (isNew) { bestScore = score; saveBest(bestScore); }
    $('final-score').textContent = score.toLocaleString();
    const nr = $('new-record');
    if (isNew) nr.classList.remove('hidden'); else nr.classList.add('hidden');
    resetRankSubmit();
    show(modals.gameover);
    sound?.playGameOver();
    if (isNew) {
      if (newRecordTimeoutId) clearTimeout(newRecordTimeoutId);
      newRecordTimeoutId = setTimeout(() => {
        newRecordTimeoutId = null;
        sound?.playNewRecord();
      }, 1600);
    }
  }

  function drawFallbackParticle(frame, size, color) {
    ctx.save();
    ctx.fillStyle = frame === 3 ? '#FF8FA3' : color;
    ctx.strokeStyle = 'rgba(58, 41, 32, 0.70)';
    ctx.lineWidth = Math.max(1.2, size * 0.09);
    if (frame === 1 || frame === 5) {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = (i % 2 === 0) ? size * 0.50 : size * 0.20;
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMergeParticle(frame, x, y, size, rotation, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    if (mergeParticleImage && mergeParticleImage.complete && mergeParticleImage.naturalWidth > 0) {
      ctx.drawImage(
        mergeParticleImage,
        frame * MERGE_PARTICLE_CELL, 0, MERGE_PARTICLE_CELL, MERGE_PARTICLE_CELL,
        -size / 2, -size / 2, size, size
      );
    } else {
      drawFallbackParticle(frame, size, '#FFB84D');
    }
    ctx.restore();
  }

  function drawMergeBurst(effect, t) {
    if (!mergeBurstImage || !mergeBurstImage.complete || mergeBurstImage.naturalWidth <= 0) return;
    const frame = Math.min(MERGE_BURST_FRAMES - 1, Math.floor(t * MERGE_BURST_FRAMES));
    const baseSize = effect.isFinal
      ? clamp(effect.r * 1.95 + 34, 150, 286)
      : clamp(effect.r * 2.22 + 24, 64, 226);
    const pulse = 0.92 + Math.sin(Math.min(1, t) * Math.PI) * 0.14;
    const lateFade = t < 0.72 ? 1 : Math.max(0, 1 - (t - 0.72) / 0.28);
    const size = baseSize * pulse;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, lateFade * (effect.isFinal ? 0.96 : 0.88)));
    ctx.drawImage(
      mergeBurstImage,
      frame * MERGE_BURST_CELL, 0, MERGE_BURST_CELL, MERGE_BURST_CELL,
      effect.x - size / 2, effect.y - size / 2, size, size
    );
    ctx.restore();
  }

  // -------- 렌더링 --------
  function drawFallbackLandingDust(effect, t) {
    const fade = 1 - t;
    const spread = effect.scale * (0.84 + t * 0.42);
    ctx.save();
    ctx.globalAlpha = 0.55 * fade;
    ctx.fillStyle = '#E0A55D';
    ctx.beginPath();
    ctx.ellipse(effect.x - 14 * spread, effect.y - 2, 10 * spread, 5 * spread, 0, 0, Math.PI * 2);
    ctx.ellipse(effect.x + 1 * spread, effect.y - 5, 14 * spread, 7 * spread, 0, 0, Math.PI * 2);
    ctx.ellipse(effect.x + 16 * spread, effect.y - 2, 9 * spread, 5 * spread, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.38 * fade;
    ctx.fillStyle = '#FFF0C8';
    ctx.beginPath();
    ctx.ellipse(effect.x - 6 * spread, effect.y - 7, 11 * spread, 5 * spread, 0, 0, Math.PI * 2);
    ctx.ellipse(effect.x + 10 * spread, effect.y - 7, 10 * spread, 5 * spread, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawLandingDustEffect(effect) {
    const t = clamp(effect.age / effect.max, 0, 1);
    if (!landingDustImage || !landingDustImage.complete || landingDustImage.naturalWidth <= 0) {
      drawFallbackLandingDust(effect, t);
      return;
    }
    const frame = Math.min(LANDING_DUST_FRAMES - 1, Math.floor(t * LANDING_DUST_FRAMES));
    const size = LANDING_DUST_CELL * effect.scale * (0.9 + t * 0.12);
    ctx.save();
    ctx.translate(effect.x, effect.y);
    ctx.scale(effect.flip, 1);
    ctx.globalAlpha = Math.max(0, Math.min(1, (1 - t) * 0.78));
    ctx.drawImage(
      landingDustImage,
      frame * LANDING_DUST_CELL, 0, LANDING_DUST_CELL, LANDING_DUST_CELL,
      -size / 2, -size * 0.72, size, size
    );
    ctx.restore();
  }

  function render(bodiesSnapshot = null) {
    // 배경 — 은은한 베이지 + 경계선
    ctx.clearRect(0, 0, FIELD_W, FIELD_H);
    // 필드 내부 부드러운 그라데이션 (AI 같지 않게 톤온톤 1.5단계)
    if (fieldBgImage && fieldBgImage.complete && fieldBgImage.naturalWidth > 0) {
      const iw = fieldBgImage.naturalWidth;
      const ih = fieldBgImage.naturalHeight;
      const scale = Math.max(FIELD_W / iw, FIELD_H / ih);
      const sw = FIELD_W / scale;
      const sh = FIELD_H / scale;
      ctx.drawImage(fieldBgImage, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, FIELD_W, FIELD_H);
      // 가장자리만 살짝 어두워지는 비네트 (전체 틴트 대신 — 고양이 가독성 유지)
      const vignette = ctx.createRadialGradient(
        FIELD_W / 2, FIELD_H / 2, Math.min(FIELD_W, FIELD_H) * 0.45,
        FIELD_W / 2, FIELD_H / 2, Math.max(FIELD_W, FIELD_H) * 0.78
      );
      vignette.addColorStop(0, 'rgba(60, 40, 25, 0)');
      vignette.addColorStop(1, 'rgba(60, 40, 25, 0.22)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    } else {
      ctx.fillStyle = fieldBgGradient || '#DCECE7';
      ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    }

    // 위험선
    const dangerPulse = dangerActive ? (0.65 + Math.sin(performance.now() * 0.012) * 0.35) : 0;
    if (dangerActive) {
      ctx.save();
      const dangerWash = ctx.createLinearGradient(0, 0, 0, DANGER_LINE + 36);
      dangerWash.addColorStop(0, `rgba(232, 90, 79, ${0.10 + dangerPulse * 0.05})`);
      dangerWash.addColorStop(1, 'rgba(232, 90, 79, 0)');
      ctx.fillStyle = dangerWash;
      ctx.fillRect(0, 0, FIELD_W, DANGER_LINE + 36);
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = dangerActive
      ? `rgba(232, 90, 79, ${0.70 + dangerPulse * 0.25})`
      : 'rgba(232, 90, 79, 0.55)';
    ctx.setLineDash(dangerActive ? [10, 5] : [9, 7]);
    ctx.lineWidth = dangerActive ? 2.5 : 2;
    ctx.beginPath();
    ctx.moveTo(6, DANGER_LINE);
    ctx.lineTo(FIELD_W - 6, DANGER_LINE);
    ctx.stroke();
    ctx.restore();

    // 벽/바닥 라인 (내부 아트)
    ctx.strokeStyle = 'rgba(58, 41, 32, 0.12)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, FIELD_W - 3, FIELD_H - 3);

    for (let i = landingDustEffects.length - 1; i >= 0; i--) {
      const e = landingDustEffects[i];
      e.age++;
      if (e.age >= e.max) { landingDustEffects.splice(i, 1); continue; }
      drawLandingDustEffect(e);
    }

    // 고양이
    const bodies = bodiesSnapshot || Composite.allBodies(world);
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
      const ease = 1 - Math.pow(1 - t, 2);
      const alpha = 1 - t;
      drawMergeBurst(e, t);
      ctx.save();
      ctx.globalAlpha = alpha * (e.isFinal ? 0.78 : 0.62);
      ctx.strokeStyle = e.isFinal ? '#F2B43A' : e.color;
      ctx.lineWidth = e.isFinal ? 4 + (1 - t) * 3 : 3 + (1 - t) * 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * (0.74 + ease * (e.isFinal ? 1.45 : 1.05)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      for (const p of e.particles || []) {
        const localT = Math.max(0, Math.min(1, (t - p.delay) / (1 - p.delay)));
        if (localT <= 0) continue;
        const particleEase = 1 - Math.pow(1 - localT, 2);
        const wobble = Math.sin(localT * Math.PI) * (e.isFinal ? 8 : 5);
        const dist = p.distance * particleEase;
        const px = e.x + Math.cos(p.angle) * dist + Math.cos(p.angle + Math.PI / 2) * wobble;
        const py = e.y + Math.sin(p.angle) * dist + Math.sin(p.angle + Math.PI / 2) * wobble - e.r * 0.12 * localT;
        const size = p.size * (0.72 + Math.sin(localT * Math.PI) * 0.36);
        drawMergeParticle(p.frame, px, py, size, p.rot + p.spin * localT, alpha * (1 - p.delay * 0.5));
      }
    }

  }

  function drawNextPreview() {
    nextCtx.clearRect(0, 0, 72, 72);
    updateNextCatLabel();
    if (nextTier == null) return;
    const r = Math.min(27, TIERS[nextTier].radius);
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
        const dt = Math.min(16.666, ts - lastTs || 16.666);
        if (dt > 50) warn(`프레임 지연 감지 dt=${dt.toFixed(1)}ms (탭 백그라운드?)`);
        Engine.update(engine, dt);
        let bodies = Composite.allBodies(world);
        if (checkGameOver(bodies)) bodies = Composite.allBodies(world);
        _frameCount++;
        // 매 30프레임(약 0.5초)마다 stuck merge 검사 — 정적 접촉으로 갇힌 쌍 구제
        if (_frameCount % 30 === 0 && scanStuckMerges(bodies)) {
          bodies = Composite.allBodies(world);
        }
        // 매 60프레임(약 1초)마다 NaN 감시 + 옵션으로 상태 스냅샷
        if (_frameCount % 60 === 0) {
          assertBodiesFinite('tick', bodies);
          pruneBonkCooldown(bodies);
          _lastFpsAt = ts;
          _framesSinceFps = 0;
        }
        // 매 90프레임(약 1.5초)마다 이어서하기용 자동저장
        if (_frameCount % 180 === 0) autoSave(false, bodies);
        _framesSinceFps++;
        render(bodies);
      } catch (e) {
        err('loop tick 예외:', e.message, e.stack);
        running = false;
        setDangerActive(false);
        return;
      }
      lastTs = ts;
      requestAnimationFrame(tick);
    };
  }

  // -------- 게임 제어 --------
  function startGame() {
    log('startGame 진입');
    // 이전 게임의 pending 사운드/타이머 취소
    if (newRecordTimeoutId) { clearTimeout(newRecordTimeoutId); newRecordTimeoutId = null; }
    if (dropCooldownTimeoutId) { clearTimeout(dropCooldownTimeoutId); dropCooldownTimeoutId = null; }
    sound?.stopAll();
    clearSave();
    score = 0;
    comboCount = 0;
    lastMergeAt = 0;
    reachedFinal = false;
    gameOver = false;
    setDangerActive(false);
    running = true;
    dropCooldown = false;
    saveDirty = false;
    lastAutoSaveAt = 0;
    mergeEffects.length = 0;
    landingDustEffects.length = 0;
    bonkCooldown.clear();
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
    scheduleFitGameLayout();
    lastTs = 0;
    loopToken++;
    log(`새 루프 시작 (token=${loopToken})`);
    requestAnimationFrame(makeTick(loopToken));
  }

  // 저장된 스냅샷에서 게임 복원. 실패 시 새 게임으로 폴백.
  function resumeGame() {
    let raw = null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
      if (!raw) { log('resumeGame: 저장 데이터 없음 → 새 게임'); startGame(); return; }
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.cats)) throw new Error('invalid save format');

      // 이전 게임 상태 정리 (startGame과 동일한 루틴)
      if (newRecordTimeoutId) { clearTimeout(newRecordTimeoutId); newRecordTimeoutId = null; }
      if (dropCooldownTimeoutId) { clearTimeout(dropCooldownTimeoutId); dropCooldownTimeoutId = null; }
      sound?.stopAll();
      score = data.score || 0;
      comboCount = 0;      // 콤보 체인은 performance.now 기반이라 리로드 후 의미 없음
      lastMergeAt = 0;
      reachedFinal = !!data.reachedFinal;
      gameOver = false;
      setDangerActive(false);
      running = true;
      dropCooldown = false;
      saveDirty = false;
      lastAutoSaveAt = 0;
      mergeEffects.length = 0;
      landingDustEffects.length = 0;
      bonkCooldown.clear();
      _frameCount = 0;
      _lastFpsAt = 0;
      _framesSinceFps = 0;

      if (world) {
        const existing = Composite.allBodies(world).filter(b => b.label === 'cat');
        existing.forEach(b => World.remove(world, b));
        log(`resumeGame: 기존 cat 바디 ${existing.length}개 제거`);
      } else {
        initEngine();
      }

      // 필드 고양이 복원 (위치/속도/각속도)
      let restored = 0;
      for (const c of data.cats) {
        if (typeof c.t !== 'number' || !Number.isFinite(c.x) || !Number.isFinite(c.y)) continue;
        const body = createCat(c.t, c.x, c.y, false);
        if (!body) continue;
        body.cat.spawnedAt = performance.now() - POST_DROP_GRACE_MS - 1;
        Body.setAngle(body, Number.isFinite(c.a) ? c.a : 0);
        Body.setVelocity(body, {
          x: Number.isFinite(c.vx) ? c.vx : 0,
          y: Number.isFinite(c.vy) ? c.vy : 0,
        });
        Body.setAngularVelocity(body, Number.isFinite(c.av) ? c.av : 0);
        restored++;
      }

      // 상단 대기 고양이 복원 (없으면 새로 스폰)
      nextTier = (typeof data.nextTier === 'number') ? data.nextTier : pickNextTier();
      if (data.current && typeof data.current.t === 'number') {
        const curX = Number.isFinite(data.current.x) ? data.current.x : FIELD_W / 2;
        const r = TIERS[data.current.t].radius;
        const clampedX = Math.min(FIELD_W - r, Math.max(r, curX));
        pointerX = clampedX;
        currentCat = createCat(data.current.t, clampedX, SPAWN_Y, true);
        updateCurrentCatLabel(data.current.t);
        drawNextPreview();
      } else {
        spawnCurrent();
      }

      updateScoreUI();
      scheduleFitGameLayout();
      lastTs = 0;
      loopToken++;
      log(`resumeGame 완료 score=${score} restored=${restored} next=${nextTier} token=${loopToken}`);
      requestAnimationFrame(makeTick(loopToken));
    } catch (e) {
      err('resumeGame 예외:', e.message, e.stack);
      clearSave();
      startGame();
    }
  }

  // 메뉴의 '이어서 하기' 버튼 표시/갱신
  function updateMenuResumeButton() {
    const btn = $('resume-btn-menu');
    if (!btn) return;
    if (hasSavedGame()) {
      const saved = getSavedScore();
      const label = tt('menu.resume') + (saved > 0 ? `  ·  ${saved.toLocaleString()}` : '');
      btn.textContent = label;
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
    }
  }

  // 사운드 토글 버튼 UI 반영
  function updateSoundBtn() {
    const btn = $('sound-btn');
    if (!btn || !sound) return;
    btn.textContent = '';
    btn.classList.toggle('muted', !sound.enabled);
  }

  function exitToMenu() {
    log('exitToMenu');
    // 게임 오버가 아니라 홈 이탈한 경우 한 번 flush — 주기 저장(1.5s) 사이 이탈해도 보존
    if (running && !gameOver) autoSave(true);
    running = false;
    gameOver = false;
    setDangerActive(false);
    currentCat = null; // 이전 게임 참조 정리
    updateCurrentCatLabel(null);
    if (newRecordTimeoutId) { clearTimeout(newRecordTimeoutId); newRecordTimeoutId = null; }
    if (dropCooldownTimeoutId) { clearTimeout(dropCooldownTimeoutId); dropCooldownTimeoutId = null; }
    sound?.stopAll();
    landingDustEffects.length = 0;
    hide(modals.gameover);
    hide(screens.game);
    show(screens.menu);
    $('best-score').textContent = bestScore.toLocaleString();
    updateMenuResumeButton();
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
      CatAssets.drawCat(cctx, i, 32, 32, 0, 22);
      cell.appendChild(c);
      const label = document.createElement('div');
      label.className = 'tier-name';
      label.textContent = (i + 1) + '. ' + tt('cat.' + i);
      cell.appendChild(label);
      wrap.appendChild(cell);
    });
  }

  function buildGameTierStrip() {
    const wrap = $('game-tier-strip');
    if (!wrap) return;
    wrap.innerHTML = '';
    wrap.setAttribute('role', 'list');
    TIERS.forEach((_tier, i) => {
      const cell = document.createElement('div');
      cell.className = 'game-tier-cell';
      cell.title = catLabel(i);
      cell.setAttribute('role', 'listitem');
      cell.setAttribute('aria-label', catLabel(i));

      const c = document.createElement('canvas');
      c.setAttribute('aria-hidden', 'true');
      c.width = 36;
      c.height = 36;
      const cctx = c.getContext('2d');
      CatAssets.drawCat(cctx, i, 18, 18, 0, 12);
      cell.appendChild(c);

      const text = document.createElement('div');
      text.className = 'game-tier-text';
      const num = document.createElement('div');
      num.className = 'game-tier-num';
      num.textContent = `${i + 1}`;
      const name = document.createElement('div');
      name.className = 'game-tier-name';
      name.textContent = tt('cat.' + i);
      text.appendChild(num);
      text.appendChild(name);
      cell.appendChild(text);
      wrap.appendChild(cell);
    });
    scheduleFitGameLayout();
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

      if (window.__CAT_TOWER_EXTERNAL_BROWSER_REQUIRED) {
        log('external browser guide active; skip game boot');
        return;
      }

      // i18n 초기 적용 — DOM 문자열을 현재 언어로 스왑
      if (window.I18N) window.I18N.applyDom();

      if (!setupCanvas()) return;
      setupInput();
      bestScore = loadBest();
      $('best-score').textContent = bestScore.toLocaleString();
      log(`best 로드: ${bestScore}`);

      // 필수 DOM 엘리먼트 검증 — 하나라도 누락되면 게임 자체가 동작 안 함
      const required = ['play-btn', 'resume-btn-menu', 'how-btn', 'how-close', 'home-btn',
        'replay-btn', 'menu-btn', 'rank-btn', 'rank-close',
        'rank-content', 'submit-rank-btn', 'skip-rank-btn', 'nickname-input', 'submit-status',
        'lang-ko', 'lang-en', 'score', 'best-score',
        'final-score', 'new-record', 'combo-flash', 'tier-preview',
        'current-cat-name', 'next-cat-name', 'game-tier-strip'];
      for (const id of required) {
        if (!$(id)) err(`필수 엘리먼트 #${id} 누락`);
      }

      // 버튼 바인딩
      const playBtn = $('play-btn');
      playBtn.disabled = true;
      playBtn.textContent = '불러오는 중…';

      $('how-btn').addEventListener('click', () => { sound?.playButton(); log('UI: how 열기'); show(modals.how); });
      $('how-close').addEventListener('click', () => { sound?.playButton(); log('UI: how 닫기'); hide(modals.how); });

      // 홈 버튼 (HUD) — 바로 메인 메뉴로. 진행중이면 자동저장이 걸려있어 '이어서 하기'로 복귀 가능
      $('home-btn').addEventListener('click', () => { sound?.playButton(); log('UI: 홈 클릭'); exitToMenu(); });
      $('replay-btn').addEventListener('click', () => { sound?.playButton(); log('UI: 다시도전 클릭'); hide(modals.gameover); startGame(); });
      $('menu-btn').addEventListener('click', () => { sound?.playButton(); exitToMenu(); });

      // 사운드 토글
      const soundBtn = $('sound-btn');
      if (soundBtn && sound) {
        soundBtn.addEventListener('click', () => {
          sound.ensureContext();
          const wasOff = !sound.enabled;
          sound.toggle();
          updateSoundBtn();
          // 켠 순간에만 피드백 — 끌 때는 무음이 자연스러움
          if (wasOff && sound.enabled) sound.playButton();
        });
        updateSoundBtn();
      }

      // 랭킹 모달
      $('rank-btn').addEventListener('click', () => { sound?.playButton(); log('UI: 랭킹 클릭'); openRankModal(); });
      $('rank-close').addEventListener('click', () => { sound?.playButton(); hide(modals.rank); });

      // 게임오버 랭킹 등록 / Skip
      $('submit-rank-btn').addEventListener('click', () => { sound?.playButton(); handleSubmitRank(); });
      $('skip-rank-btn').addEventListener('click', () => { sound?.playButton(); handleSkipRank(); });
      $('nickname-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleSubmitRank(); }
      });

      // 언어 토글 — 버튼 전체 클릭 시 ko ↔ en 토글
      const langToggle = $('lang-toggle');
      if (langToggle) {
        langToggle.addEventListener('click', () => {
          const cur = window.I18N ? window.I18N.getLang() : 'ko';
          const next = cur === 'ko' ? 'en' : 'ko';
          log(`UI: 언어 전환 → ${next}`);
          if (window.I18N) window.I18N.setLang(next);
        });
      }
      updateLangButtons();
      window.addEventListener('cattower:langchange', () => {
        updateLangButtons();
        // 티어 프리뷰는 텍스트에 언어별 고양이 이름이 들어있어 재생성 필요
        buildTierPreview();
        buildGameTierStrip();
        // 플레이 버튼이 '불러오는 중…'이 아닐 때만 i18n 라벨 복원 (preload 실패 시 보존)
        const pb = $('play-btn');
        if (!pb.disabled) pb.textContent = tt('menu.play');
        // 이어서 버튼은 점수 suffix가 붙어있어 applyDom 대신 직접 재갱신
        updateMenuResumeButton();
        updateCurrentCatLabel(currentCat?.cat?.tier);
        updateNextCatLabel();
      });

      // 메뉴 진입 시 이어서 버튼 상태 반영
      updateMenuResumeButton();

      // 탭 숨김/종료 시 마지막 한 번 flush — 주기 저장 사이에 이탈해도 진행도 보존
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) autoSave(true);
      });
      window.addEventListener('pagehide', () => { autoSave(true); });

      playBtn.addEventListener('click', () => {
        // 첫 user gesture에서 AudioContext 초기화 (iOS/Safari 대응)
        sound?.ensureContext();
        sound?.playButton();
        if (sound?.enabled) {
          try {
            const catSfx = new Audio('sound/stu9-cute-cat-352656.mp3');
            catSfx.volume = 0.8;
            catSfx.play().catch(() => {});
          } catch (e) {}
        }
        log('UI: 플레이 클릭');
        hide(screens.menu);
        show(screens.game);
        startGame();
      });

      // 이어서 하기 버튼
      const resumeMenuBtn = $('resume-btn-menu');
      if (resumeMenuBtn) {
        resumeMenuBtn.addEventListener('click', () => {
          sound?.ensureContext();
          sound?.playButton();
          log('UI: 이어서 하기 클릭');
          hide(screens.menu);
          show(screens.game);
          resumeGame();
        });
      }

      // 에셋 프리로드
      try {
        log('에셋 프리로드 시작');
        await CatAssets.preloadAll();
        log('에셋 프리로드 완료');
        buildTierPreview();
        buildGameTierStrip();
        // 사운드 합성 그래프 선행 구축 — AudioContext는 suspended지만 노드/reverb IR 생성은 가능.
        // 첫 플레이 시 Tone.js 초기화 블로킹으로 인한 100ms+ 히치 제거.
        try { sound?.init(); log('SoundManager pre-init 완료'); } catch (e) { warn('SoundManager pre-init 실패:', e.message); }
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
        }
        if (e.key === ' ' && running && !gameOver) {
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
