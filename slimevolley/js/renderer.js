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

    addTrailPoint(x, y, vx, vy) {
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed < 3) return;

        const trail = new PIXI.Graphics();
        trail.circle(0, 0, CONFIG.BALL_RADIUS * 0.6);
        trail.fill({ color: 0xCCCCCC, alpha: 0.2 });
        trail.x = x;
        trail.y = y;
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
                t.destroy();
                this.trailPoints.splice(i, 1);
            }
        }
    }

    updateScores(scores) {
        if (this.scoreTexts[0]) this.scoreTexts[0].text = String(scores[0]);
        if (this.scoreTexts[1]) this.scoreTexts[1].text = String(scores[1]);
    }

    spawnHitParticles(x, y, color) {
        const baseColor = color || 0xFFEB3B;

        // 임팩트 링 (팽창하며 사라지는 원)
        const ring = new PIXI.Graphics();
        ring.circle(0, 0, 8);
        ring.stroke({ color: 0xFFFFFF, width: 2, alpha: 0.8 });
        ring.x = x;
        ring.y = y;
        ring._life = 12;
        ring._maxLife = 12;
        ring._isRing = true;
        this.particleContainer.addChild(ring);
        this.particles.push(ring);

        // 스파크 파티클 (빠르고 밝은)
        for (let i = 0; i < 6; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 6 + 4;
            const p = new PIXI.Graphics();
            p.circle(0, 0, Math.random() * 2 + 1);
            p.fill(0xFFFFFF);
            p.x = x;
            p.y = y;
            p._vx = Math.cos(angle) * speed;
            p._vy = Math.sin(angle) * speed - 2;
            p._life = 8 + Math.random() * 6;
            p._maxLife = p._life;
            this.particleContainer.addChild(p);
            this.particles.push(p);
        }

        // 컬러 파티클 (느리고 큰)
        for (let i = 0; i < 10; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 3 + 1.5;
            const p = new PIXI.Graphics();
            const size = Math.random() * 4 + 1.5;
            p.circle(0, 0, size);
            p.fill(baseColor);
            p.x = x;
            p.y = y;
            p._vx = Math.cos(angle) * speed;
            p._vy = Math.sin(angle) * speed - 2.5;
            p._life = 18 + Math.random() * 12;
            p._maxLife = p._life;
            this.particleContainer.addChild(p);
            this.particles.push(p);
        }
    }

    spawnScoreParticles(team) {
        const x = team === 0 ? CONFIG.COURT_WIDTH * 3 / 4 : CONFIG.COURT_WIDTH / 4;
        const colors = CONFIG.TEAM_COLORS[team];
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 6 + 2;
            const p = new PIXI.Graphics();
            p.circle(0, 0, Math.random() * 4 + 2);
            p.fill(colors[Math.floor(Math.random() * colors.length)]);
            p.x = x;
            p.y = CONFIG.COURT_HEIGHT / 2;
            p._vx = Math.cos(angle) * speed;
            p._vy = Math.sin(angle) * speed - 3;
            p._life = 30 + Math.random() * 20;
            p._maxLife = p._life;
            this.particleContainer.addChild(p);
            this.particles.push(p);
        }
    }

    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p._life--;

            if (p._isRing) {
                // 임팩트 링: 팽창하면서 페이드 아웃
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
                p.destroy();
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
    }

    showMessage(text, duration) {
        const style = new PIXI.TextStyle({
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
        const msg = new PIXI.Text({ text, style });
        msg.anchor.set(0.5);
        msg.x = CONFIG.COURT_WIDTH / 2;
        msg.y = CONFIG.COURT_HEIGHT / 2 - 40;
        msg.alpha = 0;
        this.gameContainer.addChild(msg);

        let timer = 0;
        const fadeIn = 10;
        const stay = duration * 60 / 1000;
        const fadeOut = 15;
        const total = fadeIn + stay + fadeOut;

        const ticker = () => {
            timer++;
            if (timer <= fadeIn) {
                msg.alpha = timer / fadeIn;
                msg.scale.set(0.8 + 0.2 * (timer / fadeIn));
            } else if (timer <= fadeIn + stay) {
                msg.alpha = 1;
            } else if (timer <= total) {
                msg.alpha = 1 - (timer - fadeIn - stay) / fadeOut;
            } else {
                this.app.ticker.remove(ticker);
                this.gameContainer.removeChild(msg);
                msg.destroy();
            }
        };
        this.app.ticker.add(ticker);
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
    }

    destroy() {
        if (this.app) {
            this.app.destroy(true);
        }
    }
}
