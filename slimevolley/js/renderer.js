// PixiJS Renderer for Slime Volleyball
class GameRenderer {
    constructor(container) {
        this.container = container;
        this.app = null;
        this.gameContainer = null;
        this.slimeSprites = {};
        this.ballSprite = null;
        this.netSprite = null;
        this.particles = [];
        this.trailPoints = [];
        this.scoreTexts = [null, null];
        this.shakeAmount = 0;
        this.initialized = false;

        // 오브젝트 풀: trail과 particle Graphics 재사용
        this._trailPool = [];
        this._particlePool = [];
        this._msgStyle = null; // showMessage TextStyle 캐시
    }

    async init() {
        this.app = new PIXI.Application();
        await this.app.init({
            width: CONFIG.COURT_WIDTH,
            height: CONFIG.COURT_HEIGHT,
            backgroundColor: CONFIG.SKY_TOP,
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        });
        this.container.appendChild(this.app.canvas);
        // CSS가 max-width/max-height + object-fit: contain으로 반응형 처리
        this.app.canvas.style.width = '';
        this.app.canvas.style.height = '';

        this.gameContainer = new PIXI.Container();
        this.app.stage.addChild(this.gameContainer);

        this.createBackground();
        this.createNet();
        this.createScoreDisplay();
        this.createFpsDisplay();
        this.particleContainer = new PIXI.Container();
        this.gameContainer.addChild(this.particleContainer);
        this.trailContainer = new PIXI.Container();
        this.gameContainer.addChild(this.trailContainer);

        this.initialized = true;
    }

    createBackground() {
        // Sky gradient
        const bg = new PIXI.Graphics();
        bg.rect(0, 0, CONFIG.COURT_WIDTH, CONFIG.GROUND_Y);
        bg.fill(CONFIG.SKY_TOP);
        this.gameContainer.addChild(bg);

        // Stars
        const stars = new PIXI.Graphics();
        for (let i = 0; i < 50; i++) {
            const x = Math.random() * CONFIG.COURT_WIDTH;
            const y = Math.random() * (CONFIG.GROUND_Y - 50);
            const size = Math.random() * 2 + 0.5;
            const alpha = Math.random() * 0.5 + 0.3;
            stars.circle(x, y, size);
            stars.fill({ color: 0xffffff, alpha });
        }
        this.gameContainer.addChild(stars);

        // Ground
        const ground = new PIXI.Graphics();
        ground.rect(0, CONFIG.GROUND_Y, CONFIG.COURT_WIDTH, CONFIG.COURT_HEIGHT - CONFIG.GROUND_Y);
        ground.fill(CONFIG.GROUND_COLOR);
        // Ground line
        ground.rect(0, CONFIG.GROUND_Y, CONFIG.COURT_WIDTH, 3);
        ground.fill(0x4a8a2a);
        // Ground stripes
        for (let x = 0; x < CONFIG.COURT_WIDTH; x += 40) {
            ground.rect(x, CONFIG.GROUND_Y + 3, 20, CONFIG.COURT_HEIGHT - CONFIG.GROUND_Y - 3);
            ground.fill({ color: CONFIG.GROUND_DARK, alpha: 0.3 });
        }
        this.gameContainer.addChild(ground);

        // Court center line (faint)
        const centerLine = new PIXI.Graphics();
        centerLine.rect(CONFIG.NET_X - 0.5, CONFIG.GROUND_Y, 1, CONFIG.COURT_HEIGHT - CONFIG.GROUND_Y);
        centerLine.fill({ color: 0xffffff, alpha: 0.1 });
        this.gameContainer.addChild(centerLine);
    }

    createNet() {
        const netG = new PIXI.Graphics();
        const netTop = CONFIG.GROUND_Y - CONFIG.NET_HEIGHT;

        // Net pole
        netG.rect(CONFIG.NET_X - CONFIG.NET_WIDTH / 2, netTop, CONFIG.NET_WIDTH, CONFIG.NET_HEIGHT);
        netG.fill(CONFIG.NET_COLOR);

        // Net top cap
        netG.roundRect(
            CONFIG.NET_X - CONFIG.NET_TOP_WIDTH / 2,
            netTop - CONFIG.NET_TOP_HEIGHT / 2,
            CONFIG.NET_TOP_WIDTH,
            CONFIG.NET_TOP_HEIGHT,
            4
        );
        netG.fill(0xeeeeee);

        // Net mesh lines
        const meshG = new PIXI.Graphics();
        const meshLeft = CONFIG.NET_X - CONFIG.NET_WIDTH / 2 - 2;
        const meshRight = CONFIG.NET_X + CONFIG.NET_WIDTH / 2 + 2;
        for (let y = netTop + 10; y < CONFIG.GROUND_Y; y += 12) {
            meshG.moveTo(meshLeft, y);
            meshG.lineTo(meshRight, y);
            meshG.stroke({ color: 0x999999, width: 1, alpha: 0.4 });
        }
        this.gameContainer.addChild(netG);
        this.gameContainer.addChild(meshG);
    }

