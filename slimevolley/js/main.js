function svt(key, fallback) {
    const value = window.SlimeVolleyI18n && window.SlimeVolleyI18n.t(key);
    return value && value !== key ? value : fallback;
}

function svtf(key, fallback, values = {}) {
    let text = svt(key, fallback);
    for (const [name, value] of Object.entries(values)) {
        text = text.split(`{${name}}`).join(value);
    }
    return text;
}

// Main Game Controller
class SlimeVolleyGame {
    constructor() {
        this.physics = new PhysicsEngine();
        this.renderer = null;
        this.sound = new SoundManager();
        this.network = new NetworkClient('slimevolley');
        this.lobby = null;
        this.botMap = new Map(); // slimeId -> BotAI
        this.running = false;
        this.mode = null; // 'practice' | 'multiplayer'
        this.mySlimeId = 0;
        this.myTeam = 0;
        this.keys = {};
        this.gameLoop = null;
        this.countdown = 0;
        this.countdownTimer = null;
        this.gameOverTimer = null;
        this.relayUrl = 'wss://relay.archerlab.dev';
        this._lastStateArrival = 0;
        this._stateIntervalMs = 1000 / 60;
        this._stateJitterMs = 0;
        this._migrating = false;

        // Client-side prediction & reconciliation state
        this._pendingInputs = [];
        this._pendingInputPool = [];
        this._latestSentInputSeq = 0;
        this._predAccumulator = 0;
        this._predPrev = { x: 0, y: 0 };
        this._predVisualOffsetX = 0;
        this._predVisualOffsetY = 0;
        this._lastLocalHitAt = 0;
        this._lastBallHitSig = -1;
        this._leadBlend = 0;
        this._leadBall = { x: 0, y: 0, vx: 0, vy: 0 };
        this._flushStateSoon = false;
        this._ackScratch = {};

        this.setupInput();
        this.setupNetworkHandlers();
    }

    async init() {
        this.renderer = new GameRenderer(document.getElementById('game-canvas-container'));
        this.lobby = new LobbyManager(this);

        let soundInitStarted = false;
        const initSound = () => {
            if (soundInitStarted) return;
            soundInitStarted = true;
            this.sound.init();
            document.removeEventListener('pointerdown', initSound);
            document.removeEventListener('touchstart', initSound);
            document.removeEventListener('click', initSound);
            document.removeEventListener('keydown', initSound);
        };
        document.addEventListener('pointerdown', initSound, { passive: true });
        document.addEventListener('touchstart', initSound, { passive: true });
        document.addEventListener('click', initSound);
        document.addEventListener('keydown', initSound);

        this.updateSoundButton();
        window.addEventListener('slimevolley:languagechange', () => this.updateSoundButton());
    }

    setupInput() {
        this._onKeyDown = (e) => {
            if (e.repeat) return;
            this.keys[e.code] = true;
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
                if (this.running) e.preventDefault();
            }
            this._sendInputNow();
        };
        this._onKeyUp = (e) => {
            this.keys[e.code] = false;
            this._sendInputNow();
        };
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        this._onInputBlur = () => this.resetInput();
        this._onInputVisibility = () => { if (document.hidden) this.resetInput(); };
        window.addEventListener('blur', this._onInputBlur);
        document.addEventListener('visibilitychange', this._onInputVisibility);

