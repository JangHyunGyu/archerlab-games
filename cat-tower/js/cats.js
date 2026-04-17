// 고양이 타워 — 진화 테이블 + Twemoji 에셋 로더
// 렌더링: 품종별 바디 컬러/패턴을 캔버스 프리미티브로 직접 그리고,
// 그 위에 Twemoji 고양이 얼굴을 올린다. 오프스크린 필터 의존 없음 →
// 이미지 로드가 실패해도 최소 컬러 원은 보이도록 안전망.
//
// 라이선스: Twemoji CC-BY 4.0 (Twitter 디자인팀 수작), jdecked fork 유지보수.

(function (global) {
  'use strict';

  const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/';

  // 각 단계 = 실제 고양이 품종. 바디 컬러와 패턴이 그 품종 정체성을 결정.
  // radius: 필드 내부 원 반경(px, 400×560 좌표계)
  // fill/stroke: 바디 기본색 / 외곽선
  // pattern: 'stripes' | 'tuxedo' | 'calico' | 'spots' | null
  // emoji: Twemoji 코드포인트 (얼굴 표정 매핑)
  // emojiScale: r 대비 이모지 얼굴 크기 (0.68~0.82)
  // aura: 전설 단계 후광 색
  const CAT_TIERS = [
    { id: 1,  name: '새끼 고양이',   radius: 18,  score: 10,
      fill: '#FFD8B5', stroke: '#D89A6A', pattern: null,
      emoji: '1f431', emojiScale: 0.82 },

    { id: 2,  name: '치즈',          radius: 24,  score: 25,
      fill: '#F4A15C', stroke: '#B76A28', pattern: 'stripes', patternColor: '#D97D2D',
      emoji: '1f63a', emojiScale: 0.80 },

    { id: 3,  name: '턱시도',        radius: 32,  score: 55,
      fill: '#2E2A28', stroke: '#121010', pattern: 'tuxedo',
      emoji: '1f408-200d-2b1b', emojiScale: 0.78 },

    { id: 4,  name: '삼색이',        radius: 40,  score: 110,
      fill: '#FAF0DA', stroke: '#B79E6E', pattern: 'calico',
      emoji: '1f63c', emojiScale: 0.76 },

    { id: 5,  name: '고등어',        radius: 48,  score: 220,
      fill: '#ABB5C0', stroke: '#6E7985', pattern: 'stripes', patternColor: '#6E7985',
      emoji: '1f638', emojiScale: 0.74 },

    { id: 6,  name: '러시안 블루',   radius: 58,  score: 440,
      fill: '#8A9BA8', stroke: '#556470', pattern: null,
      emoji: '1f63b', emojiScale: 0.72 },

    { id: 7,  name: '스코티시 폴드', radius: 70,  score: 880,
      fill: '#D9B884', stroke: '#9B7742', pattern: null,
      emoji: '1f63d', emojiScale: 0.72 },

    { id: 8,  name: '페르시안',      radius: 82,  score: 1700,
      fill: '#FAF6ED', stroke: '#C9BE9E', pattern: 'fluff',
      emoji: '1f640', emojiScale: 0.68 },

    { id: 9,  name: '메인쿤',        radius: 96,  score: 3500,
      fill: '#8B6B4A', stroke: '#4E3721', pattern: 'stripes', patternColor: '#4E3721',
      emoji: '1f63e', emojiScale: 0.70 },

    { id: 10, name: '사바나',        radius: 112, score: 10000,
      fill: '#E8B559', stroke: '#8E6424', pattern: 'spots', patternColor: '#3A2A15',
      emoji: '1f639', emojiScale: 0.68,
      aura: '#F2B43A' },
  ];

  const imageCache = new Map(); // emoji → HTMLImageElement (loaded)

  function loadImage(emojiCode) {
    if (imageCache.has(emojiCode)) {
      const cached = imageCache.get(emojiCode);
      if (cached instanceof Image) return Promise.resolve(cached);
      return cached; // Promise 중
    }
    const p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        imageCache.set(emojiCode, img);
        resolve(img);
      };
      img.onerror = () => {
        // 실패해도 게임은 계속 — 바디 컬러만으로 렌더
        console.warn('[cats] 이모지 로드 실패:', emojiCode);
        resolve(null);
      };
      img.src = TWEMOJI_BASE + emojiCode + '.svg';
    });
    imageCache.set(emojiCode, p);
    return p;
  }

  async function preloadAll() {
    await Promise.all(CAT_TIERS.map((t) => loadImage(t.emoji)));
  }

  // ---------- 패턴 ----------
  function drawPattern(ctx, tier, r) {
    if (!tier.pattern) return;
    ctx.save();
    // 바디 원 안쪽에 클립 (fluff 제외 — fluff는 바디 밖 털)
    if (tier.pattern !== 'fluff') {
      ctx.beginPath();
      ctx.arc(0, 0, r - 0.5, 0, Math.PI * 2);
      ctx.clip();
    }

    if (tier.pattern === 'stripes') {
      ctx.strokeStyle = tier.patternColor;
      ctx.lineWidth = Math.max(2, r * 0.14);
      ctx.lineCap = 'round';
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(-r * 1.2, i * r * 0.42);
        ctx.quadraticCurveTo(0, i * r * 0.42 - r * 0.12, r * 1.2, i * r * 0.42);
        ctx.stroke();
      }
    } else if (tier.pattern === 'tuxedo') {
      ctx.fillStyle = '#FCF8EE';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.35, r * 0.58, r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (tier.pattern === 'calico') {
      ctx.fillStyle = '#E8863A';
      ctx.beginPath();
      ctx.arc(-r * 0.4, -r * 0.2, r * 0.52, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2E2A28';
      ctx.beginPath();
      ctx.arc(r * 0.38, r * 0.32, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
    } else if (tier.pattern === 'spots') {
      ctx.fillStyle = tier.patternColor;
      const spots = [
        [-0.45, -0.35, 0.17],
        [ 0.35, -0.40, 0.15],
        [-0.30,  0.30, 0.20],
        [ 0.45,  0.20, 0.18],
        [ 0.00, -0.10, 0.12],
        [ 0.10,  0.50, 0.14],
      ];
      for (const [sx, sy, sr] of spots) {
        ctx.beginPath();
        ctx.arc(sx * r, sy * r, sr * r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (tier.pattern === 'fluff') {
      // 복슬복슬한 털끝 (바디 둘레 바깥쪽)
      ctx.strokeStyle = '#E8E2D0';
      ctx.lineWidth = Math.max(1.5, r * 0.06);
      ctx.lineCap = 'round';
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const inR = r * 0.94;
        const outR = r * 1.10;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * inR, Math.sin(a) * inR);
        ctx.lineTo(Math.cos(a) * outR, Math.sin(a) * outR);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ---------- 메인 드로우 ----------
  function drawCat(ctx, tierIdx, x, y, angle, radius) {
    const tier = CAT_TIERS[tierIdx];
    const r = radius || tier.radius;

    ctx.save();
    ctx.translate(x, y);
    if (angle) ctx.rotate(angle);

    // 후광 (전설)
    if (tier.aura) {
      const grd = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.6);
      grd.addColorStop(0.0, tier.aura + 'AA');
      grd.addColorStop(0.5, tier.aura + '33');
      grd.addColorStop(1.0, tier.aura + '00');
      ctx.fillStyle = grd;
      ctx.fillRect(-r * 1.6, -r * 1.6, r * 3.2, r * 3.2);
    }

    // 바닥 그림자 (회전 독립적으로 보이게, 역회전 처리)
    ctx.save();
    if (angle) ctx.rotate(-angle);
    ctx.fillStyle = 'rgba(58, 41, 32, 0.16)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.95, r * 0.85, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // fluff는 바디 밖 털끝이라 먼저 그림
    if (tier.pattern === 'fluff') drawPattern(ctx, tier, r);

    // 바디 원
    ctx.fillStyle = tier.fill;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // 바디 내부 패턴
    if (tier.pattern && tier.pattern !== 'fluff') drawPattern(ctx, tier, r);

    // 외곽선
    ctx.strokeStyle = tier.stroke;
    ctx.lineWidth = Math.max(1.5, r * 0.05);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    // 이모지 얼굴 (로드된 경우에만)
    const imgOrPromise = imageCache.get(tier.emoji);
    if (imgOrPromise instanceof Image && imgOrPromise.complete && imgOrPromise.naturalWidth > 0) {
      const er = r * (tier.emojiScale || 0.75);
      ctx.drawImage(imgOrPromise, -er, -er, er * 2, er * 2);
    }

    ctx.restore();
  }

  global.CatAssets = {
    TIERS: CAT_TIERS,
    preloadAll,
    drawCat,
    drawCatStatic: (ctx, i, x, y, r) => drawCat(ctx, i, x, y, 0, r),
  };
})(window);