    createFpsDisplay() {
        const style = new PIXI.TextStyle({
            fontFamily: 'Orbitron, monospace',
            fontSize: 11,
            fill: 0xffffff,
        });
        this._fpsText = new PIXI.Text({ text: '', style });
        this._fpsText.x = 6;
        this._fpsText.y = 4;
        this._fpsText.alpha = 0.3;
        this._fpsFrameCount = 0;
        this.gameContainer.addChild(this._fpsText);
    }

    createScoreDisplay() {
        const style = new PIXI.TextStyle({
            fontFamily: 'Orbitron, monospace',
            fontSize: 48,
            fontWeight: 'bold',
            fill: 0xffffff,
            dropShadow: {
                color: 0x000000,
                blur: 4,
                distance: 2,
            },
        });

        this.scoreTexts[0] = new PIXI.Text({ text: '0', style });
        this.scoreTexts[0].anchor.set(0.5);
        this.scoreTexts[0].x = CONFIG.COURT_WIDTH / 4;
        this.scoreTexts[0].y = 40;
        this.scoreTexts[0].alpha = 0.7;
        this.gameContainer.addChild(this.scoreTexts[0]);

        this.scoreTexts[1] = new PIXI.Text({ text: '0', style });
        this.scoreTexts[1].anchor.set(0.5);
        this.scoreTexts[1].x = CONFIG.COURT_WIDTH * 3 / 4;
        this.scoreTexts[1].y = 40;
        this.scoreTexts[1].alpha = 0.7;
        this.gameContainer.addChild(this.scoreTexts[1]);

        // VS text
        const vsStyle = new PIXI.TextStyle({
            fontFamily: 'Orbitron, monospace',
            fontSize: 20,
            fill: 0x666666,
        });
        const vs = new PIXI.Text({ text: 'VS', style: vsStyle });
        vs.anchor.set(0.5);
        vs.x = CONFIG.COURT_WIDTH / 2;
        vs.y = 40;
        this.gameContainer.addChild(vs);
    }