        this.setupMobileControls();
    }

    resetInput() {
        this.keys = {};
        if (this._resetTouchInput) this._resetTouchInput();
        this._sendInputNow();
    }

    setupMobileControls() {
        const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const mobileControls = document.getElementById('mobile-controls');
        const controlsGuide = document.querySelector('.controls-guide');

        if (isTouchDevice) {
            if (mobileControls) mobileControls.style.display = 'block';
            if (controlsGuide) controlsGuide.style.display = 'none';
        }

        const moveZone = document.getElementById('touch-move-zone');
        const jumpZone = document.getElementById('touch-jump-zone');
        const joystickKnob = document.getElementById('joystick-knob');
        if (!moveZone || !jumpZone) return;

        let moveStartX = null;
        let moveTouchId = null;
        let jumpTouchId = null;

        this._resetTouchInput = () => {
            moveStartX = null;
            moveTouchId = null;
            jumpTouchId = null;
            moveZone.classList.remove('active');
            jumpZone.classList.remove('active');
            if (joystickKnob) joystickKnob.style.transform = '';
        };
        const DEAD_ZONE = 3;
        const MAX_DRAG = 15;

        const pickTouch = (e, trackedId) => {
            const list = (e.changedTouches && e.changedTouches.length) ? e.changedTouches : e.touches;
            if (!list || list.length === 0) return null;
            if (trackedId === null || trackedId === undefined) return list[0];
            for (let i = 0; i < list.length; i++) {
                const tid = list[i].identifier !== undefined ? list[i].identifier : 'default';
                if (tid === trackedId) return list[i];
            }
            // Fallback for synthetic single-touch events without identifiers
            if (!e.changedTouches) return list[0];
            return null;
        };

        this._onMoveStart = (e) => {
            e.preventDefault();
            if (moveTouchId !== null) return;
            const touch = pickTouch(e, null);
            if (!touch) return;
            moveTouchId = touch.identifier !== undefined ? touch.identifier : 'default';
            moveStartX = touch.clientX;
            moveZone.classList.add('active');
        };
        this._onMoveMove = (e) => {
            e.preventDefault();
            if (moveStartX === null) return;
            const touch = pickTouch(e, moveTouchId);
            if (!touch) return;
            const dx = touch.clientX - moveStartX;
            this.keys['ArrowLeft'] = dx < -DEAD_ZONE;
            this.keys['ArrowRight'] = dx > DEAD_ZONE;
            this._sendInputNow();
            if (joystickKnob) {
                const clampedDx = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, dx));
                joystickKnob.style.transform = `translateX(${clampedDx}px)`;
            }
        };
        this._onMoveEnd = (e) => {
            e.preventDefault();
            const touch = pickTouch(e, moveTouchId);
            if (!touch && moveTouchId !== null) return;
            moveStartX = null;
            moveTouchId = null;
            this.keys['ArrowLeft'] = false;
            this.keys['ArrowRight'] = false;
            this._sendInputNow();
            moveZone.classList.remove('active');
            if (joystickKnob) joystickKnob.style.transform = '';
        };
        moveZone.addEventListener('touchstart', this._onMoveStart, { passive: false });
        moveZone.addEventListener('touchmove', this._onMoveMove, { passive: false });
        moveZone.addEventListener('touchend', this._onMoveEnd, { passive: false });
        moveZone.addEventListener('touchcancel', this._onMoveEnd, { passive: false });

        this._onJumpStart = (e) => {
            e.preventDefault();
            if (jumpTouchId !== null) return;
            const touch = pickTouch(e, null);
            if (!touch) return;
            jumpTouchId = touch.identifier !== undefined ? touch.identifier : 'default';
            this.keys['ArrowUp'] = true;
            this._sendInputNow();
            jumpZone.classList.add('active');
        };
        this._onJumpEnd = (e) => {
            e.preventDefault();
            const touch = pickTouch(e, jumpTouchId);
            if (!touch && jumpTouchId !== null) return;
            jumpTouchId = null;
            this.keys['ArrowUp'] = false;
            this._sendInputNow();
            jumpZone.classList.remove('active');
        };
        jumpZone.addEventListener('touchstart', this._onJumpStart, { passive: false });
        jumpZone.addEventListener('touchend', this._onJumpEnd, { passive: false });
        jumpZone.addEventListener('touchcancel', this._onJumpEnd, { passive: false });
    }

    getMyInput() {
        if (!this._myInput) this._myInput = { left: false, right: false, jump: false };
        this._myInput.left = this.keys['ArrowLeft'] || this.keys['KeyA'] || false;
        this._myInput.right = this.keys['ArrowRight'] || this.keys['KeyD'] || false;
        this._myInput.jump = this.keys['ArrowUp'] || this.keys['KeyW'] || this.keys['Space'] || false;
        return this._myInput;
    }

    _sendInputNow() {
        if (this.running && this.mode === 'multiplayer' && !this.network.isHost) {
            const seq = this.network.sendInput(this.getMyInput());
            if (seq) this._latestSentInputSeq = seq;
        }
    }

    // === Practice Mode ===
    async startPractice(myTeamSize, botTeamSize, difficulty) {
        this.resetInput();
        this.enterFullscreen();
        this.mode = 'practice';
        this.myTeam = 0;
        this.physics.reset();
        this.physics.configure({ sets: 1, scorePerSet: CONFIG.MAX_SCORE, deuce: true });
        this.physics.initSlimes([myTeamSize, botTeamSize]);

        this.botMap = new Map();
        let botIdx = 0;
        for (const slime of this.physics.slimes) {
            if (slime.team === 1) {
                slime.isBot = true;
                slime.nickname = 'Bot ' + (++botIdx);
                this.botMap.set(slime.id, new BotAI(difficulty));
            } else if (slime.id > 0) {
                slime.isBot = true;
                slime.nickname = 'Bot ' + (++botIdx);
                this.botMap.set(slime.id, new BotAI(difficulty));
            } else {
                slime.nickname = 'Player';
            }
        }

        this.mySlimeId = 0;

        if (!this.renderer.initialized) {
            await this.renderer.init();
        } else {
            this.renderer.clearSlimes();
            this.renderer.clearBall();
        }
        this.renderer.setNetworkPing(0);

        this.lobby.showScreen('game-screen');
        this.startCountdown();
    }

    startCountdown() {
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
        }
        if (this.gameOverTimer) {
            clearTimeout(this.gameOverTimer);
            this.gameOverTimer = null;
        }

        // Position ball cleanly at serve start and render initial frame immediately
        const halfW = CONFIG.COURT_WIDTH / 2;
        this.physics.ball.x = this.physics.servingTeam === 0 ? halfW / 2 : halfW + halfW / 2;
        this.physics.ball.y = 80;
        this.physics.ball.vx = 0;
        this.physics.ball.vy = 0;
        if (this.renderer && this.renderer.initialized) {
            this.renderer.render(this.physics.getState());
        }

        this.countdown = 3;
        this.running = false;
        this.renderer.showMessage('3', 800);
        this.sound.playCountdown(3);

        let count = 3;
        this.countdownTimer = setInterval(() => {
            count--;
            if (count > 0) {
                this.renderer.showMessage(String(count), 800);
                this.sound.playCountdown(count);
            } else if (count === 0) {
                this.renderer.showMessage('GO!', 600);
                this.sound.playCountdown(0);
            } else {
                clearInterval(this.countdownTimer);
                this.countdownTimer = null;
                this.startGameLoop();
            }
        }, 1000);
    }

    // === 비호스트 클라이언트 상태 보간 ===
    _pushRemoteState(state) {
        if (!this._stateBuffer) this._stateBuffer = [];
        if (!this._stateBufferPool) {
            this._stateBufferPool = [];
            for (let i = 0; i < 12; i++) {
                this._stateBufferPool.push({
                    time: 0,
                    ball: { x: 0, y: 0, vx: 0, vy: 0, lastHitSlimeId: -1 },
                    slimes: []
                });
            }
        }

        let entry;
        if (this._stateBuffer.length >= 10) {
            entry = this._stateBuffer.shift();
        } else if (this._stateBufferPool.length > 0) {
            entry = this._stateBufferPool.pop();
        } else {
            entry = { time: 0, ball: { x: 0, y: 0, vx: 0, vy: 0, lastHitSlimeId: -1 }, slimes: [] };
        }

        const arrivalTime = performance.now();
        if (this._lastStateArrival > 0) {
            const interval = Math.min(100, arrivalTime - this._lastStateArrival);
            if (this._stateIntervalMs > 0) {
                const deviation = Math.abs(interval - this._stateIntervalMs);
                this._stateJitterMs += (deviation - this._stateJitterMs) * 0.15;
                this._stateIntervalMs += (interval - this._stateIntervalMs) * 0.15;
            } else {
                this._stateIntervalMs = interval;
            }
        }
        this._lastStateArrival = arrivalTime;
        entry.time = arrivalTime;
        entry.ball.x = state.ball.x;
        entry.ball.y = state.ball.y;
        entry.ball.vx = state.ball.vx || 0;
        entry.ball.vy = state.ball.vy || 0;
        entry.ball.lastHitSlimeId = state.ball.lastHitSlimeId !== undefined ? state.ball.lastHitSlimeId : -1;

        while (entry.slimes.length < state.slimes.length) {
            entry.slimes.push({ x: 0, y: 0, vx: 0, vy: 0 });
        }
        entry.slimes.length = state.slimes.length;
        for (let i = 0; i < state.slimes.length; i++) {
            entry.slimes[i].x = state.slimes[i].x;
            entry.slimes[i].y = state.slimes[i].y;
            entry.slimes[i].vx = state.slimes[i].vx || 0;
            entry.slimes[i].vy = state.slimes[i].vy || 0;
        }

        this._stateBuffer.push(entry);
    }

    _getInterpolatedState(deltaMS = 16.667) {
        const buf = this._stateBuffer;
        const baseState = this.physics.getState();
        if (!buf || buf.length < 2) return baseState;

        const stateInterval = this._stateIntervalMs || (1000 / 60);
        const stateJitter = this._stateJitterMs || 0;
        const adaptiveDelay = Math.max(
            CONFIG.INTERPOLATION_DELAY,
            Math.min(55, stateInterval * 0.65 + stateJitter * 1.8 + 1)
        );
        const now = performance.now();
        const renderTime = now - adaptiveDelay;
        const latest = buf[buf.length - 1];

        if (renderTime >= latest.time) {
            // Bounded velocity extrapolation (up to 24ms) so momentary packet jitter never stalls visuals
            const extrapMs = Math.min(24, renderTime - latest.time);
            const extrapFrames = extrapMs / (1000 / 120);
            baseState.ball.x = latest.ball.x;
            baseState.ball.y = latest.ball.y;
            baseState.ball.vx = latest.ball.vx;
            baseState.ball.vy = latest.ball.vy;
            if (this.physics.phase === 'playing' && extrapFrames > 0) {
                this.physics.stepBallOnly(baseState.ball, Math.floor(extrapFrames), extrapFrames - Math.floor(extrapFrames));
            }
            for (let i = 0; i < baseState.slimes.length; i++) {
                if (latest.slimes[i]) {
                    baseState.slimes[i].x = latest.slimes[i].x + latest.slimes[i].vx * extrapFrames;
                    baseState.slimes[i].y = Math.min(CONFIG.GROUND_Y, latest.slimes[i].y + latest.slimes[i].vy * extrapFrames);
                }
            }
        } else {
            let i0 = 0, i1 = 1;
            for (let i = 1; i < buf.length; i++) {
                if (buf[i].time >= renderTime) {
                    i1 = i;
                    i0 = i - 1;
                    break;
                }
            }
            const s0 = buf[i0];
            const s1 = buf[i1];
            const dt = s1.time - s0.time;
            const t = dt > 0 ? Math.max(0, Math.min(1, (renderTime - s0.time) / dt)) : 1;

            baseState.ball.x = s0.ball.x + (s1.ball.x - s0.ball.x) * t;
            baseState.ball.y = s0.ball.y + (s1.ball.y - s0.ball.y) * t;
            baseState.ball.vx = s0.ball.vx + (s1.ball.vx - s0.ball.vx) * t;
            baseState.ball.vy = s0.ball.vy + (s1.ball.vy - s0.ball.vy) * t;

            for (let i = 0; i < baseState.slimes.length; i++) {
                if (s0.slimes[i] && s1.slimes[i]) {
                    baseState.slimes[i].x = s0.slimes[i].x + (s1.slimes[i].x - s0.slimes[i].x) * t;
                    baseState.slimes[i].y = s0.slimes[i].y + (s1.slimes[i].y - s0.slimes[i].y) * t;
                }
            }
        }

        // Bounded ball half-RTT forward lead during active rallies
        const hitSig = latest.ball.lastHitSlimeId;
        if (hitSig !== this._lastBallHitSig) {
            this._lastBallHitSig = hitSig;
            this._leadBlend = 0.25;
        } else {
            const blendStep = Math.min(1, (deltaMS || 16.667) / 80);
            this._leadBlend = Math.min(1, this._leadBlend + blendStep);
        }

        const rtt = this.network.smoothedRtt || this.network.myPing || 0;
        if (this.physics.phase === 'playing' && rtt > 0) {
            const targetLeadMs = Math.min(20, Math.max(0, (rtt * 0.5) - adaptiveDelay * 0.5));
            const leadMs = targetLeadMs * this._leadBlend;
            if (leadMs > 0.5) {
                const leadFrames = leadMs / (1000 / 120);
                this._leadBall.x = baseState.ball.x;
                this._leadBall.y = baseState.ball.y;
                this._leadBall.vx = baseState.ball.vx;
                this._leadBall.vy = baseState.ball.vy;
                this.physics.stepBallOnly(this._leadBall, Math.floor(leadFrames), leadFrames - Math.floor(leadFrames));
                baseState.ball.x = this._leadBall.x;
                baseState.ball.y = this._leadBall.y;
            }
        }

        return baseState;
    }

    _pushPendingInput(seq, input) {
        let entry;
        if (this._pendingInputs.length >= 120) {
            entry = this._pendingInputs.shift();
        } else if (this._pendingInputPool.length > 0) {
            entry = this._pendingInputPool.pop();
        } else {
            entry = { seq: 0, time: 0, left: false, right: false, jump: false };
        }
        entry.seq = seq;
        entry.time = performance.now();
        entry.left = !!input.left;
        entry.right = !!input.right;
        entry.jump = !!input.jump;
        this._pendingInputs.push(entry);
    }

    _clearPendingInputs() {
        while (this._pendingInputs.length > 0) {
            this._pendingInputPool.push(this._pendingInputs.pop());
        }
    }

    _reconcileMySlime(msg, oldVisualX, oldVisualY) {
        const mySlime = this.physics.slimes.find(s => s.id === this.mySlimeId);
        if (!mySlime) return;

        if (this.physics.phase !== 'playing') {
            this._clearPendingInputs();
            this._predAccumulator = 0;
            this._predPrev.x = mySlime.x;
            this._predPrev.y = mySlime.y;
            this._predVisualOffsetX = 0;
            this._predVisualOffsetY = 0;
            return;
        }

        const ackSeq = (msg.ack && Number.isSafeInteger(msg.ack[this.mySlimeId]))
            ? msg.ack[this.mySlimeId]
            : null;

        if (ackSeq === null) {
            return;
        }

        const rtt = this.network.smoothedRtt || this.network.myPing || 0;
        const ackCutoffTime = rtt > 0 ? performance.now() - Math.min(160, rtt) : Infinity;
        while (this._pendingInputs.length > 0) {
            const head = this._pendingInputs[0];
            if (head.seq < ackSeq || (head.seq === ackSeq && head.time <= ackCutoffTime)) {
                this._pendingInputPool.push(this._pendingInputs.shift());
            } else {
                break;
            }
        }

        for (let i = 0; i < this._pendingInputs.length; i++) {
            const p = this._pendingInputs[i];
            mySlime.input.left = p.left;
            mySlime.input.right = p.right;
            mySlime.input.jump = p.jump;
            this.physics.updateSlime(mySlime);
            this.physics.clampSlimeX(mySlime);
        }

        if (oldVisualX !== undefined && oldVisualY !== undefined) {
            const dx = oldVisualX - mySlime.x;
            const dy = oldVisualY - mySlime.y;
            const err = Math.hypot(dx, dy);
            if (err > 40 || err < 1.0) {
                this._predVisualOffsetX = 0;
                this._predVisualOffsetY = 0;
            } else {
                this._predVisualOffsetX = dx;
                this._predVisualOffsetY = dy;
            }
        }
    }

    startGameLoop() {
        this.running = true;
        this._migrating = false;
        this.physics.phase = 'serving';
        this.physics.freezeTimer = 60;
        this.physicsAccumulator = 0;
        this._stateBuffer = [];
        this._lastStateArrival = 0;
        this._stateIntervalMs = 1000 / 60;
        this._stateJitterMs = 0;

        // Reset prediction state
        this._clearPendingInputs();
        this._latestSentInputSeq = 0;
        this._predAccumulator = 0;
        const mySlimeInit = this.physics.slimes.find(s => s.id === this.mySlimeId);
        this._predPrev = mySlimeInit ? { x: mySlimeInit.x, y: mySlimeInit.y } : { x: 0, y: 0 };
        this._predVisualOffsetX = 0;
        this._predVisualOffsetY = 0;
        this._lastLocalHitAt = 0;
        this._lastBallHitSig = -1;
        this._leadBlend = 0;
        this._flushStateSoon = false;

        this._interpPrev = null;

        if (this.gameLoop) {
            this.renderer.app.ticker.remove(this.gameLoop);
        }

        const FIXED_DT = 1000 / 120; // 120fps 고정 물리 스텝
        this._remotePlayerInputs = new Map();
        this._remoteInputSeqs = new Map();

        this.gameLoop = (ticker) => {
            if (!this.running) return;
            if (this._migrating) {
                this.renderer.render(this.physics.getState());
                return;
            }

            const isNonHost = this.mode === 'multiplayer' && !this.network.isHost;

            if (isNonHost) {
                const myInput = this.getMyInput();
                const sentSeq = this.network.sendInput(myInput);
                if (sentSeq) this._latestSentInputSeq = sentSeq;

                const mySlime = this.physics.slimes.find(s => s.id === this.mySlimeId);
                if (mySlime && this.physics.phase === 'playing') {
                    this._predAccumulator += Math.min(FIXED_DT * 4, ticker.deltaMS || 16.667);
                    while (this._predAccumulator >= FIXED_DT) {
                        this._predPrev.x = mySlime.x;
                        this._predPrev.y = mySlime.y;
                        mySlime.input.left = !!myInput.left;
                        mySlime.input.right = !!myInput.right;
                        mySlime.input.jump = !!myInput.jump;
                        this.physics.updateSlime(mySlime);
                        this.physics.resolveSlimeCollisions();
                        this._pushPendingInput(this._latestSentInputSeq, myInput);
                        this._predAccumulator -= FIXED_DT;
                    }
                    const decay = Math.pow(0.72, Math.min(2.5, (ticker.deltaMS || 16.667) / 16.667));
                    this._predVisualOffsetX = Math.abs(this._predVisualOffsetX) < 0.2 ? 0 : this._predVisualOffsetX * decay;
                    this._predVisualOffsetY = Math.abs(this._predVisualOffsetY) < 0.2 ? 0 : this._predVisualOffsetY * decay;
                } else if (mySlime) {
                    this._predAccumulator = 0;
                    this._predPrev.x = mySlime.x;
                    this._predPrev.y = mySlime.y;
                    this._predVisualOffsetX = 0;
                    this._predVisualOffsetY = 0;
                    this._clearPendingInputs();
                }

                const renderState = this._getInterpolatedState(ticker.deltaMS);
                if (mySlime) {
                    const rsMy = renderState.slimes.find(s => s.id === this.mySlimeId);
                    if (rsMy) {
                        const alpha = this._predAccumulator / FIXED_DT;
                        const interpX = this._predPrev.x + (mySlime.x - this._predPrev.x) * alpha;
                        const interpY = this._predPrev.y + (mySlime.y - this._predPrev.y) * alpha;
                        rsMy.x = interpX + this._predVisualOffsetX;
                        rsMy.y = Math.min(CONFIG.GROUND_Y, interpY + this._predVisualOffsetY);
                        rsMy.onGround = mySlime.onGround;
                    }

                    // Immediate local hit feedback (deduped against host gameEvent)
                    if (this.physics.phase === 'playing') {
                        const collision = this.physics.getBallSlimeCollision(mySlime, renderState.ball);
                        const nowMs = performance.now();
                        if (collision && nowMs - this._lastLocalHitAt > 200) {
                            this._lastLocalHitAt = nowMs;
                            this.sound.playHit(0.7);
                            this.renderer.triggerSlimeBounce(this.mySlimeId, -0.18);
                            this.renderer.spawnHitParticles(
                                renderState.ball.x,
                                renderState.ball.y,
                                CONFIG.TEAM_COLORS[this.myTeam][0]
                            );
                        }
                    }
                }

                this.renderer.render(renderState);
                return;
            }

            // 호스트 또는 연습모드: 120Hz 물리 실행
            this.physicsAccumulator += ticker.deltaMS;
            if (this.physicsAccumulator > FIXED_DT * 4) {
                this.physicsAccumulator = FIXED_DT * 4;
            }

            while (this.physicsAccumulator >= FIXED_DT) {
                this._saveInterpState();
                this.update();
                this.physicsAccumulator -= FIXED_DT;
            }

            const state = this.physics.getState();
            const alpha = this.physicsAccumulator / FIXED_DT;
            if (this._interpPrev) {
                this._applyInterpolation(state, alpha);
            }
            this.renderer.render(state);
        };

        this.renderer.app.ticker.add(this.gameLoop);
    }

    _saveInterpState() {
        if (!this._interpPrev) {
            this._interpPrev = {
                ball: { x: 0, y: 0 },
                slimes: []
            };
        }
        this._interpPrev.ball.x = this.physics.ball.x;
        this._interpPrev.ball.y = this.physics.ball.y;
        for (let i = 0; i < this.physics.slimes.length; i++) {
            if (!this._interpPrev.slimes[i]) {
                this._interpPrev.slimes[i] = { x: 0, y: 0 };
            }
            this._interpPrev.slimes[i].x = this.physics.slimes[i].x;
            this._interpPrev.slimes[i].y = this.physics.slimes[i].y;
        }
    }

    _applyInterpolation(state, alpha) {
        const prev = this._interpPrev;
        if (!prev) return;
        state.ball.x = prev.ball.x + (state.ball.x - prev.ball.x) * alpha;
        state.ball.y = prev.ball.y + (state.ball.y - prev.ball.y) * alpha;
        for (let i = 0; i < state.slimes.length; i++) {
            if (!prev.slimes[i]) continue;
            state.slimes[i].x = prev.slimes[i].x + (state.slimes[i].x - prev.slimes[i].x) * alpha;
            state.slimes[i].y = prev.slimes[i].y + (state.slimes[i].y - prev.slimes[i].y) * alpha;
        }
    }

    _getDelayedHostInput() {
        return this.getMyInput();
    }

    update() {
        const mySlime = this.physics.slimes.find(s => s.id === this.mySlimeId);
        if (mySlime && !mySlime.isBot) {
            mySlime.input = this._getDelayedHostInput();
        }

        if (this.mode === 'multiplayer' && this._remotePlayerInputs) {
            for (const slime of this.physics.slimes) {
                if (slime.id !== this.mySlimeId && !slime.isBot) {
                    const ri = this._remotePlayerInputs.get(slime.id);
                    if (ri) {
                        slime.input = ri;
                    }
                }
            }
        }

        for (const slime of this.physics.slimes) {
            if (slime.isBot) {
                const bot = this.botMap.get(slime.id);
                if (bot) {
                    slime.input = bot.getInput(
                        slime, this.physics.ball, this.physics.slimes, this.physics
                    );
                }
            }
        }

        const result = this.physics.update();
        this.handlePhysicsResult(result);

        // 호스트: 게임 상태를 클라이언트에 전송 (60fps + 입력 변화/임팩트 즉시 플러시)
        if (this.mode === 'multiplayer' && this.network.isHost) {
            if (!this._netSendCounter) this._netSendCounter = 0;
            this._netSendCounter++;
            if (this._flushStateSoon || (result && result.type && result.type !== 'jump')) {
                this._netSendCounter = 2;
                this._flushStateSoon = false;
            }
            if (this._netSendCounter >= 2) {
                this._netSendCounter = 0;
                let ackMap = null;
                if (this._remoteInputSeqs && this._remoteInputSeqs.size > 0) {
                    ackMap = this._ackScratch;
                    for (const key in ackMap) delete ackMap[key];
                    for (const [slotIdx, seqVal] of this._remoteInputSeqs) {
                        ackMap[slotIdx] = seqVal;
                    }
                }
                this.network.sendGameState(this.physics.getState(), ackMap);
            }

            if (result) {
                if (result.wallBounce) {
                    this.network.sendGameEvent({ event: 'wallBounce' });
                }
                if (result.netBounce) {
                    this.network.sendGameEvent({ event: 'netBounce' });
                }
                if (result.type === 'hit') {
                    const intensity = Math.sqrt(
                        this.physics.ball.vx ** 2 + this.physics.ball.vy ** 2
                    ) / CONFIG.BALL_MAX_SPEED;
                    this.network.sendGameEvent({
                        event: 'hit',
                        intensity,
                        x: this.physics.ball.x,
                        y: this.physics.ball.y,
                        color: CONFIG.TEAM_COLORS[result.slime.team][0],
                        slimeId: result.slime.id,
                    });
                } else if (result.type === 'score') {
                    this.network.sendGameEvent({
                        event: 'scored',
                        team: result.team,
                        scores: result.scores,
                    });
                } else if (result.type === 'setWon') {
                    this.network.sendGameEvent({
                        event: 'setWon',
                        setWinner: result.setWinner,
                        setNumber: result.setNumber,
                        setsWon: result.setsWon,
                    });
                } else if (result.type === 'gameOver') {
                    this.network.sendGameEvent({
                        event: 'gameOver',
                        winner: result.winner,
                        setsWon: result.setsWon,
                        setScores: result.setScores,
                        mvp: result.mvp,
                    });
                    this.network.endGame();
                }
            }
        }
    }

    handlePhysicsResult(result) {
        if (!result) return;

        if (result.jumped && result.jumped.length > 0) {
            this.sound.playJump();
        }
        if (result.wallBounce) {
            this.sound.playWallBounce();
        }
        if (result.netBounce) {
            this.sound.playNetBounce();
        }
        if (result.floorBounce) {
            this.sound.playFloorBounce();
        }

        if (result.type === 'jump' || result.type === 'bounce') return;

        if (result.type === 'hit') {
            const intensity = Math.sqrt(
                this.physics.ball.vx ** 2 + this.physics.ball.vy ** 2
            ) / CONFIG.BALL_MAX_SPEED;
            this.sound.playHit(intensity);
            this.renderer.triggerSlimeBounce(result.slime.id, -0.18);
            this.renderer.spawnHitParticles(
                this.physics.ball.x, this.physics.ball.y,
                CONFIG.TEAM_COLORS[result.slime.team][0]
            );
            if (intensity > 0.6) {
                this.renderer.shake(intensity * 6);
            }
        } else if (result.type === 'score') {
            this.sound.playScore(result.team);
            this.renderer.spawnScoreParticles(result.team);
            this.renderer.shake(8);
            this.renderer.showMessage(
                `${result.scores[0]} - ${result.scores[1]}`,
                CONFIG.POINT_FREEZE
            );
        } else if (result.type === 'setWon') {
            this.sound.playScore(result.setWinner);
            this.renderer.shake(10);
            this.renderer.showMessage(
                svtf('game.setScoreBanner', `Set ${result.setNumber}! (${result.setsWon[0]}-${result.setsWon[1]})`, {
                    n: result.setNumber,
                    a: result.setsWon[0],
                    b: result.setsWon[1],
                }),
                1800
            );
        } else if (result.type === 'gameOver') {
            this.running = false;
            const won = result.winner === this.myTeam;
            this.sound.playGameOver(won);
            this.renderer.shake(12);

            if (this.gameOverTimer) clearTimeout(this.gameOverTimer);
            this.gameOverTimer = setTimeout(() => {
                this.gameOverTimer = null;
                this.lobby.showGameOver(
                    result.winner, result.setsWon, this.myTeam, result.setScores, result.mvp
                );
            }, 1500);
        }
    }

    restartGame() {
        if (this.mode === 'practice') {
            const myTeamSize = parseInt(document.getElementById('practice-my-team').value);
            const botTeamSize = parseInt(document.getElementById('practice-bot-team').value);
            const difficulty = document.getElementById('practice-difficulty').value;
            this.startPractice(myTeamSize, botTeamSize, difficulty);
        } else if (this.mode === 'multiplayer') {
            this.backToLobby({ keepConnection: true });
            if (this.network.connected) {
                this.lobby.setHost(this.network.isHost);
                this.lobby.showScreen('room-screen');
            } else {
                this.lobby.showMultiplayerLobby();
            }
        }
    }

    backToLobby(opts) {
        this.resetInput();
        this.running = false;
        this._migrating = false;
        this._hideMigrationOverlay();
        if (this.gameLoop && this.renderer && this.renderer.app) {
            this.renderer.app.ticker.remove(this.gameLoop);
            this.gameLoop = null;
        }
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
        }
        if (this.gameOverTimer) {
            clearTimeout(this.gameOverTimer);
            this.gameOverTimer = null;
        }
        this.sound.stopAll();
        if (this.renderer && this.renderer.initialized) {
            this.renderer.setNetworkPing(0);
            this.renderer.clearMessages();
            this.renderer.clearSlimes();
            this.renderer.clearBall();
        }
        if (this.mode === 'multiplayer' && !(opts && opts.keepConnection)) {
            if (this.network.connected || this.network.roomId) {
                this.network.leaveRoom();
                this.network.disconnect();
            }
        }
    }

    destroy() {
        this.backToLobby({ keepConnection: true });
        if (this._onKeyDown) {
            window.removeEventListener('keydown', this._onKeyDown);
        }
        if (this._onKeyUp) {
            window.removeEventListener('keyup', this._onKeyUp);
        }
        window.removeEventListener('blur', this._onInputBlur);
        document.removeEventListener('visibilitychange', this._onInputVisibility);
        const moveZone = document.getElementById('touch-move-zone');
        const jumpZone = document.getElementById('touch-jump-zone');
        if (moveZone) {
            if (this._onMoveStart) moveZone.removeEventListener('touchstart', this._onMoveStart);
            if (this._onMoveMove) moveZone.removeEventListener('touchmove', this._onMoveMove);
            if (this._onMoveEnd) {
                moveZone.removeEventListener('touchend', this._onMoveEnd);
                moveZone.removeEventListener('touchcancel', this._onMoveEnd);
            }
        }
        if (jumpZone) {
            if (this._onJumpStart) jumpZone.removeEventListener('touchstart', this._onJumpStart);
            if (this._onJumpEnd) {
                jumpZone.removeEventListener('touchend', this._onJumpEnd);
                jumpZone.removeEventListener('touchcancel', this._onJumpEnd);
            }
        }
        this.network.disconnect();
        this.network.clearAllHandlers();
        if (this.renderer) this.renderer.destroy();
        this.sound.destroy();
    }

    // === Host Migration UI ===
    _showMigrationOverlay(title, subtitle) {
        const el = document.getElementById('migration-overlay');
        if (!el) return;
        const t = document.getElementById('mig-title');
        const s = document.getElementById('mig-subtitle');
        if (t && title) t.textContent = title;
        if (s && subtitle) s.textContent = subtitle;
        el.classList.add('active');
    }
    _hideMigrationOverlay() {
        const el = document.getElementById('migration-overlay');
        if (!el) return;
        el.classList.remove('active');
    }

    // === Multiplayer ===
    async becomeHost() {
        this.network.isHost = true;
        this._migrating = true;

        for (const slime of this.physics.slimes) {
            if (slime.isBot && !this.botMap.has(slime.id)) {
                this.botMap.set(slime.id, new BotAI('normal', (this._gameSeed || 12345) + slime.id));
            }
        }

        this.physicsAccumulator = 0;
        this._netSendCounter = 0;
        this._interpPrev = null;
        this._stateBuffer = [];
        this._clearPendingInputs();
        this._predVisualOffsetX = 0;
        this._predVisualOffsetY = 0;
        this._remotePlayerInputs = new Map();
        this._remoteInputSeqs = new Map();

        for (const slime of this.physics.slimes) {
            if (slime.isBot) {
                slime.input = { left: false, right: false, jump: false };
            }
        }

        this._showMigrationOverlay(svt('migration.switching', '새 호스트로 전환 중...'), svt('migration.switchingBody', '게임이 곧 재개됩니다'));

        try {
            await this.network.migrateP2P(this.network.playerId);
            this._migrating = false;
            this._hideMigrationOverlay();
            if (this.renderer) {
                this.renderer.showNotice(svt('migration.youAreHost', '당신이 새 호스트입니다'), 2500);
            }
        } catch (e) {
            console.error('[Migration] Failed to become P2P host:', e);
            this._migrating = false;
            this._hideMigrationOverlay();
            if (this.renderer) {
                this.renderer.showNotice(svt('migration.switchFailed', '호스트 전환 실패'), 2500);
            }
        }
    }

    setupNetworkHandlers() {
        this.network.on('roomCreated', async (msg) => {
            this.lobby.showRoomScreen(msg.roomId, msg.players, true, msg.metadata);
            try {
                await this.network.initP2P(this.network.playerId);
            } catch (e) {
                console.warn('[P2P] Host peer creation failed:', e);
            }
        });

        this.network.on('joined', async (msg) => {
            this.lobby.showRoomScreen(msg.roomId, msg.players, false, msg.metadata);
            const hostPlayer = (msg.players || []).find(p => p.isHost);
            const hostPlayerId = hostPlayer ? hostPlayer.id : null;
            if (!hostPlayerId) {
                console.warn('[P2P] Cannot find host in player list');
                return;
            }
            try {
                await this.network.initP2P(hostPlayerId);
            } catch (e) {
                console.warn('[P2P] Connect to host failed:', e);
            }
        });

        this.network.on('roomState', (msg) => {
            this.lobby.updatePlayerList(msg.players);
            this.lobby.updateRoomMeta(msg.metadata);
        });

        this.network.on('playerJoined', (msg) => {
            this.lobby.updatePlayerList(msg.players);
        });

        this.network.on('playerLeft', async (msg) => {
            this.lobby.updatePlayerList(msg.players);

            if (this.running && this.mode === 'multiplayer') {
                let leftName = null;
                if (msg.slotIndex !== undefined) {
                    const slime = this.physics.slimes.find(s => s.id === msg.slotIndex);
                    if (slime) {
                        leftName = slime.nickname;
                        if (!slime.isBot) {
                            slime.isBot = true;
                            slime.nickname = (slime.nickname || 'Player') + ' (Bot)';
                            const seed = (this._gameSeed || 12345) + slime.id;
                            this.botMap.set(slime.id, new BotAI('normal', seed));
                        }
                    }
                }

                if (msg.newHostId === this.network.playerId && !this.network.isHost) {
                    await this.becomeHost();
                } else if (msg.newHostId && !this.network.isHost && msg.newHostId !== this.network.playerId) {
                    const hostStillSame = this.network.peerjs && this.network.peerjs.isPeerConnected(
                        PeerJSManager.makeHostPeerId(this.network.roomId, msg.newHostId)
                    );
                    if (!hostStillSame) {
                        this._migrating = true;
                        this._showMigrationOverlay(svt('migration.title', '호스트 이전 중...'), svt('migration.reconnecting', '새 호스트에 연결하고 있습니다'));
                        try {
                            await this.network.migrateP2P(msg.newHostId);
                            this._migrating = false;
                            this._hideMigrationOverlay();
                            if (this.renderer) {
                                this.renderer.showNotice(svt('migration.connected', '새 호스트에 연결됨'), 1500);
                            }
                        } catch (e) {
                            console.error('[Migration] Failed to migrate to new host:', e);
                            this._migrating = false;
                            this._hideMigrationOverlay();
                            if (this.renderer) {
                                this.renderer.showNotice(svt('migration.connectFailed', '호스트 연결 실패 — 봇 모드로 진행'), 3000);
                            }
                        }
                    }
                }

                if (leftName && this.renderer) {
                    this.renderer.showNotice(
                        svtf('game.playerLeftBot', `${leftName} left → Bot`, { name: leftName }),
                        2500
                    );
                }
            } else if (this.lobby && this.lobby.currentScreen === 'room-screen') {
                // 대기실 호스트 승계 처리
                if (msg.newHostId === this.network.playerId && !this.network.isHost) {
                    this.network.isHost = true;
                    this.lobby.setHost(true);
                    try {
                        await this.network.migrateP2P(this.network.playerId);
                    } catch (e) {
                        console.warn('[P2P] Lobby host migration failed:', e);
                    }
                } else if (msg.newHostId && !this.network.isHost) {
                    const targetPeer = PeerJSManager.makeHostPeerId(this.network.roomId, msg.newHostId);
                    if (!this.network.peerjs.isPeerConnected(targetPeer)) {
                        try {
                            await this.network.migrateP2P(msg.newHostId);
                        } catch (e) {
                            console.warn('[P2P] Lobby reconnect failed:', e);
                        }
                    }
                }
            }
        });

        this.network.on('playerReady', (msg) => {
            this.lobby.updatePlayerList(msg.players);
        });

        this.network.on('chat', (msg) => {
            this.lobby.addChatMessage(msg.name, msg.message);
        });

        this.network.on('p2pReady', () => {
            if (this.renderer && this.renderer.initialized && this.running) {
                this.renderer.showNotice(svt('game.p2pConnected', 'P2P 연결됨'), 1800);
            }
        });

        this.network.on('localPing', (ping) => {
            if (this.renderer && this.renderer.initialized && this.mode === 'multiplayer') {
                this.renderer.setNetworkPing(ping);
            }
        });

        this.network.on('pingUpdate', (pings) => {
            this.lobby.updatePingDisplay(pings);
        });

        this.network.on('kicked', () => {
            this.backToLobby({ keepConnection: true });
            this.network.disconnect();
            this.lobby.showError(svt('game.kicked', '방장이 내보냈습니다'));
            this.lobby.showScreen('main-menu');
        });

        this.network.on('gameStart', async (msg) => {
            this.mode = 'multiplayer';
            this.myTeam = msg.myTeam;
            this.mySlimeId = msg.mySlotIndex;
            this.botMap = new Map();

            this.physics.reset();
            const meta = msg.metadata || {};
            this.physics.configure({
                sets: meta.sets || 1,
                scorePerSet: meta.scorePerSet || 25,
                deuce: meta.deuce !== false,
            });
            this.physics.initSlimes(msg.teamSizes);

            const gameSeed = (msg.config && msg.config.gameSeed) || 12345;
            if (msg.players) {
                for (const p of msg.players) {
                    if (p.slotIndex !== undefined) {
                        const slime = this.physics.slimes.find(s => s.id === p.slotIndex);
                        if (slime) {
                            slime.nickname = p.name || '???';
                            if (p.isBot) {
                                slime.isBot = true;
                                this.botMap.set(slime.id, new BotAI('normal', gameSeed + slime.id));
                            }
                        }
                    }
                }
            }
            this._gameSeed = gameSeed;

            if (!this.renderer.initialized) {
                await this.renderer.init();
            } else {
                this.renderer.clearSlimes();
                this.renderer.clearBall();
            }
            this.renderer.setNetworkPing(this.network.myPing || 0);

            this.lobby.showScreen('game-screen');

            this.network.mySlotIndex = msg.mySlotIndex;
            this._remotePlayerInputs = new Map();
            this._remoteInputSeqs = new Map();

            const humanPeers = msg.players.filter(p => p.id !== this.network.playerId && !p.isBot);
            if (humanPeers.length === 0) {
                this.startCountdown();
                return;
            }

            if (this.network.p2pReady) {
                this.startCountdown();
            } else {
                this.renderer.showMessage(svt('game.p2pConnecting', 'P2P 연결 중...'), 8000);
                try {
                    if (!this.network.peerjs.peer) {
                        const hostPlayer = (msg.players || []).find(p => p.isHost);
                        const hostId = this.network.isHost ? this.network.playerId : (hostPlayer ? hostPlayer.id : null);
                        await this.network.initP2P(hostId);
                    }
                    await new Promise((resolve, reject) => {
                        if (this.network.p2pReady) { resolve(); return; }
                        const onReady = () => { clearTimeout(timeout); resolve(); };
                        const timeout = setTimeout(() => {
                            this.network.off('p2pReady', onReady);
                            reject(new Error('P2P timeout'));
                        }, 8000);
                        this.network.on('p2pReady', onReady);
                    });
                    this.startCountdown();
                } catch (e) {
                    console.error('[P2P] Failed:', e);
                    this.lobby.showError(svt('game.p2pFailed', 'P2P 연결 실패. 다시 시도해주세요.'));
                    this.lobby.showScreen('room-screen');
                }
            }
        });

        this.network.on('gameState', (msg) => {
            if (!this.network.isHost && msg.state) {
                const mySlime = this.physics.slimes.find(s => s.id === this.mySlimeId);
                const oldVisualX = mySlime ? mySlime.x + this._predVisualOffsetX : undefined;
                const oldVisualY = mySlime ? mySlime.y + this._predVisualOffsetY : undefined;

                this.physics.setState(msg.state);
                this._pushRemoteState(msg.state);
                this._reconcileMySlime(msg, oldVisualX, oldVisualY);
            }
        });

        this.network.on('input', (msg) => {
            if (this.network.isHost && msg.input && msg.slotIndex !== undefined) {
                if (this._remotePlayerInputs) {
                    if (!this._remoteInputSeqs) this._remoteInputSeqs = new Map();
                    const hasSequence = Number.isSafeInteger(msg.seq);
                    const lastSequence = this._remoteInputSeqs.get(msg.slotIndex);
                    if (!hasSequence || lastSequence === undefined || msg.seq > lastSequence) {
                        const prev = this._remotePlayerInputs.get(msg.slotIndex);
                        if (!prev || prev.left !== msg.input.left || prev.right !== msg.input.right || prev.jump !== msg.input.jump) {
                            this._flushStateSoon = true;
                        }
                        this._remotePlayerInputs.set(msg.slotIndex, msg.input);
                        if (hasSequence) this._remoteInputSeqs.set(msg.slotIndex, msg.seq);
                    }
                }
            }
        });

        this.network.on('gameEvent', (msg) => {
            if (!this.network.isHost) {
                if (msg.event === 'wallBounce') {
                    this.sound.playWallBounce();
                } else if (msg.event === 'netBounce') {
                    this.sound.playNetBounce();
                } else if (msg.event === 'hit') {
                    const isLocalRecentHit = msg.slimeId === this.mySlimeId &&
                        (performance.now() - this._lastLocalHitAt) < 220;
                    if (!isLocalRecentHit) {
                        this.sound.playHit(msg.intensity || 0.5);
                        if (msg.slimeId !== undefined) {
                            this.renderer.triggerSlimeBounce(msg.slimeId, -0.18);
                        }
                        this.renderer.spawnHitParticles(msg.x, msg.y, msg.color);
                    }
                    if (msg.intensity > 0.6) this.renderer.shake(msg.intensity * 6);
                } else if (msg.event === 'scored') {
                    this.sound.playFloorBounce();
                    this.sound.playScore(msg.team);
                    this.renderer.spawnScoreParticles(msg.team);
                    this.renderer.shake(8);
                    this.renderer.showMessage(`${msg.scores[0]} - ${msg.scores[1]}`, CONFIG.POINT_FREEZE);
                } else if (msg.event === 'setWon') {
                    this.sound.playFloorBounce();
                    this.sound.playScore(msg.setWinner);
                    this.renderer.shake(10);
                    this.renderer.showMessage(
                        svtf('game.setScoreBanner', `Set ${msg.setNumber}! (${msg.setsWon[0]}-${msg.setsWon[1]})`, {
                            n: msg.setNumber,
                            a: msg.setsWon[0],
                            b: msg.setsWon[1],
                        }),
                        1800
                    );
                } else if (msg.event === 'gameOver') {
                    this.sound.playFloorBounce();
                    this.running = false;
                    const won = msg.winner === this.myTeam;
                    this.sound.playGameOver(won);
                    this.renderer.shake(12);
                    // 호스트와 같이 타이머를 보관한다. 1.5초 안에 나가거나 다음 경기가
                    // 시작되면 backToLobby / startCountdown 이 이 연출을 취소한다.
                    if (this.gameOverTimer) clearTimeout(this.gameOverTimer);
                    this.gameOverTimer = setTimeout(() => {
                        this.gameOverTimer = null;
                        this.lobby.showGameOver(msg.winner, msg.setsWon, this.myTeam, msg.setScores, msg.mvp);
                    }, 1500);
                }
            }
        });

        this.network.on('error', () => {
            this.lobby.showError(svt('game.serverError', '서버 연결 오류'));
        });

        this.network.on('disconnected', () => {
            if (this.running) {
                this.lobby.showError(svt('game.connectionLost', '연결이 끊겼습니다'));
            }
        });
    }

    startMultiplayerGame() {
        this.enterFullscreen();
        this.network.startGame({ gameSeed: Date.now() });
    }

    enterFullscreen() { var __oc0;
        (((__oc0 = window.ArcherImmersive) === null || __oc0 === void 0 ? void 0 : __oc0.autoEnter()));
    }

    toggleSound() {
        this.sound.setMuted(!this.sound.muted);
        this.updateSoundButton();
    }

    updateSoundButton() {
        const btn = document.getElementById('btn-sound');
        if (btn) {
            const i18n = window.SlimeVolleyI18n;
            const key = this.sound.muted ? 'common.soundOff' : 'common.soundOn';
            btn.textContent = i18n ? i18n.t(key) : (this.sound.muted ? 'Sound OFF' : 'Sound ON');
            btn.classList.toggle('muted', this.sound.muted);
        }
    }
}

