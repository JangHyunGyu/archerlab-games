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
        this.sparkSprites = [];
        this.scoreTexts = [null, null];
        this._setText = null;
        this._pingText = null;
        this.shakeAmount = 0;
        this.initialized = false;
        this.imageTextures = {};
        this.usingImageAssets = false;
        this._assetVersion = '20261124-v1';

        // 오브젝트 풀: trail과 particle Graphics 재사용
        this._trailPool = [];
        this._particlePool = [];
        this._sparkPool = [];
        this._msgStyle = null;
        this._noticeStyle = null;
    }

    supportsWebP() {
        if (this._supportsWebP !== undefined) return this._supportsWebP;
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            this._supportsWebP = canvas.toDataURL('image/webp').startsWith('data:image/webp');
        } catch (error) {
            this._supportsWebP = false;
        }
        return this._supportsWebP;
    }

    preferredImageSrc(src) {
        return this.supportsWebP()
            ? src.replace(/\.png(?=$|[?#])/i, '.webp')
            : src;
    }

    _withVersion(src) {
        if (!src || src.includes('?')) return src;
        return `${src}?v=${this._assetVersion}`;
    }

    async init() {
        this.app = new PIXI.Application();
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        await this.app.init({
            width: CONFIG.COURT_WIDTH,
            height: CONFIG.COURT_HEIGHT,
            backgroundColor: CONFIG.SKY_TOP,
            antialias: true,
            resolution: pixelRatio,
            autoDensity: true,
        });
        this.container.appendChild(this.app.canvas);
        this.app.canvas.style.width = '';
        this.app.canvas.style.height = '';

        this.gameContainer = new PIXI.Container();
        this.app.stage.addChild(this.gameContainer);

        await this.loadImageAssets();
        this.createBackground();
        this.createNet();
        this.createScoreDisplay();
        this.createPingDisplay();
        this.particleContainer = new PIXI.Container();
        this.gameContainer.addChild(this.particleContainer);
        this.trailContainer = new PIXI.Container();
        this.gameContainer.addChild(this.trailContainer);

        this.initialized = true;
    }

    async loadImageAssets() {
        const assets = CONFIG.IMAGE_ASSETS;
        if (!assets || !PIXI.Texture) return;
        if (window.location.protocol === 'file:') {
            console.info('[Renderer] file:// detected. Using vector fallback to avoid WebGL local image restrictions.');
            return;
        }

        const entries = [
            ['court', assets.court],
            ['ball', assets.ball],
            ['slimeShadow', assets.slimeShadow],
            ['slimeEye', assets.slimeEye],
            ['slimePupil', assets.slimePupil],
            ['hitSpark', assets.hitSpark],
        ];

        if (Array.isArray(assets.slimes)) {
            for (let team = 0; team < assets.slimes.length; team++) {
                const teamAssets = assets.slimes[team] || [];
                for (let colorIdx = 0; colorIdx < teamAssets.length; colorIdx++) {
                    entries.push([`slime_${team}_${colorIdx}`, teamAssets[colorIdx]]);
                }
            }
        }

        try {
            await Promise.all(entries
                .filter(([, src]) => !!src)
                .map(async ([key, src]) => {
                    this.imageTextures[key] = await this.loadImageTexture(src);
                }));
            this.usingImageAssets = Boolean(
                this.imageTextures.court &&
                this.imageTextures.ball &&
                this.imageTextures.slimeShadow
            );
        } catch (error) {
            console.warn('[Renderer] Image asset load failed. Falling back to vector graphics.', error);
            this.imageTextures = {};
            this.usingImageAssets = false;
        }
    }

    loadImageTexture(src) {
        const versionedSrc = this._withVersion(src);
        const preferredSrc = this.preferredImageSrc(versionedSrc);
        return new Promise((resolve, reject) => {
            const img = document.createElement('img');
            img.decoding = 'async';
            img.onload = () => resolve(PIXI.Texture.from(img));
            img.onerror = () => {
                if (preferredSrc !== versionedSrc) {
                    img.onerror = () => reject(new Error(`Failed to load image asset: ${src}`));
                    img.src = versionedSrc;
                    return;
                }
                reject(new Error(`Failed to load image asset: ${src}`));
            };
            img.src = preferredSrc;
        });
    }

    createBackground() {
        if (this.usingImageAssets && this.imageTextures.court) {
            const court = new PIXI.Sprite(this.imageTextures.court);
            court.x = 0;
            court.y = 0;
            court.width = CONFIG.COURT_WIDTH;
            court.height = CONFIG.COURT_HEIGHT;
            this.gameContainer.addChild(court);
            return;
        }

        const bg = new PIXI.Graphics();
        bg.rect(0, 0, CONFIG.COURT_WIDTH, CONFIG.GROUND_Y);
        bg.fill(0x101734);
        this.gameContainer.addChild(bg);

        const skyBands = new PIXI.Graphics();
        const bands = 20;
        for (let i = 0; i < bands; i++) {
            const t = i / bands;
            const r = Math.round(14 + t * 44);
            const g = Math.round(20 + t * 32);
            const b = Math.round(48 + (1 - t) * 28);
            const color = (r << 16) | (g << 8) | b;
            skyBands.rect(
                0,
                (CONFIG.GROUND_Y / bands) * i,
                CONFIG.COURT_WIDTH,
                CONFIG.GROUND_Y / bands + 1
            );
            skyBands.fill({ color, alpha: 0.7 });
        }
        this.gameContainer.addChild(skyBands);

        const ground = new PIXI.Graphics();
        ground.rect(0, CONFIG.GROUND_Y, CONFIG.COURT_WIDTH, CONFIG.COURT_HEIGHT - CONFIG.GROUND_Y);
        ground.fill(0xd99b43);
        ground.rect(0, CONFIG.GROUND_Y, CONFIG.COURT_WIDTH, 2);
        ground.fill({ color: 0xf7d794, alpha: 0.5 });
        this.gameContainer.addChild(ground);
    }

    createNet() {
        const netTop = CONFIG.GROUND_Y - CONFIG.NET_HEIGHT;
        const netX = CONFIG.NET_X;
        const poleHalf = CONFIG.NET_WIDTH / 2;
        const tapeHeight = 10;
        const tapeY = netTop - tapeHeight * 0.5;
        const meshTop = netTop + tapeHeight * 0.5;
        const meshBottom = CONFIG.GROUND_Y;
        const meshLeft = netX - poleHalf - 3;
        const meshRight = netX + poleHalf + 3;

        const groundShadow = new PIXI.Graphics();
        groundShadow.ellipse(netX, CONFIG.GROUND_Y + 3, 24, 3.5);
        groundShadow.fill({ color: 0x0b101b, alpha: 0.34 });
        this.gameContainer.addChild(groundShadow);

        const meshG = new PIXI.Graphics();
        const meshColor = 0xeef2f7;
        const meshAlpha = 0.48;
        const meshShadowAlpha = 0.2;

        for (let y = meshTop + 4; y < meshBottom; y += 7) {
            meshG.moveTo(meshLeft, y + 1);
            meshG.lineTo(meshRight, y + 1);
            meshG.stroke({ color: 0x0b101b, width: 1, alpha: meshShadowAlpha });
            meshG.moveTo(meshLeft, y);
            meshG.lineTo(meshRight, y);
            meshG.stroke({ color: meshColor, width: 1, alpha: meshAlpha });
        }

        for (let x = meshLeft + 3; x <= meshRight - 3; x += 4) {
            meshG.moveTo(x, meshTop + 4);
            meshG.lineTo(x, meshBottom);
            meshG.stroke({ color: meshColor, width: 1, alpha: meshAlpha * 0.85 });
        }
        this.gameContainer.addChild(meshG);

        const pole = new PIXI.Graphics();
        pole.rect(netX - poleHalf, netTop, CONFIG.NET_WIDTH, CONFIG.NET_HEIGHT);
        pole.fill(0x8e99ad);
        pole.rect(netX - poleHalf + 1, netTop, CONFIG.NET_WIDTH - 2, CONFIG.NET_HEIGHT);
        pole.fill(0xc6d0e0);
        pole.rect(netX - poleHalf + 2, netTop + 2, 1.5, CONFIG.NET_HEIGHT - 4);
        pole.fill({ color: 0xffffff, alpha: 0.6 });
        pole.rect(netX + poleHalf - 2, netTop + 2, 1, CONFIG.NET_HEIGHT - 4);
        pole.fill({ color: 0x101828, alpha: 0.32 });
        this.gameContainer.addChild(pole);

        const tape = new PIXI.Graphics();
        tape.roundRect(
            netX - CONFIG.NET_TOP_WIDTH / 2,
            tapeY + 2,
            CONFIG.NET_TOP_WIDTH,
            tapeHeight,
            3
        );
        tape.fill({ color: 0x0b101b, alpha: 0.28 });
        tape.roundRect(
            netX - CONFIG.NET_TOP_WIDTH / 2,
            tapeY,
            CONFIG.NET_TOP_WIDTH,
            tapeHeight,
            3
        );
        tape.fill(0xf8fafc);
        tape.roundRect(
            netX - CONFIG.NET_TOP_WIDTH / 2 + 1,
            tapeY + 1,
            CONFIG.NET_TOP_WIDTH - 2,
            2,
            1.5
        );
        tape.fill({ color: 0xffffff, alpha: 0.95 });
        this.gameContainer.addChild(tape);
    }

    createPingDisplay() {
        const style = new PIXI.TextStyle({
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            fontWeight: '500',
            fill: 0xcbd5e1,
            dropShadow: { color: 0x000000, blur: 3, distance: 1, alpha: 0.7 },
        });
        this._pingText = new PIXI.Text({ text: '', style });
        this._pingText.x = 12;
        this._pingText.y = 10;
        this._pingText.alpha = 0.72;
        this._pingText.visible = false;
        this.gameContainer.addChild(this._pingText);
    }

    setNetworkPing(ms) {
        if (!this._pingText) return;
        if (!Number.isFinite(ms) || ms <= 0) {
            this._pingText.visible = false;
            return;
        }
        this._pingText.visible = true;
        this._pingText.text = `${Math.round(ms)}ms`;
    }

    createScoreDisplay() {
        const makeScoreStyle = (tint) => new PIXI.TextStyle({
            fontFamily: 'Space Grotesk, Pretendard, sans-serif',
            fontSize: 48,
            fontWeight: '700',
            letterSpacing: -1.5,
            fill: tint,
            dropShadow: {
                color: 0x050914,
                blur: 8,
                distance: 2,
                alpha: 0.65,
            },
        });

        this.scoreTexts[0] = new PIXI.Text({ text: '0', style: makeScoreStyle(0xe8f3ff) });
        this.scoreTexts[0].anchor.set(0.5);
        this.scoreTexts[0].x = CONFIG.COURT_WIDTH / 4;
        this.scoreTexts[0].y = 40;
        this.scoreTexts[0].alpha = 0.92;
        this.gameContainer.addChild(this.scoreTexts[0]);

        this.scoreTexts[1] = new PIXI.Text({ text: '0', style: makeScoreStyle(0xffe9eb) });
        this.scoreTexts[1].anchor.set(0.5);
        this.scoreTexts[1].x = CONFIG.COURT_WIDTH * 3 / 4;
        this.scoreTexts[1].y = 40;
        this.scoreTexts[1].alpha = 0.92;
        this.gameContainer.addChild(this.scoreTexts[1]);

        const sepStyle = new PIXI.TextStyle({
            fontFamily: 'Space Grotesk, Pretendard, sans-serif',
            fontSize: 18,
            fontWeight: '600',
            fill: 0x94a3b8,
        });
        const sep = new PIXI.Text({ text: ':', style: sepStyle });
        sep.anchor.set(0.5);
        sep.x = CONFIG.COURT_WIDTH / 2;
        sep.y = 38;
        sep.alpha = 0.65;
        this.gameContainer.addChild(sep);

        const setStyle = new PIXI.TextStyle({
            fontFamily: 'Space Grotesk, Pretendard, sans-serif',
            fontSize: 12,
            fontWeight: '600',
            fill: 0xe2e8f0,
            dropShadow: { color: 0x050914, blur: 4, distance: 1, alpha: 0.7 },
        });
        this._setText = new PIXI.Text({ text: '', style: setStyle });
        this._setText.anchor.set(0.5);
        this._setText.x = CONFIG.COURT_WIDTH / 2;
        this._setText.y = 64;
        this._setText.alpha = 0.85;
        this._setText.visible = false;
        this.gameContainer.addChild(this._setText);
    }

    updateSets(setsWon, totalSets, currentSet) {
        if (!this._setText) return;
        if (!totalSets || totalSets <= 1 || !setsWon) {
            this._setText.visible = false;
            return;
        }
        const i18n = window.SlimeVolleyI18n;
        const tpl = (i18n && i18n.t('game.setBadge') !== 'game.setBadge')
            ? i18n.t('game.setBadge')
            : 'Set {n} ({a}-{b})';
        const setNum = (currentSet || 0) + 1;
        this._setText.text = tpl
            .replace('{n}', String(setNum))
            .replace('{a}', String(setsWon[0] || 0))
            .replace('{b}', String(setsWon[1] || 0));
        this._setText.visible = true;
    }

    createSlimeSpriteFromAssets(slime) {
        const container = new PIXI.Container();
        const r = CONFIG.SLIME_RADIUS;
        const colorIdx = slime.colorIdx || 0;
        const bodyTexture = this.imageTextures[`slime_${slime.team}_${colorIdx}`] ||
            this.imageTextures[`slime_${slime.team}_0`];

        if (!bodyTexture) return false;

        const shadow = new PIXI.Sprite(this.imageTextures.slimeShadow);
        shadow.anchor.set(0.5);
        shadow.x = 0;
        shadow.y = 4;
        shadow.width = r * 2.4;
        shadow.height = 18;
        shadow.alpha = 0.44;
        container.addChild(shadow);
        container._shadow = shadow;

        const visualWrap = new PIXI.Container();
        container.addChild(visualWrap);
        container._visualWrap = visualWrap;

        const body = new PIXI.Sprite(bodyTexture);
        body.anchor.set(0.5, 1);
        body.x = 0;
        body.y = 2;
        body.width = r * 2.86;
        body.height = r * 2.54;
        visualWrap.addChild(body);
        container._bodySprite = body;

        if (!CONFIG.IMAGE_ASSETS.slimesIncludeEyes && this.imageTextures.slimeEye && this.imageTextures.slimePupil) {
            const eyeContainer = new PIXI.Container();
            const eye = new PIXI.Sprite(this.imageTextures.slimeEye);
            eye.anchor.set(0.5);
            eye.width = 18;
            eye.height = 18;
            eyeContainer.addChild(eye);

            const pupil = new PIXI.Sprite(this.imageTextures.slimePupil);
            pupil.anchor.set(0.5);
            pupil.width = 9;
            pupil.height = 9;
            eyeContainer.addChild(pupil);
            container._pupil = pupil;

            eyeContainer.x = slime.team === 0 ? 18 : -18;
            eyeContainer.y = -r * 0.98;
            visualWrap.addChild(eyeContainer);
            container._eyeContainer = eyeContainer;
        }

        const nameStyle = new PIXI.TextStyle({
            fontFamily: 'Space Grotesk, Pretendard, sans-serif',
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: 0.2,
            fill: 0xffffff,
            dropShadow: { color: 0x000000, blur: 4, distance: 1, alpha: 0.85 },
        });
        const nameText = new PIXI.Text({ text: slime.nickname || '', style: nameStyle });
        nameText.anchor.set(0.5);
        nameText.y = -r * 2.05;
        nameText.alpha = 0.88;
        container.addChild(nameText);
        container._nameText = nameText;

        container._squash = 0;
        container._squashVel = 0;
        container._wasOnGround = !!slime.onGround;
        container.x = slime.x;
        container.y = slime.y;
        this.gameContainer.addChild(container);
        this.slimeSprites[slime.id] = container;
        return true;
    }

    createSlimeSprite(slime) {
        if (this.usingImageAssets && this.createSlimeSpriteFromAssets(slime)) return;

        const container = new PIXI.Container();
        const colors = CONFIG.TEAM_COLORS[slime.team];
        const baseColor = colors[slime.colorIdx || 0];
        const r = CONFIG.SLIME_RADIUS;

        const shadow = new PIXI.Graphics();
        shadow.ellipse(0, 4, r * 1.15, 7);
        shadow.fill({ color: 0x0a0e18, alpha: 0.38 });
        container.addChild(shadow);
        container._shadow = shadow;

        const visualWrap = new PIXI.Container();
        container.addChild(visualWrap);
        container._visualWrap = visualWrap;

        const body = new PIXI.Graphics();
        body.moveTo(-r * 1.25, 0);
        body.bezierCurveTo(-r * 1.25, -r * 0.9, -r * 0.6, -r * 1.65, 0, -r * 1.65);
        body.bezierCurveTo(r * 0.6, -r * 1.65, r * 1.25, -r * 0.9, r * 1.25, 0);
        body.closePath();
        body.fill(baseColor);
        visualWrap.addChild(body);

        const eyeContainer = new PIXI.Container();
        const eyeWhite = new PIXI.Graphics();
        eyeWhite.circle(0, 0, 9);
        eyeWhite.fill(CONFIG.SLIME_EYE_COLOR);
        eyeContainer.addChild(eyeWhite);

        const pupil = new PIXI.Graphics();
        pupil.circle(0, 0, 4.5);
        pupil.fill(CONFIG.SLIME_PUPIL_COLOR);
        eyeContainer.addChild(pupil);
        container._pupil = pupil;

        eyeContainer.x = slime.team === 0 ? 18 : -18;
        eyeContainer.y = -r * 0.98;
        visualWrap.addChild(eyeContainer);

        const nameStyle = new PIXI.TextStyle({
            fontFamily: 'Space Grotesk, Pretendard, sans-serif',
            fontSize: 11,
            fontWeight: '600',
            fill: 0xffffff,
            dropShadow: { color: 0x000000, blur: 4, distance: 1, alpha: 0.85 },
        });
        const nameText = new PIXI.Text({ text: slime.nickname || '', style: nameStyle });
        nameText.anchor.set(0.5);
        nameText.y = -r * 2.05;
        nameText.alpha = 0.88;
        container.addChild(nameText);

        container._squash = 0;
        container._squashVel = 0;
        container._wasOnGround = !!slime.onGround;
        container.x = slime.x;
        container.y = slime.y;
        this.gameContainer.addChild(container);
        this.slimeSprites[slime.id] = container;
    }

    triggerSlimeBounce(slimeId, impulse = -0.18) {
        const sprite = this.slimeSprites[slimeId];
        if (!sprite) return;
        sprite._squashVel = impulse;
    }

    createBallSpriteFromAssets() {
        if (!this.imageTextures.ball || !this.imageTextures.slimeShadow) return false;

        const container = new PIXI.Container();
        const r = CONFIG.BALL_RADIUS;

        const shadow = new PIXI.Sprite(this.imageTextures.slimeShadow);
        shadow.anchor.set(0.5);
        shadow.width = r * 2.0;
        shadow.height = 12;
        shadow.alpha = 0.38;
        container.addChild(shadow);
        container._shadow = shadow;

        const ball = new PIXI.Sprite(this.imageTextures.ball);
        ball.anchor.set(0.5);
        ball.width = r * 2.17;
        ball.height = r * 2.17;
        container.addChild(ball);
        container._spinSprite = ball;

        this.gameContainer.addChild(container);
        this.ballSprite = container;
        return true;
    }

    createBallSprite() {
        if (this.usingImageAssets && this.createBallSpriteFromAssets()) return;

        const container = new PIXI.Container();
        const r = CONFIG.BALL_RADIUS;

        const shadow = new PIXI.Graphics();
        shadow.ellipse(0, 0, r * 0.85, 5);
        shadow.fill({ color: 0x0a0e18, alpha: 0.32 });
        container.addChild(shadow);
        container._shadow = shadow;

        const ball = new PIXI.Graphics();
        ball.circle(0, 0, r);
        ball.fill(0xf5f5f0);
        container.addChild(ball);
        container._spinSprite = ball;

        this.gameContainer.addChild(container);
        this.ballSprite = container;
    }

    updateSlimes(slimes, dtScale = 1) {
        for (const slime of slimes) {
            let sprite = this.slimeSprites[slime.id];
            if (!sprite) {
                this.createSlimeSprite(slime);
                sprite = this.slimeSprites[slime.id];
            }

            sprite.x = slime.x;
            sprite.y = slime.y;

            const onGround = !!slime.onGround;
            if (sprite._wasOnGround && !onGround) {
                // Jump launch stretch
                sprite._squashVel = 0.08;
            } else if (!sprite._wasOnGround && onGround) {
                // Landing squash
                sprite._squashVel = -0.11;
            }
            sprite._wasOnGround = onGround;

            // Spring-damper squash & stretch
            const k = 0.22 * dtScale;
            const damp = Math.pow(0.76, dtScale);
            sprite._squashVel = (sprite._squashVel - sprite._squash * k) * damp;
            sprite._squash = Math.max(-0.24, Math.min(0.24, sprite._squash + sprite._squashVel * dtScale));

            const scaleY = Math.max(0.78, 1 + sprite._squash);
            const scaleX = 1 / Math.sqrt(scaleY);
            if (sprite._visualWrap) {
                sprite._visualWrap.scale.set(scaleX, scaleY);
            }

            if (sprite._shadow) {
                const height = Math.max(0, CONFIG.GROUND_Y - slime.y);
                sprite._shadow.y = height + 4;
                sprite._shadow.alpha = Math.max(0.08, 0.44 - height * 0.0022);
                const shScale = Math.max(0.55, 1 - height * 0.0025);
                sprite._shadow.scale.set(shScale, shScale);
            }

            if (sprite._pupil && this.ballSprite) {
                const eyeWorldX = slime.x + (sprite._eyeContainer ? sprite._eyeContainer.x : 0);
                const eyeWorldY = slime.y + (sprite._eyeContainer ? sprite._eyeContainer.y : -CONFIG.SLIME_RADIUS);
                const dx = this.ballSprite.x - eyeWorldX;
                const dy = this.ballSprite.y - eyeWorldY;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const maxOffset = 3.6;
                sprite._pupil.x = (dx / dist) * maxOffset;
                sprite._pupil.y = (dy / dist) * maxOffset * 0.85;
            }
        }
    }

    updateBall(ball, dtScale = 1) {
        if (!this.ballSprite) {
            this.createBallSprite();
        }

        this.ballSprite.x = ball.x;
        this.ballSprite.y = ball.y;

        if (this.ballSprite._spinSprite) {
            this.ballSprite._spinSprite.rotation += ball.vx * 0.03 * dtScale;
        }

        if (this.ballSprite._shadow) {
            const distToGround = Math.max(0, CONFIG.GROUND_Y - ball.y);
            this.ballSprite._shadow.y = distToGround + 2;
            this.ballSprite._shadow.alpha = Math.max(0.06, 0.36 - distToGround * 0.001);
            const shadowScale = Math.max(0.32, 1 - distToGround * 0.002);
            this.ballSprite._shadow.scale.set(shadowScale);
        }

        this.addTrailPoint(ball.x, ball.y, ball.vx, ball.vy);
    }

    _getTrail() {
        if (this._trailPool.length > 0) {
            return this._trailPool.pop();
        }
        const g = new PIXI.Graphics();
        g.circle(0, 0, CONFIG.BALL_RADIUS * 0.55);
        g.fill({ color: 0xe2e8f0, alpha: 0.16 });
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

    _getSpark() {
        if (this._sparkPool.length > 0) {
            return this._sparkPool.pop();
        }
        if (!this.imageTextures.hitSpark) return null;
        const sprite = new PIXI.Sprite(this.imageTextures.hitSpark);
        sprite.anchor.set(0.5);
        sprite.blendMode = 'add';
        return sprite;
    }

    _releaseSpark(sprite) {
        sprite.visible = false;
        this._sparkPool.push(sprite);
    }

    _spawnSpark(x, y) {
        if (!this.usingImageAssets || !this.imageTextures.hitSpark) return;
        const spark = this._getSpark();
        if (!spark) return;
        spark.x = x;
        spark.y = y;
        spark.rotation = Math.random() * Math.PI;
        spark.scale.set(0.38);
        spark.alpha = 0.85;
        spark.visible = true;
        spark._life = 11;
        spark._maxLife = 11;
        spark._rotSpeed = (Math.random() - 0.5) * 0.14;
        this.particleContainer.addChild(spark);
        this.sparkSprites.push(spark);
    }

    addTrailPoint(x, y, vx, vy) {
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed < 3.4) return;

        const trail = this._getTrail();
        trail.x = x;
        trail.y = y;
        trail.alpha = 0.16;
        trail.scale.set(1);
        trail.visible = true;
        trail._life = 8;
        this.trailContainer.addChild(trail);
        this.trailPoints.push(trail);
    }

    updateTrails(dtScale = 1) {
        for (let i = this.trailPoints.length - 1; i >= 0; i--) {
            const t = this.trailPoints[i];
            t._life -= dtScale;
            const ratio = Math.max(0, t._life / 8);
            t.alpha = ratio * 0.22;
            t.scale.set(ratio);
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
            p.stroke({ color: 0xffffff, width: 2, alpha: 0.8 });
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
        const baseColor = color || 0xffeb3b;
        this._spawnSpark(x, y);
        this._spawnParticle(x, y, 0, 0, 0, 0, 12, true);

        for (let i = 0; i < 6; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 5 + 3;
            this._spawnParticle(x, y, 0xffffff, Math.random() * 2 + 1,
                Math.cos(angle) * speed, Math.sin(angle) * speed - 1.5,
                8 + Math.random() * 6, false);
        }

        for (let i = 0; i < 8; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 3 + 1.5;
            this._spawnParticle(x, y, baseColor, Math.random() * 3.5 + 1.5,
                Math.cos(angle) * speed, Math.sin(angle) * speed - 2,
                16 + Math.random() * 10, false);
        }
    }

    spawnScoreParticles(team) {
        const x = team === 0 ? CONFIG.COURT_WIDTH * 3 / 4 : CONFIG.COURT_WIDTH / 4;
        const colors = CONFIG.TEAM_COLORS[team];
        for (let i = 0; i < 18; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 6 + 2;
            this._spawnParticle(x, CONFIG.COURT_HEIGHT / 2,
                colors[Math.floor(Math.random() * colors.length)],
                Math.random() * 4 + 2,
                Math.cos(angle) * speed, Math.sin(angle) * speed - 3,
                28 + Math.random() * 18, false);
        }
    }

    updateSparks(dtScale = 1) {
        for (let i = this.sparkSprites.length - 1; i >= 0; i--) {
            const spark = this.sparkSprites[i];
            spark._life -= dtScale;
            const progress = 1 - Math.max(0, spark._life) / spark._maxLife;
            spark.alpha = Math.max(0, 1 - progress);
            spark.rotation += spark._rotSpeed * dtScale;
            spark.scale.set(0.38 + progress * 0.72);
            if (spark._life <= 0) {
                this.particleContainer.removeChild(spark);
                this._releaseSpark(spark);
                this.sparkSprites.splice(i, 1);
            }
        }
    }

    updateParticles(dtScale = 1) {
        const drag = Math.pow(0.95, dtScale);
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p._life -= dtScale;

            if (p._isRing) {
                const progress = 1 - Math.max(0, p._life) / p._maxLife;
                p.scale.set(1 + progress * 3);
                p.alpha = (1 - progress) * 0.8;
            } else {
                p._vx *= drag;
                p._vy += 0.15 * dtScale;
                p._vy *= drag;
                p.x += p._vx * dtScale;
                p.y += p._vy * dtScale;
                const ratio = Math.max(0, p._life / p._maxLife);
                p.alpha = ratio;
                p.scale.set(0.5 + 0.5 * ratio);
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

    updateShake(dtScale = 1) {
        if (this.shakeAmount > 0.5) {
            this.gameContainer.x = (Math.random() - 0.5) * this.shakeAmount;
            this.gameContainer.y = (Math.random() - 0.5) * this.shakeAmount;
            this.shakeAmount *= Math.pow(0.85, dtScale);
        } else {
            this.gameContainer.x = 0;
            this.gameContainer.y = 0;
            this.shakeAmount = 0;
        }
    }

    render(state) {
        if (!this.initialized || !state) return;
        const rawMs = this.app && this.app.ticker ? this.app.ticker.deltaMS : 16.667;
        const dtScale = Math.min(2.5, Math.max(0.25, rawMs / 16.667));
        this.updateSlimes(state.slimes, dtScale);
        this.updateBall(state.ball, dtScale);
        this.updateScores(state.scores);
        this.updateSets(state.setsWon, state.totalSets, state.currentSet);
        this.updateTrails(dtScale);
        this.updateParticles(dtScale);
        this.updateSparks(dtScale);
        this.updateShake(dtScale);
    }

    showMessage(text, duration) {
        if (!this._msgStyle) {
            this._msgStyle = new PIXI.TextStyle({
                fontFamily: 'Space Grotesk, Pretendard, sans-serif',
                fontSize: 38,
                fontWeight: '700',
                letterSpacing: -0.5,
                fill: 0xffffff,
                dropShadow: {
                    color: 0x050914,
                    blur: 10,
                    distance: 3,
                    alpha: 0.75,
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

        if (!this._activeMessages) this._activeMessages = [];
        this._activeMessages.push({ ticker, msg });
    }

    showNotice(text, duration = 2000) {
        if (!this._noticeStyle) {
            this._noticeStyle = new PIXI.TextStyle({
                fontFamily: 'Space Grotesk, Pretendard, sans-serif',
                fontSize: 14,
                fontWeight: '600',
                fill: 0xf5b942,
                dropShadow: {
                    color: 0x050914,
                    blur: 6,
                    distance: 2,
                    alpha: 0.75,
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
        for (const t of this.trailPoints) {
            this.trailContainer.removeChild(t);
            this._releaseTrail(t);
        }
        this.trailPoints.length = 0;

        for (const p of this.particles) {
            this.particleContainer.removeChild(p);
            this._releaseParticle(p);
        }
        this.particles.length = 0;

        for (const s of this.sparkSprites) {
            this.particleContainer.removeChild(s);
            this._releaseSpark(s);
        }
        this.sparkSprites.length = 0;

        while (this._trailPool.length > 50) {
            this._trailPool.pop().destroy();
        }
        while (this._particlePool.length > 50) {
            this._particlePool.pop().destroy();
        }
        while (this._sparkPool.length > 20) {
            this._sparkPool.pop().destroy();
        }
    }

    destroy() {
        this.clearMessages();
        for (const g of this._trailPool) g.destroy();
        for (const g of this._particlePool) g.destroy();
        for (const s of this._sparkPool) s.destroy();
        this._trailPool = [];
        this._particlePool = [];
        this._sparkPool = [];
        if (this.app) {
            this.app.destroy(true);
        }
        this.initialized = false;
    }
}