    createSlimeSprite(slime) {
        const container = new PIXI.Container();
        const colors = CONFIG.TEAM_COLORS[slime.team];
        const baseColor = colors[slime.colorIdx || 0];
        const r = CONFIG.SLIME_RADIUS;

        // Shadow
        const shadow = new PIXI.Graphics();
        shadow.ellipse(0, 5, r * 0.8, 6);
        shadow.fill({ color: 0x000000, alpha: 0.3 });
        container.addChild(shadow);
        container._shadow = shadow;

        // Body (slime blob shape using bezier curves)
        const body = new PIXI.Graphics();
        body.moveTo(-r, 0);
        // 왼쪽 곡선 (약간 볼록)
        body.bezierCurveTo(-r, -r * 0.5, -r * 0.85, -r * 0.95, -r * 0.5, -r * 1.05);
        // 상단 곡선 (부드러운 돔)
        body.bezierCurveTo(-r * 0.2, -r * 1.15, r * 0.2, -r * 1.15, r * 0.5, -r * 1.05);
        // 오른쪽 곡선 (약간 볼록)
        body.bezierCurveTo(r * 0.85, -r * 0.95, r, -r * 0.5, r, 0);
        body.lineTo(-r, 0);
        body.closePath();
        body.fill(baseColor);
        // Highlight (젤리 반사광)
        body.moveTo(-r * 0.6, -2);
        body.bezierCurveTo(-r * 0.6, -r * 0.5, -r * 0.4, -r * 0.85, 0, -r * 0.9);
        body.bezierCurveTo(r * 0.3, -r * 0.85, r * 0.5, -r * 0.5, r * 0.5, -2);
        body.lineTo(-r * 0.6, -2);
        body.closePath();
        body.fill({ color: 0xffffff, alpha: 0.18 });
        // 작은 하이라이트 점
        body.circle(-r * 0.25, -r * 0.7, r * 0.12);
        body.fill({ color: 0xffffff, alpha: 0.35 });
        container.addChild(body);

        // Eye
        const eyeContainer = new PIXI.Container();
        const eyeWhite = new PIXI.Graphics();
        eyeWhite.circle(0, 0, 8);
        eyeWhite.fill(CONFIG.SLIME_EYE_COLOR);
        eyeContainer.addChild(eyeWhite);

        const pupil = new PIXI.Graphics();
        pupil.circle(0, 0, 4);
        pupil.fill(CONFIG.SLIME_PUPIL_COLOR);
        eyeContainer.addChild(pupil);
        container._pupil = pupil;

        eyeContainer.x = slime.team === 0 ? 10 : -10;
        eyeContainer.y = -r * 0.45;
        container.addChild(eyeContainer);
        container._eyeContainer = eyeContainer;

        // Nickname label
        const nameStyle = new PIXI.TextStyle({
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 11,
            fill: 0xffffff,
            dropShadow: { color: 0x000000, blur: 2, distance: 1 },
        });
        const nameText = new PIXI.Text({ text: slime.nickname || '', style: nameStyle });
        nameText.anchor.set(0.5);
        nameText.y = -r * 1.25;
        nameText.alpha = 0.8;
        container.addChild(nameText);
        container._nameText = nameText;

        container.x = slime.x;
        container.y = slime.y;
        this.gameContainer.addChild(container);
        this.slimeSprites[slime.id] = container;
    }

    createBallSprite() {
        const container = new PIXI.Container();
        const r = CONFIG.BALL_RADIUS;

        // Shadow
        const shadow = new PIXI.Graphics();
        shadow.ellipse(0, 0, r * 0.7, 4);
        shadow.fill({ color: 0x000000, alpha: 0.3 });
        container.addChild(shadow);
        container._shadow = shadow;

        // Ball body (배구공 - 흰색 베이스)
        const ball = new PIXI.Graphics();
        ball.circle(0, 0, r);
        ball.fill(0xF5F5F0);
        container.addChild(ball);
        container._body = ball;

        // 배구공 패널 라인 (3개의 곡선 스트라이프)
        const lines = new PIXI.Graphics();
        // 세로 중심선
        lines.arc(0, 0, r - 1, -Math.PI * 0.5, Math.PI * 0.5, false);
        lines.stroke({ color: 0x2266AA, width: 1.8, alpha: 0.7 });
        // 왼쪽 곡선
        lines.arc(-r * 0.15, 0, r * 0.85, -Math.PI * 0.4, Math.PI * 0.4, false);
        lines.stroke({ color: 0x2266AA, width: 1.5, alpha: 0.5 });
        // 오른쪽 곡선
        lines.arc(r * 0.15, 0, r * 0.85, Math.PI * 0.6, Math.PI * 1.4, false);
        lines.stroke({ color: 0x2266AA, width: 1.5, alpha: 0.5 });
        // 가로선
        lines.moveTo(-r + 3, 0);
        lines.lineTo(r - 3, 0);
        lines.stroke({ color: 0x2266AA, width: 1.2, alpha: 0.4 });
        container.addChild(lines);
        container._lines = lines;

        // 배구공 컬러 패널 (파랑/노랑)
        const panels = new PIXI.Graphics();
        // 상단 파란 패널
        panels.arc(0, 0, r - 2, -Math.PI * 0.8, -Math.PI * 0.2, false);
        panels.lineTo(0, 0);
        panels.closePath();
        panels.fill({ color: 0x2266CC, alpha: 0.25 });
        // 하단 노란 패널
        panels.arc(0, 0, r - 2, Math.PI * 0.2, Math.PI * 0.8, false);
        panels.lineTo(0, 0);
        panels.closePath();
        panels.fill({ color: 0xFFCC00, alpha: 0.25 });
        container.addChild(panels);

        // 하이라이트 (빛 반사)
        const highlight = new PIXI.Graphics();
        highlight.circle(-r * 0.25, -r * 0.25, r * 0.3);
        highlight.fill({ color: 0xffffff, alpha: 0.45 });
        highlight.circle(-r * 0.15, -r * 0.35, r * 0.12);
        highlight.fill({ color: 0xffffff, alpha: 0.6 });
        container.addChild(highlight);

        this.gameContainer.addChild(container);
        this.ballSprite = container;
    }