// Initialize on load
window.addEventListener('DOMContentLoaded', async () => {
    const game = new SlimeVolleyGame();
    await game.init();
    window.game = game;
});

// 【글로벌 에러 핸들러】
(function() {
    var ERROR_ENDPOINT = 'https://chatbot-api.yama5993.workers.dev/error-logs';
    var APP_ID = 'slimevolley';
    var _lastError = '';
    var _errorCount = 0;
    var _session = Math.random().toString(36).substring(2, 8);

    function _classifyError(msg, stack, src) {
        if (!msg) return 'noise';
        if (msg === 'Script error.' && !stack) return 'noise';
        if (/Can't find variable: (gmo|__gCrWeb|ytcfg|__)/.test(msg)) return 'noise';
        if (/ResizeObserver loop/.test(msg)) return 'noise';
        if (src && /googletagmanager|google-analytics|gtag\/js|cloudflare|chrome-extension|moz-extension|safari-extension/.test(src)) return 'external';
        if (src && /^undefined:/.test(src) && !(stack || '').match(/\/(assets|js|modules)\//)) return 'external';
        if (/Loading chunk|dynamically imported module/.test(msg)) return 'network';
        return 'app';
    }

    function _sendError(type, msg, stack, src) {
        var errClass = _classifyError(msg, stack, src);
        if (!msg) return;
        if (errClass === 'noise') return;
        var key = msg + '|' + src;
        if (key === _lastError) { _errorCount++; if (_errorCount > 5) return; }
        else { _lastError = key; _errorCount = 1; }

        var ctx = 'sess:' + _session + ' | path:' + location.pathname + ' | online:' + navigator.onLine + ' | vw:' + innerWidth + 'x' + innerHeight;
        var payload = {
            appId: APP_ID, userId: '',
            message: ('[' + errClass + ':' + type + '] ' + (msg || '')).substring(0, 500),
            stack: (
                '[ctx] ' + ctx +
                '\n[src] ' + (src || 'N/A') +
                '\n[ua] ' + navigator.userAgent.substring(0, 150) +
                '\n[ref] ' + (document.referrer || 'direct') +
                '\n[time] ' + new Date().toISOString() +
                '\n[trace]\n' + (stack || 'no stack')
            ).substring(0, 2000),
            url: (src || location.href).substring(0, 500)
        };

        try { navigator.sendBeacon(ERROR_ENDPOINT, JSON.stringify(payload)); } catch (_) {}
    }

    if (!window.ArcherLabClientErrorReporter) {
    window.addEventListener('error', function(e) { var __oc1, __oc2;
        var src = (e.filename || '') + ':' + e.lineno + ':' + e.colno;
        if (window.__slimeVolleyIgnoreError && window.__slimeVolleyIgnoreError(e.message, e.filename, e.lineno, e.colno, e.error)) return;
        _sendError((((__oc1 = e.error) === null || __oc1 === void 0 ? void 0 : __oc1.name)) || 'Error', e.message, (((__oc2 = e.error) === null || __oc2 === void 0 ? void 0 : __oc2.stack)) || '', src);
    });

    window.addEventListener('unhandledrejection', function(e) {
        var reason = e.reason;
        var msg = ((reason === null || reason === void 0 ? void 0 : reason.message)) || String(reason || 'Unhandled rejection');
        _sendError('UnhandledRejection', msg, ((reason === null || reason === void 0 ? void 0 : reason.stack)) || '', location.href);
    });
    }
})();
