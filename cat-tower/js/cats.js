// 고양이 타워 - 진화 테이블 + 캔버스 고양이 렌더러
// 물리 충돌체는 원형으로 유지하고, 화면에는 귀/몸통/꼬리/발/수염이 있는
// 실제 고양이 실루엣을 그린다. 외부 이미지가 필요 없어 오프라인/느린 네트워크에서도 안정적이다.

(function (global) {
  'use strict';

  const TAU = Math.PI * 2;

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

  function alpha(hex, amount) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${amount})`;
  }

  const CAT_TIERS = [
    { id: 1, name: '새끼 고양이', radius: 15, score: 10,
      fill: '#FFD8B5', stroke: '#D89A6A', pattern: null,
      eye: '#7EAA55', nose: '#D9827C', muzzle: '#FFE8CF', earInner: '#F5AAA2', baby: true },

    { id: 2, name: '치즈', radius: 21, score: 25,
      fill: '#F4A15C', stroke: '#B76A28', pattern: 'stripes', patternColor: '#C86F25',
      eye: '#8AAE43', nose: '#C96C61', muzzle: '#FFE2C2', earInner: '#F4A099' },

    { id: 3, name: '턱시도', radius: 28, score: 55,
      fill: '#2E2A28', stroke: '#121010', pattern: 'tuxedo',
      eye: '#B7D66B', nose: '#D2A0A0', muzzle: '#FFF4E5', earInner: '#5A4743' },

    { id: 4, name: '삼색이', radius: 36, score: 110,
      fill: '#FAF0DA', stroke: '#B79E6E', pattern: 'calico',
      eye: '#89A94F', nose: '#D98981', muzzle: '#FFF2DD', earInner: '#E9A8A1' },

    { id: 5, name: '고등어', radius: 45, score: 220,
      fill: '#ABB5C0', stroke: '#6E7985', pattern: 'stripes', patternColor: '#66717C',
      eye: '#9DBB58', nose: '#B98586', muzzle: '#E8EDF1', earInner: '#C6A2A0' },

    { id: 6, name: '러시안 블루', radius: 55, score: 440,
      fill: '#5E7890', stroke: '#3E5568', pattern: null,
      eye: '#A7C65D', nose: '#9097A6', muzzle: '#B7C6D1', earInner: '#778A9A' },

    { id: 7, name: '스코티시 폴드', radius: 65, score: 880,
      fill: '#D9B884', stroke: '#9B7742', pattern: null, foldedEars: true,
      eye: '#A4B552', nose: '#C77F75', muzzle: '#F5DEC0', earInner: '#D49B91' },

    { id: 8, name: '페르시안', radius: 77, score: 1700,
      fill: '#FAF6ED', stroke: '#C9BE9E', pattern: null, longHairColor: '#E8E2D0', mane: true,
      eye: '#76A98C', nose: '#C7938C', muzzle: '#FFF7ED', earInner: '#E4B7B0' },

    { id: 9, name: '메인쿤', radius: 90, score: 3500,
      fill: '#B8946A', stroke: '#5A3E22',
      pattern: 'stripes', patternColor: '#745238', patternWeight: 0.075, patternCount: 5, patternSpacing: 0.34,
      longHairColor: '#9C7D5A', mane: true,
      eye: '#C0B55C', nose: '#9F6E62', muzzle: '#D7BC91', earInner: '#B98678' },

    { id: 10, name: '사바나', radius: 111, score: 10000,
      fill: '#E8B559', stroke: '#8E6424', pattern: 'spots', patternColor: '#1F140A',
      eye: '#C7CB66', nose: '#6E4432', muzzle: '#F2D39A', earInner: '#C98960',
      aura: '#F2B43A' },
  ];

  function preloadAll() {
    return Promise.resolve();
  }

  function earPath(ctx, side, tier, r) {
    const s = side;
    if (tier.foldedEars) {
      ctx.moveTo(s * r * 0.24, -r * 0.73);
      ctx.quadraticCurveTo(s * r * 0.55, -r * 0.66, s * r * 0.50, -r * 0.43);
      ctx.quadraticCurveTo(s * r * 0.31, -r * 0.48, s * r * 0.24, -r * 0.73);
      ctx.closePath();
      return;
    }
    ctx.moveTo(s * r * 0.20, -r * 0.70);
    ctx.lineTo(s * r * 0.48, -r * 0.96);
    ctx.lineTo(s * r * 0.58, -r * 0.45);
    ctx.closePath();
  }

  function catCorePath(ctx, tier, r) {
    const headY = tier.baby ? -r * 0.35 : -r * 0.39;
    const bodyY = tier.baby ? r * 0.20 : r * 0.18;
    const headRx = tier.baby ? r * 0.62 : r * 0.56;
    const headRy = tier.baby ? r * 0.52 : r * 0.47;

    ctx.beginPath();
    ctx.moveTo(r * 0.72, bodyY);
    ctx.ellipse(0, bodyY, r * 0.72, r * 0.80, 0, 0, TAU);
    ctx.moveTo(headRx, headY);
    ctx.ellipse(0, headY, headRx, headRy, 0, 0, TAU);
    earPath(ctx, -1, tier, r);
    earPath(ctx, 1, tier, r);
  }

  function drawGroundShadow(ctx, r, angle) {
    ctx.save();
    if (angle) ctx.rotate(-angle);
    ctx.fillStyle = 'rgba(58, 41, 32, 0.11)';
    ctx.beginPath();
    ctx.ellipse(0, r * 1.02, r * 0.96, r * 0.24, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(58, 41, 32, 0.18)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.98, r * 0.67, r * 0.15, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawTailPath(ctx, r) {
    ctx.beginPath();
    ctx.moveTo(r * 0.48, r * 0.18);
    ctx.bezierCurveTo(r * 1.06, r * 0.26, r * 0.92, r * 0.85, r * 0.32, r * 0.82);
    ctx.bezierCurveTo(r * 0.02, r * 0.81, -r * 0.04, r * 0.64, r * 0.14, r * 0.55);
  }

  function drawTail(ctx, tier, r) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawTailPath(ctx, r);
    ctx.strokeStyle = darken(tier.stroke, 0.06);
    ctx.lineWidth = Math.max(4, r * 0.26);
    ctx.stroke();
    drawTailPath(ctx, r);
    ctx.strokeStyle = lighten(tier.fill, 0.05);
    ctx.lineWidth = Math.max(2.5, r * 0.18);
    ctx.stroke();

    if (tier.pattern === 'stripes' || tier.pattern === 'spots') {
      ctx.strokeStyle = alpha(tier.patternColor, tier.pattern === 'spots' ? 0.55 : 0.75);
      ctx.lineWidth = Math.max(1, r * 0.035);
      for (let i = 0; i < 4; i++) {
        const x = r * (0.72 - i * 0.18);
        const y = r * (0.35 + i * 0.12);
        ctx.beginPath();
        ctx.moveTo(x + r * 0.08, y - r * 0.12);
        ctx.quadraticCurveTo(x - r * 0.03, y, x - r * 0.12, y + r * 0.12);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawLongHair(ctx, tier, r) {
    if (!tier.longHairColor) return;
    ctx.save();
    ctx.strokeStyle = tier.longHairColor;
    ctx.lineWidth = Math.max(1.5, r * 0.045);
    ctx.lineCap = 'round';
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * TAU;
      const weight = a > Math.PI * 0.05 && a < Math.PI * 0.95 ? 1.15 : 0.92;
      const inR = r * 0.70 * weight;
      const outR = r * (tier.mane ? 0.98 : 0.90) * weight;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inR, Math.sin(a) * inR + r * 0.02);
      ctx.lineTo(Math.cos(a) * outR, Math.sin(a) * outR + r * 0.02);
      ctx.stroke();
    }
    ctx.restore();
  }

  function fillCore(ctx, tier, r) {
    const grd = ctx.createRadialGradient(-r * 0.36, -r * 0.54, r * 0.12, 0, r * 0.05, r * 1.18);
    grd.addColorStop(0.00, lighten(tier.fill, 0.24));
    grd.addColorStop(0.54, tier.fill);
    grd.addColorStop(1.00, darken(tier.fill, 0.16));
    ctx.fillStyle = grd;
    catCorePath(ctx, tier, r);
    ctx.fill();
  }

  function drawBlob(ctx, x, y, rx, ry, color, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot || 0);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(rx, 0);
    ctx.bezierCurveTo(rx * 0.82, -ry * 0.72, rx * 0.20, -ry, -rx * 0.40, -ry * 0.78);
    ctx.bezierCurveTo(-rx * 1.05, -ry * 0.55, -rx * 0.92, ry * 0.18, -rx * 0.52, ry * 0.66);
    ctx.bezierCurveTo(-rx * 0.06, ry * 1.18, rx * 0.82, ry * 0.84, rx, 0);
    ctx.fill();
    ctx.restore();
  }

  function drawForeheadMark(ctx, r, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, r * 0.035);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.28, -r * 0.60);
    ctx.lineTo(-r * 0.16, -r * 0.48);
    ctx.lineTo(0, -r * 0.61);
    ctx.lineTo(r * 0.16, -r * 0.48);
    ctx.lineTo(r * 0.28, -r * 0.60);
    ctx.stroke();
    ctx.restore();
  }

  function drawCoatPattern(ctx, tier, r) {
    ctx.save();
    catCorePath(ctx, tier, r);
    ctx.clip();

    if (tier.pattern === 'stripes') {
      const weight = tier.patternWeight || 0.105;
      const count = tier.patternCount || 5;
      const spacing = tier.patternSpacing || 0.30;
      ctx.strokeStyle = alpha(tier.patternColor, 0.86);
      ctx.lineWidth = Math.max(1.2, r * weight);
      ctx.lineCap = 'round';
      for (let i = 0; i < count; i++) {
        const y = -r * 0.05 + (i - (count - 1) / 2) * r * spacing;
        ctx.beginPath();
        ctx.moveTo(-r * 0.62, y);
        ctx.quadraticCurveTo(0, y - r * 0.14, r * 0.62, y);
        ctx.stroke();
      }
      ctx.lineWidth = Math.max(1, r * 0.04);
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const y = -r * (0.38 - i * 0.15);
          ctx.beginPath();
          ctx.moveTo(side * r * 0.31, y);
          ctx.lineTo(side * r * 0.50, y - r * 0.05);
          ctx.stroke();
        }
      }
      drawForeheadMark(ctx, r, alpha(tier.patternColor, 0.9));
    } else if (tier.pattern === 'tuxedo') {
      ctx.fillStyle = '#FFF7EA';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.43, r * 0.34, r * 0.45, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.23, r * 0.34, r * 0.24, 0, 0, TAU);
      ctx.fill();
    } else if (tier.pattern === 'calico') {
      drawBlob(ctx, -r * 0.32, -r * 0.50, r * 0.30, r * 0.26, '#E7833D', -0.25);
      drawBlob(ctx, r * 0.33, -r * 0.36, r * 0.25, r * 0.22, '#2E2A28', 0.45);
      drawBlob(ctx, -r * 0.40, r * 0.14, r * 0.35, r * 0.46, '#DE7B32', 0.15);
      drawBlob(ctx, r * 0.35, r * 0.36, r * 0.30, r * 0.36, '#332B25', -0.20);
    } else if (tier.pattern === 'spots') {
      const spots = [
        [-0.34, -0.54, 0.11, 0.08, -0.30], [0.35, -0.51, 0.10, 0.08, 0.25],
        [-0.52, -0.10, 0.12, 0.09, 0.10], [0.52, -0.12, 0.12, 0.09, -0.10],
        [-0.42, 0.30, 0.13, 0.09, -0.15], [0.35, 0.30, 0.14, 0.10, 0.18],
        [-0.12, 0.62, 0.12, 0.08, 0.05], [0.16, 0.02, 0.10, 0.07, -0.30],
      ];
      for (const [sx, sy, sw, sh, rot] of spots) {
        ctx.save();
        ctx.translate(sx * r, sy * r);
        ctx.rotate(rot);
        ctx.fillStyle = 'rgba(242, 180, 58, 0.42)';
        ctx.beginPath();
        ctx.ellipse(0, 0, sw * r * 1.45, sh * r * 1.45, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = alpha(tier.patternColor, 0.82);
        ctx.beginPath();
        ctx.ellipse(0, 0, sw * r, sh * r, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      drawForeheadMark(ctx, r, alpha(tier.patternColor, 0.72));
    }
    ctx.restore();
  }

  function drawPaws(ctx, tier, r) {
    ctx.save();
    const pawFill = tier.pattern === 'tuxedo' ? '#FFF7EA' : lighten(tier.fill, 0.16);
    const pawStroke = alpha(tier.stroke, 0.65);
    for (const x of [-r * 0.26, r * 0.26]) {
      ctx.fillStyle = pawFill;
      ctx.strokeStyle = pawStroke;
      ctx.lineWidth = Math.max(0.8, r * 0.025);
      ctx.beginPath();
      ctx.ellipse(x, r * 0.72, r * 0.18, r * 0.13, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = alpha(tier.stroke, 0.36);
      ctx.lineWidth = Math.max(0.7, r * 0.015);
      for (const dx of [-0.06, 0.02, 0.10]) {
        ctx.beginPath();
        ctx.moveTo(x + dx * r, r * 0.66);
        ctx.lineTo(x + (dx + 0.01) * r, r * 0.76);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawEye(ctx, x, y, r, color) {
    const ew = r * 0.115;
    const eh = r * 0.068;
    ctx.save();
    ctx.fillStyle = '#F7F1C7';
    ctx.strokeStyle = 'rgba(30, 20, 14, 0.58)';
    ctx.lineWidth = Math.max(0.8, r * 0.018);
    ctx.beginPath();
    ctx.moveTo(x - ew, y);
    ctx.quadraticCurveTo(x, y - eh, x + ew, y);
    ctx.quadraticCurveTo(x, y + eh, x - ew, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, ew * 0.68, eh * 0.86, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#17110D';
    ctx.beginPath();
    ctx.ellipse(x, y, ew * 0.18, eh * 0.82, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(x - ew * 0.22, y - eh * 0.25, Math.max(0.8, r * 0.022), 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawFace(ctx, tier, r) {
    ctx.save();
    const muzzle = tier.muzzle || lighten(tier.fill, 0.35);
    ctx.fillStyle = alpha(muzzle, 0.96);
    ctx.beginPath();
    ctx.moveTo(r * 0.05, -r * 0.22);
    ctx.ellipse(-r * 0.11, -r * 0.22, r * 0.16, r * 0.13, -0.10, 0, TAU);
    ctx.moveTo(r * 0.27, -r * 0.22);
    ctx.ellipse(r * 0.11, -r * 0.22, r * 0.16, r * 0.13, 0.10, 0, TAU);
    ctx.fill();

    drawEye(ctx, -r * 0.22, -r * 0.41, r, tier.eye);
    drawEye(ctx, r * 0.22, -r * 0.41, r, tier.eye);

    ctx.fillStyle = tier.nose;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.285);
    ctx.lineTo(-r * 0.055, -r * 0.225);
    ctx.lineTo(r * 0.055, -r * 0.225);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(31, 20, 13, 0.58)';
    ctx.lineWidth = Math.max(0.8, r * 0.018);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.225);
    ctx.lineTo(0, -r * 0.16);
    ctx.moveTo(0, -r * 0.16);
    ctx.quadraticCurveTo(-r * 0.07, -r * 0.12, -r * 0.13, -r * 0.15);
    ctx.moveTo(0, -r * 0.16);
    ctx.quadraticCurveTo(r * 0.07, -r * 0.12, r * 0.13, -r * 0.15);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(31, 20, 13, 0.42)';
    ctx.lineWidth = Math.max(0.65, r * 0.012);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const y = -r * (0.22 - i * 0.06);
        ctx.beginPath();
        ctx.moveTo(side * r * 0.13, y);
        ctx.quadraticCurveTo(side * r * 0.35, y - r * (0.05 - i * 0.02), side * r * 0.56, y - r * (0.08 - i * 0.01));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawEarDetails(ctx, tier, r) {
    ctx.save();
    ctx.fillStyle = alpha(tier.earInner || '#E8A09A', 0.82);
    for (const side of [-1, 1]) {
      if (tier.foldedEars) {
        ctx.beginPath();
        ctx.ellipse(side * r * 0.39, -r * 0.57, r * 0.12, r * 0.08, side * 0.35, 0, TAU);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(side * r * 0.33, -r * 0.68);
        ctx.lineTo(side * r * 0.46, -r * 0.83);
        ctx.lineTo(side * r * 0.50, -r * 0.55);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawRimAndGloss(ctx, tier, r) {
    ctx.save();
    catCorePath(ctx, tier, r);
    ctx.clip();
    const rim = ctx.createRadialGradient(r * 0.02, -r * 0.03, r * 0.42, 0, 0, r * 1.05);
    rim.addColorStop(0.00, 'rgba(0, 0, 0, 0)');
    rim.addColorStop(0.82, 'rgba(0, 0, 0, 0.04)');
    rim.addColorStop(1.00, 'rgba(0, 0, 0, 0.18)');
    ctx.fillStyle = rim;
    ctx.fillRect(-r * 1.12, -r * 1.12, r * 2.24, r * 2.24);

    const gloss = ctx.createRadialGradient(-r * 0.35, -r * 0.60, 0, -r * 0.35, -r * 0.60, r * 0.50);
    gloss.addColorStop(0.0, 'rgba(255, 255, 255, 0.42)');
    gloss.addColorStop(0.65, 'rgba(255, 255, 255, 0.08)');
    gloss.addColorStop(1.0, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gloss;
    ctx.beginPath();
    ctx.ellipse(-r * 0.32, -r * 0.58, r * 0.33, r * 0.22, -0.38, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawOutlines(ctx, tier, r) {
    ctx.save();
    ctx.strokeStyle = tier.stroke;
    ctx.lineWidth = Math.max(1.2, r * 0.038);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.ellipse(0, tier.baby ? r * 0.20 : r * 0.18, r * 0.72, r * 0.80, 0, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, tier.baby ? -r * 0.35 : -r * 0.39, tier.baby ? r * 0.62 : r * 0.56, tier.baby ? r * 0.52 : r * 0.47, 0, 0, TAU);
    ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      earPath(ctx, side, tier, r);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCat(ctx, tierIdx, x, y, angle, radius) {
    const tier = CAT_TIERS[tierIdx];
    const r = radius || tier.radius;

    ctx.save();
    ctx.translate(x, y);
    if (angle) ctx.rotate(angle);

    if (tier.aura) {
      const grd = ctx.createRadialGradient(0, 0, r * 0.35, 0, 0, r * 1.65);
      grd.addColorStop(0.0, tier.aura + 'AA');
      grd.addColorStop(0.52, tier.aura + '42');
      grd.addColorStop(1.0, tier.aura + '00');
      ctx.fillStyle = grd;
      ctx.fillRect(-r * 1.7, -r * 1.7, r * 3.4, r * 3.4);
    }

    drawGroundShadow(ctx, r, angle);
    drawTail(ctx, tier, r);
    drawLongHair(ctx, tier, r);
    fillCore(ctx, tier, r);
    drawCoatPattern(ctx, tier, r);
    drawEarDetails(ctx, tier, r);
    drawPaws(ctx, tier, r);
    drawRimAndGloss(ctx, tier, r);
    drawOutlines(ctx, tier, r);
    drawFace(ctx, tier, r);

    ctx.restore();
  }

  global.CatAssets = {
    TIERS: CAT_TIERS,
    preloadAll,
    drawCat,
    drawCatStatic: (ctx, i, x, y, r) => drawCat(ctx, i, x, y, 0, r),
  };
})(window);