    updateSlimes(slimes) {
        for (const slime of slimes) {
            let sprite = this.slimeSprites[slime.id];
            if (!sprite) {
                this.createSlimeSprite(slime);
                sprite = this.slimeSprites[slime.id];
            }

            sprite.x = slime.x;
            sprite.y = slime.y;

            // Squash/stretch
            const jumpFactor = slime.onGround ? 1 : 0.9;
            sprite.scale.x = slime.onGround ? 1 : 1.05;
            sprite.scale.y = jumpFactor;

            // Shadow follows on ground
            if (sprite._shadow) {
                sprite._shadow.y = CONFIG.GROUND_Y - slime.y + 5;
                sprite._shadow.alpha = Math.max(0, 0.3 - (CONFIG.GROUND_Y - slime.y) * 0.002);
            }

            // Eye tracking (look at ball direction)
            if (sprite._pupil && this.ballSprite) {
                const dx = this.ballSprite.x - slime.x;
                const dy = this.ballSprite.y - slime.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                sprite._pupil.x = (dx / dist) * 3;
                sprite._pupil.y = (dy / dist) * 2;
            }
        }
    }

    updateBall(ball) {
        if (!this.ballSprite) {
            this.createBallSprite();
        }

        this.ballSprite.x = ball.x;
        this.ballSprite.y = ball.y;

        // Rotation based on velocity
        if (this.ballSprite._lines) {
            this.ballSprite._lines.rotation += ball.vx * 0.03;
        }

        // Shadow on ground
        if (this.ballSprite._shadow) {
            this.ballSprite._shadow.y = CONFIG.GROUND_Y - ball.y;
            const distToGround = CONFIG.GROUND_Y - ball.y;
            this.ballSprite._shadow.alpha = Math.max(0, 0.3 - distToGround * 0.001);
            const shadowScale = Math.max(0.3, 1 - distToGround * 0.002);
            this.ballSprite._shadow.scale.set(shadowScale);
        }

        // Ball trail
        this.addTrailPoint(ball.x, ball.y, ball.vx, ball.vy);
    }

    _getTrail() {
        if (this._trailPool.length > 0) {
            return this._trailPool.pop();
        }
        const g = new PIXI.Graphics();
        g.circle(0, 0, CONFIG.BALL_RADIUS * 0.6);
        g.fill({ color: 0xCCCCCC, alpha: 0.2 });
        return g;
    }

    _releaseTrail(g) {
        g.visible = false;
        this._trailPool.push(g);
    }

    _getParticle() {
        if (this._particlePool.length > 0) {
            return this._particlePool.pop();
        }
        return new PIXI.Graphics();
    }

    _releaseParticle(g) {
        g.visible = false;
        this._particlePool.push(g);
    }

    addTrailPoint(x, y, vx, vy) {
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed < 3) return;

