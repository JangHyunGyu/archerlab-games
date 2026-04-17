// 고양이 타워 — 진화 테이블 + Twemoji 에셋 로더
// 렌더링: 품종별 바디 컬러/패턴을 캔버스 프리미티브로 직접 그리고,
// 그 위에 Twemoji 고양이 얼굴을 올린다. 오프스크린 필터 의존 없음 →
// 이미지 로드가 실패해도 최소 컬러 원은 보이도록 안전망.
//
// 라이선스: Twemoji CC-BY 4.0 (Twitter 디자인팀 수작), jdecked fork 유지보수.

(function (global) {
  'use strict';

  const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/';

  // 컬러 유틸 — hex → 밝게/어둡게 (구슬 그라데이션용)
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16),
    ];
  }
  function rgbToHex(r, g, b) {
    const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return '#' + c(r) + c(g) + c(b);
  }
  function lighten(hex, amount) {
    const [r, g, b] = hexToRgb(hex);
    return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
  }
  function darken(hex, amount) {
    const [r, g, b] = hexToRgb(hex);
    return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
  }

  // 각 단계 = 실제 고양이 품종. 바디 컬러와 패턴이 그 품종 정체성을 결정.
  // radius: 필드 내부 원 반경(px, 400×540 좌표계, Suika 체리~멜론 비율)
  // fill/stroke: 바디 기본색 / 외곽선
  // pattern: 'stripes' | 'tuxedo' | 'calico' | 'spots' | null
  // emoji: Twemoji 코드포인트 (얼굴 표정 매핑)
  // emojiScale: r 대비 이모지 얼굴 크기 (0.68~0.82)
  // aura: 전설 단계 후광 색
  const CAT_TIERS = [
    { id: 1,  name: '새끼 고양이',   radius: 15,  score: 10,
      fill: '#FFD8B5', stroke: '#D89A6A', pattern: null,
      emoji: '1f431', emojiScale: 0.82 },

    { id: 2,  name: '치즈',          radius: 21,  score: 25,
      fill: '#F4A15C', stroke: '#B76A28', pattern: 'stripes', patternColor: '#D97D2D',
      emoji: '1f63a', emojiScale: 0.80 },

    { id: 3,  name: '턱시도',        radius: 28,  score: 55,
      fill: '#2E2A28', stroke: '#121010', pattern: 'tuxedo',
      emoji: '1f408-200d-2b1b', emojiScale: 0.78 },

    { id: 4,  name: '삼색이',        radius: 36,  score: 110,
      fill: '#FAF0DA', stroke: '#B79E6E', pattern: 'calico',
      emoji: '1f63c', emojiScale: 0.76 },

    { id: 5,  name: '고등어',        radius: 45,  score: 220,
      fill: '#ABB5C0', stroke: '#6E7985', pattern: 'stripes', patternColor: '#6E7985',
      emoji: '1f638', emojiScale: 0.74 },

    { id: 6,  name: '러시안 블루',   radius: 55,  score: 440,
      fill: '#8A9BA8', stroke: '#556470', pattern: null,
      emoji: '1f63b', emojiScale: 0.72 },

    { id: 7,  name: '스코티시 폴드', radius: 65,  score: 880,
      fill: '#D9B884', stroke: '#9B7742', pattern: null,
      emoji: '1f63d', emojiScale: 0.72 },

    { id: 8,  name: '페르시안',      radius: 77,  score: 1700,
      fill: '#FAF6ED', stroke: '#C9BE9E', pattern: 'fluff',
      emoji: '1f640', emojiScale: 0.68 },

    { id: 9,  name: '메인쿤',        radius: 90,  score: 3500,
      fill: '#8B6B4A', stroke: '#4E3721', pattern: 'stripes', patternColor: '#4E3721',
      emoji: '1f63e', emojiScale: 0.70 },

    { id: 10, name: '사바나',        radius: 111, score: 10000,
      fill: '#E8B559', stroke: '#8E6424', pattern: 'spots', patternColor: '#1F140A',
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
      // 사바나 로제트 — 실제 사바나 품종의 이중층 무늬 재현
      // (어두운 중심 + 황금 후광). 이모지 얼굴 바깥쪽(r*0.55~0.90) 링에만 배치해서
      // 얼굴에 가려지지 않고 가장자리에서 뚜렷하게 보이도록.
      const spots = [
        [ 0.58, -0.60, 0.11],  // 우상
        [ 0.82, -0.10, 0.13],  // 우
        [ 0.68,  0.48, 0.12],  // 우하
        [ 0.05,  0.82, 0.12],  // 하
        [-0.55,  0.65, 0.13],  // 좌하
        [-0.82,  0.08, 0.13],  // 좌
        [-0.55, -0.62, 0.11],  // 좌상
      ];
      for (const [sx, sy, sr] of spots) {
        // 외곽 황금 후광 (로제트)
        ctx.fillStyle = 'rgba(242, 180, 58, 0.55)';
        ctx.beginPath();
        ctx.arc(sx * r, sy * r, sr * r * 1.35, 0, Math.PI * 2);
        ctx.fill();
        // 어두운 중심
        ctx.fillStyle = tier.patternColor;
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
  // 구조: 회전 프레임(바디/패턴/이모지) + 역회전 프레임(그림자/광원/광택)
  // → 고양이는 물리에 따라 굴러가지만 광원은 월드 좌상단 고정, 그림자는 바닥 고정.
  function drawCat(ctx, tierIdx, x, y, angle, radius) {
    const tier = CAT_TIERS[tierIdx];
    const r = radius || tier.radius;

    ctx.save();
    ctx.translate(x, y);
    if (angle) ctx.rotate(angle);

    // 1) 후광 (전설)
    if (tier.aura) {
      const grd = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.7);
      grd.addColorStop(0.0, tier.aura + 'AA');
      grd.addColorStop(0.5, tier.aura + '44');
      grd.addColorStop(1.0, tier.aura + '00');
      ctx.fillStyle = grd;
      ctx.fillRect(-r * 1.7, -r * 1.7, r * 3.4, r * 3.4);
    }

    // 2) 바닥 그림자 — 다층 소프트 (월드 바닥 고정, 역회전)
    ctx.save();
    if (angle) ctx.rotate(-angle);
    ctx.fillStyle = 'rgba(58, 41, 32, 0.10)';
    ctx.beginPath();
    ctx.ellipse(0, r * 1.02, r * 0.98, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(58, 41, 32, 0.22)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.98, r * 0.74, r * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3) fluff는 바디 바깥 털이라 먼저 그림
    if (tier.pattern === 'fluff') drawPattern(ctx, tier, r);

    // 4) 바디 — 레이디얼 그라데이션 (3D 구슬, 광원 좌상단 월드 고정 → 역회전)
    ctx.save();
    if (angle) ctx.rotate(-angle);
    const bodyGrd = ctx.createRadialGradient(
      -r * 0.30, -r * 0.40, r * 0.10,
      0, 0, r * 1.05
    );
    bodyGrd.addColorStop(0.00, lighten(tier.fill, 0.22));
    bodyGrd.addColorStop(0.55, tier.fill);
    bodyGrd.addColorStop(1.00, darken(tier.fill, 0.15));
    ctx.fillStyle = bodyGrd;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 5) 바디 내부 패턴 (고양이 털 — 회전 따라감)
    if (tier.pattern && tier.pattern !== 'fluff') drawPattern(ctx, tier, r);

    // 6) 림 셰이딩 — 안쪽 가장자리 어둡게 (회전 무관, 구형 볼륨감)
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r - 0.5, 0, Math.PI * 2);
    ctx.clip();
    const rimGrd = ctx.createRadialGradient(0, 0, r * 0.65, 0, 0, r);
    rimGrd.addColorStop(0.00, 'rgba(0, 0, 0, 0)');
    rimGrd.addColorStop(0.85, 'rgba(0, 0, 0, 0.06)');
    rimGrd.addColorStop(1.00, 'rgba(0, 0, 0, 0.22)');
    ctx.fillStyle = rimGrd;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();

    // 7) 외곽선
    ctx.strokeStyle = tier.stroke;
    ctx.lineWidth = Math.max(1.5, r * 0.05);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    // 8) 광택 하이라이트 (glossy — 월드 고정, 역회전)
    ctx.save();
    if (angle) ctx.rotate(-angle);
    ctx.beginPath();
    ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
    ctx.clip();
    const specGrd = ctx.createRadialGradient(
      -r * 0.38, -r * 0.42, 0,
      -r * 0.35, -r * 0.40, r * 0.60
    );
    specGrd.addColorStop(0.0, 'rgba(255, 255, 255, 0.55)');
    specGrd.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
    specGrd.addColorStop(1.0, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = specGrd;
    ctx.beginPath();
    ctx.ellipse(-r * 0.38, -r * 0.42, r * 0.48, r * 0.32, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // 작은 포인트 하이라이트
    ctx.fillStyle = 'rgba(255, 255, 255, 0.70)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.46, -r * 0.50, r * 0.11, r * 0.06, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 9) 이모지 얼굴 (회전 따라감 — 고양이 표정은 바디에 붙어 있음)
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