        const trail = this._getTrail();
        trail.x = x;
        trail.y = y;
        trail.alpha = 0.2;
        trail.scale.set(1);
        trail.visible = true;
        trail._life = 8;
        this.trailContainer.addChild(trail);
        this.trailPoints.push(trail);
    }

    updateTrails() {
        for (let i = this.trailPoints.length - 1; i >= 0; i--) {
            const t = this.trailPoints[i];
            t._life--;
            t.alpha = t._life / 8 * 0.3;
            t.scale.set(t._life / 8);
            if (t._life <= 0) {
                this.trailContainer.removeChild(t);
                this._releaseTrail(t);
                this.trailPoints.splice(i, 1);
            }
        }
    }

    updateScores(scores) {
        if (this.scoreTexts[0]) this.scoreTexts[0].text = String(scores[0]);
        if (this.scoreTexts[1]) this.scoreTexts[1].text = String(scores[1]);
    }

    _spawnParticle(x, y, color, size, vx, vy, life, isRing) {
        const p = this._getParticle();
        p.clear();
        if (isRing) {
            p.circle(0, 0, 8);
            p.stroke({ color: 0xFFFFFF, width: 2, alpha: 0.8 });
        } else {
            p.circle(0, 0, size);
            p.fill(color);
        }
        p.x = x;
        p.y = y;
        p.alpha = 1;
        p.scale.set(1);
        p.visible = true;
        p._vx = vx;
        p._vy = vy;
        p._life = life;
        p._maxLife = life;
        p._isRing = !!isRing;
        this.particleContainer.addChild(p);
        this.particles.push(p);
    }

    spawnHitParticles(x, y, color) {
        const baseColor = color || 0xFFEB3B;

        // 임팩트 링
        this._spawnParticle(x, y, 0, 0, 0, 0, 12, true);

        // 스파크 파티클
        for (let i = 0; i < 6; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 6 + 4;
            this._spawnParticle(x, y, 0xFFFFFF, Math.random() * 2 + 1,
                Math.cos(angle) * speed, Math.sin(angle) * speed - 2,
                8 + Math.random() * 6, false);
        }

        // 컬러 파티클
        for (let i = 0; i < 10; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 3 + 1.5;
            this._spawnParticle(x, y, baseColor, Math.random() * 4 + 1.5,
                Math.cos(angle) * speed, Math.sin(angle) * speed - 2.5,
                18 + Math.random() * 12, false);
        }
    }

    spawnScoreParticles(team) {
        const x = team === 0 ? CONFIG.COURT_WIDTH * 3 / 4 : CONFIG.COURT_WIDTH / 4;
        const colors = CONFIG.TEAM_COLORS[team];
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 6 + 2;
            this._spawnParticle(x, CONFIG.COURT_HEIGHT / 2,
                colors[Math.floor(Math.random() * colors.length)],
                Math.random() * 4 + 2,
                Math.cos(angle) * speed, Math.sin(angle) * speed - 3,
                30 + Math.random() * 20, false);
        }
    }

    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p._life--;

            if (p._isRing) {
                const progress = 1 - p._life / p._maxLife;
                p.scale.set(1 + progress * 3);
                p.alpha = (1 - progress) * 0.8;
            } else {
                p._vx *= 0.95;
                p._vy += 0.15;
                p._vy *= 0.95;
                p.x += p._vx;
                p.y += p._vy;
                p.alpha = p._life / p._maxLife;
                p.scale.set(0.5 + 0.5 * (p._life / p._maxLife));
            }

            if (p._life <= 0) {
                this.particleContainer.removeChild(p);
                this._releaseParticle(p);
                this.particles.splice(i, 1);
            }
        }
    }

    shake(amount) {
        this.shakeAmount = amount;
    }

    updateShake() {
        if (this.shakeAmount > 0.5) {
            this.gameContainer.x = (Math.random() - 0.5) * this.shakeAmount;
            this.gameContainer.y = (Math.random() - 0.5) * this.shakeAmount;
            this.shakeAmount *= 0.85;
        } else {
            this.gameContainer.x = 0;
            this.gameContainer.y = 0;
            this.shakeAmount = 0;
        }
    }

    render(state) {
        if (!this.initialized || !state) return;
        this.updateSlimes(state.slimes);
        this.updateBall(state.ball);
        this.updateScores(state.scores);
        this.updateTrails();
        this.updateParticles();
        this.updateShake();
        this.updateFps();
    }

    updateFps() {
        if (++this._fpsFrameCount >= 30) {
            this._fpsFrameCount = 0;
            this._fpsText.text = `${Math.round(this.app.ticker.FPS)} FPS`;
        }
    }

    showMessage(text, duration) {
        if (!this._msgStyle) {
            this._msgStyle = new PIXI.TextStyle({
                fontFamily: 'Orbitron, monospace',
                fontSize: 36,
                fontWeight: 'bold',
                fill: 0xffffff,
                dropShadow: {
                    color: 0x000000,
                    blur: 6,
                    distance: 3,
                },
            });
        }
        const msg = new PIXI.Text({ text, style: this._msgStyle });
        msg.anchor.set(0.5);
        msg.x = CONFIG.COURT_WIDTH / 2;
        msg.y = CONFIG.COURT_HEIGHT / 2 - 40;
        msg.alpha = 0;
        this.gameContainer.addChild(msg);

        const fadeInMs = 150;
        const stayMs = duration;
        const fadeOutMs = 250;
        const totalMs = fadeInMs + stayMs + fadeOutMs;
        let elapsed = 0;

        const ticker = (t) => {
            elapsed += t.deltaMS;
            if (elapsed <= fadeInMs) {
                const p = elapsed / fadeInMs;
                msg.alpha = p;
                msg.scale.set(0.8 + 0.2 * p);
            } else if (elapsed <= fadeInMs + stayMs) {
                msg.alpha = 1;
            } else if (elapsed <= totalMs) {
                msg.alpha = 1 - (elapsed - fadeInMs - stayMs) / fadeOutMs;
            } else {
                this._removeMessageTicker(ticker, msg);
            }
        };
        this.app.ticker.add(ticker);

        // 활성 메시지 ticker 추적 (게임 종료 시 일괄 정리용)
        if (!this._activeMessages) this._activeMessages = [];
        this._activeMessages.push({ ticker, msg });
    }

    showNotice(text, duration = 2000) {
        if (!this._noticeStyle) {
            this._noticeStyle = new PIXI.TextStyle({
                fontFamily: 'Orbitron, monospace',
                fontSize: 16,
                fontWeight: 'bold',
                fill: 0xffcc00,
                dropShadow: {
                    color: 0x000000,
                    blur: 4,
                    distance: 2,
                },
            });
        }
        const msg = new PIXI.Text({ text, style: this._noticeStyle });
        msg.anchor.set(0.5, 0);
        msg.x = CONFIG.COURT_WIDTH / 2;
        msg.y = 12;
        msg.alpha = 0;
        this.gameContainer.addChild(msg);

        const fadeInMs = 120;
        const stayMs = duration;
        const fadeOutMs = 300;
        const totalMs = fadeInMs + stayMs + fadeOutMs;
        let elapsed = 0;

        const ticker = (t) => {
            elapsed += t.deltaMS;
            if (elapsed <= fadeInMs) {
                msg.alpha = elapsed / fadeInMs;
            } else if (elapsed <= fadeInMs + stayMs) {
                msg.alpha = 1;
            } else if (elapsed <= totalMs) {
                msg.alpha = 1 - (elapsed - fadeInMs - stayMs) / fadeOutMs;
            } else {
                this._removeMessageTicker(ticker, msg);
            }
        };
        this.app.ticker.add(ticker);
        if (!this._activeMessages) this._activeMessages = [];
        this._activeMessages.push({ ticker, msg });
    }

    _removeMessageTicker(ticker, msg) {
        this.app.ticker.remove(ticker);
        if (msg.parent) msg.parent.removeChild(msg);
        msg.destroy();
        if (this._activeMessages) {
            this._activeMessages = this._activeMessages.filter(m => m.ticker !== ticker);
        }
    }

    clearMessages() {
        if (!this._activeMessages) return;
        for (const { ticker, msg } of this._activeMessages) {
            this.app.ticker.remove(ticker);
            if (msg.parent) msg.parent.removeChild(msg);
            msg.destroy();
        }
        this._activeMessages = [];
    }

    clearSlimes() {
        for (const id in this.slimeSprites) {
            this.gameContainer.removeChild(this.slimeSprites[id]);
            this.slimeSprites[id].destroy({ children: true });
        }
        this.slimeSprites = {};
    }

    clearBall() {
        if (this.ballSprite) {
            this.gameContainer.removeChild(this.ballSprite);
            this.ballSprite.destroy({ children: true });
            this.ballSprite = null;
        }
        this.clearTrailsAndParticles();
    }

    clearTrailsAndParticles() {
        // 활성 trail 정리 → 풀로 반환
        for (const t of this.trailPoints) {
            this.trailContainer.removeChild(t);
            this._releaseTrail(t);
        }
        this.trailPoints.length = 0;

        // 활성 particle 정리 → 풀로 반환
        for (const p of this.particles) {
            this.particleContainer.removeChild(p);
            this._releaseParticle(p);
        }
        this.particles.length = 0;

        // 풀 크기 제한 (최대 50개씩)
        while (this._trailPool.length > 50) {
            this._trailPool.pop().destroy();
        }
        while (this._particlePool.length > 50) {
            this._particlePool.pop().destroy();
        }
    }

    destroy() {
        // 풀 정리
        for (const g of this._trailPool) g.destroy();
        for (const g of this._particlePool) g.destroy();
        this._trailPool = [];
        this._particlePool = [];
        if (this.app) {
            this.app.destroy(true);
        }
    }
}
