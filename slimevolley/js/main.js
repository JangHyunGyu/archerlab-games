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
        this.relayUrl = 'wss://relay.archerlab.dev';

        // 스냅샷 보간 버퍼
        this.snapshotBuffer = [];
        this.snapshotMaxSize = 30;
        this.interpolationDelay = CONFIG.INTERPOLATION_DELAY;

        // 클라이언트 측 물리 예측 + 서버 보정
        this._lastAppliedSnapshot = null;

        this.setupInput();
        this.setupNetworkHandlers();
    }

    async init() {
        this.renderer = new GameRenderer(document.getElementById('game-canvas-container'));
        this.lobby = new LobbyManager(this);

        const initSound = async () => {
            await this.sound.init();
            document.removeEventListener('click', initSound);
            document.removeEventListener('keydown', initSound);
        };
        document.addEventListener('click', initSound);
        document.addEventListener('keydown', initSound);

        this.updateSoundButton();
    }

    setupInput() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
                if (this.running) e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        this.setupMobileControls();
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

        // 좌우 이동: 터치 시작점 기준으로 좌/우 드래그
        let moveStartX = null;
        const DEAD_ZONE = 3;
        const MAX_DRAG = 15; // 노브 최대 이동 범위

        moveZone.addEventListener('touchstart', (e) => {
            e.preventDefault();
            moveStartX = e.touches[0].clientX;
            moveZone.classList.add('active');
        }, { passive: false });

        moveZone.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (moveStartX === null) return;
            const dx = e.touches[0].clientX - moveStartX;
            this.keys['ArrowLeft'] = dx < -DEAD_ZONE;
            this.keys['ArrowRight'] = dx > DEAD_ZONE;
            // 조이스틱 노브 이동
            if (joystickKnob) {
                const clampedDx = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, dx));
                joystickKnob.style.transform = `translateX(${clampedDx}px)`;
            }
        }, { passive: false });

        const stopMove = (e) => {
            e.preventDefault();
            moveStartX = null;
            this.keys['ArrowLeft'] = false;
            this.keys['ArrowRight'] = false;
            moveZone.classList.remove('active');
            if (joystickKnob) joystickKnob.style.transform = '';
        };
        moveZone.addEventListener('touchend', stopMove, { passive: false });
        moveZone.addEventListener('touchcancel', stopMove, { passive: false });

        // 점프: 우측 영역 터치
        jumpZone.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.keys['ArrowUp'] = true;
            jumpZone.classList.add('active');
        }, { passive: false });

        const stopJump = (e) => {
            e.preventDefault();
            this.keys['ArrowUp'] = false;
            jumpZone.classList.remove('active');
        };
        jumpZone.addEventListener('touchend', stopJump, { passive: false });
        jumpZone.addEventListener('touchcancel', stopJump, { passive: false });
    }

    getMyInput() {
        if (!this._myInput) this._myInput = { left: false, right: false, jump: false };
        this._myInput.left = this.keys['ArrowLeft'] || this.keys['KeyA'] || false;
        this._myInput.right = this.keys['ArrowRight'] || this.keys['KeyD'] || false;
        this._myInput.jump = this.keys['ArrowUp'] || this.keys['KeyW'] || this.keys['Space'] || false;
        return this._myInput;
    }

    // === Practice Mode ===
    async startPractice(myTeamSize, botTeamSize, difficulty) {
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

        this.lobby.showScreen('game-screen');
        this.startCountdown();
    }

    startCountdown() {
        // 이전 카운트다운 정리
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
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

    startGameLoop() {
        this.running = true;
        this.physics.phase = 'serving';
        this.physics.freezeTimer = 60;
        this.physicsAccumulator = 0;

        // 렌더 보간용 이전 물리 상태
        this._interpPrev = null;

        if (this.gameLoop) {
            this.renderer.app.ticker.remove(this.gameLoop);
        }

        const FIXED_DT = 1000 / 120; // 120fps 고정 물리 스텝

        // Lockstep: 양쪽 모두 동일한 물리 실행, 입력만 교환
        this._remotePlayerInputs = new Map();

        this.gameLoop = (ticker) => {
            if (!this.running) return;

            // 멀티플레이어: 내 입력 전송
            if (this.mode === 'multiplayer') {
                this.network.sendInput(this.getMyInput());
            }

            // 모든 모드: 동일한 물리 스텝
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

    // 렌더 보간: 마지막 물리 스텝 이전 상태 저장 (GC 최소화)
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

    // 렌더 보간 적용: prev 와 current 사이를 alpha 비율로 보간
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

    // === Rollback Netcode (P2P optimized, zero-GC) ===
    _initRollback() {
        this._rbFrame = 0;
        this._rbInputRedundancy = 5;    // 최근 5프레임 입력을 매번 함께 전송
        this._rbMaxRollback = 30;       // 최대 롤백 깊이 (30프레임 = 250ms)
        this._rbMaxResimFrames = 12;    // 최대 재시뮬레이션 깊이
        this._rbSuppressSounds = false;
        this._rbInputSendTimer = 0;

        // 적응형 입력 딜레이: 핑 기반 자동 조절 (롤백 최소화)
        // P2P 연결 시 1-2프레임, WS 릴레이 시 핑/2를 프레임으로 변환
        this._rbInputDelay = 3;         // 초기값 (25ms@120fps)
        this._rbInputDelayTarget = 3;
        this._rbInputDelayMin = 1;      // P2P: 최소 1프레임 (8ms)
        this._rbInputDelayMax = 12;     // 릴레이: 최대 12프레임 (100ms)
        this._rbRollbackCount = 0;      // 최근 롤백 횟수 (모니터링용)
        this._rbAdaptTimer = 0;

        // Map 기반 (delete 시 V8 de-optimization 방지)
        this._rbLocalInputs = new Map();
        this._rbRemoteInputs = new Map();     // slotId -> Map(frame -> {l,r,j})
        this._rbUsedRemoteInputs = new Map(); // slotId -> Map(frame -> {l,r,j})
        this._rbLastRemoteInput = new Map();  // slotId -> {l,r,j}
        this._rbConfirmedRemoteFrame = new Map();
        this._rbStates = new Map();           // frame -> pooled state ref
        this._rbBotStates = new Map();        // frame -> Map(slimeId -> botState)
        this._rbPendingRemoteInputs = [];

        // 재사용 입력 객체 (GC 방지)
        this._rbIdleInput = { left: false, right: false, jump: false };
        this._rbTempInput = { left: false, right: false, jump: false };

        // 시각적 오프셋 (롤백 보정 스무딩)
        this._rbVisualOffset = new Map();

        // 슬라임 인덱스 캐시 (find 호출 제거)
        this._rbSlimeById = new Map();
        for (const slime of this.physics.slimes) {
            this._rbSlimeById.set(slime.id, slime);
        }

        // 원격 플레이어 슬롯 목록
        this._rbRemoteSlots = [];
        for (const slime of this.physics.slimes) {
            if (slime.id !== this.mySlimeId && !slime.isBot) {
                this._rbRemoteSlots.push(slime.id);
                this._rbRemoteInputs.set(slime.id, new Map());
                this._rbUsedRemoteInputs.set(slime.id, new Map());
                this._rbLastRemoteInput.set(slime.id, { left: false, right: false, jump: false });
                this._rbConfirmedRemoteFrame.set(slime.id, -1);
                this._rbVisualOffset.set(slime.id, { x: 0, y: 0 });
            }
        }

        // 상태 풀 초기화 (zero-allocation saves)
        const poolSize = this._rbMaxRollback + this._rbMaxResimFrames + 10;
        this.physics.initStatePool(poolSize, this.physics.slimes.length);

        // 롤백 보정 전 위치 캐시 (재사용)
        this._rbPrePositions = new Map();
        for (const slotId of this._rbRemoteSlots) {
            this._rbPrePositions.set(slotId, { x: 0, y: 0 });
        }
    }

    _rollbackTick(FIXED_DT) {
        // 롤백 보정 전 위치 저장 (재사용 객체)
        for (const slotId of this._rbRemoteSlots) {
            const sl = this._rbSlimeById.get(slotId);
            if (sl) {
                const pre = this._rbPrePositions.get(slotId);
                pre.x = sl.x; pre.y = sl.y;
            }
        }

        this._processRemoteInputs();

        // 롤백 보정 시각적 오프셋 누적
        for (const slotId of this._rbRemoteSlots) {
            const sl = this._rbSlimeById.get(slotId);
            const pre = this._rbPrePositions.get(slotId);
            if (sl && pre) {
                const dx = sl.x - pre.x;
                const dy = sl.y - pre.y;
                if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
                    const offset = this._rbVisualOffset.get(slotId);
                    offset.x -= dx;
                    offset.y -= dy;
                }
            }
        }

        let stepsThisTick = 0;
        const maxStepsPerTick = 4; // CPU 스파이크 방지 (6→4)

        while (this.physicsAccumulator >= FIXED_DT) {
            // Frame advantage: 너무 앞서나가지 않기
            let minConfirmed = this._rbFrame;
            if (this._rbRemoteSlots.length > 0) {
                minConfirmed = Infinity;
                for (const id of this._rbRemoteSlots) {
                    const cf = this._rbConfirmedRemoteFrame.get(id);
                    if (cf < minConfirmed) minConfirmed = cf;
                }
            }
            const frameAdvantage = this._rbFrame - minConfirmed;
            if (frameAdvantage > this._rbMaxRollback - 2) {
                // 프레임 진행 차단 - 1초에 한번만 로그
                if (!this._rbStallLogTime || Date.now() - this._rbStallLogTime > 1000) {
                    this._rbStallLogTime = Date.now();
                    console.warn(`[Netcode] STALL: frame=${this._rbFrame} confirmed=${minConfirmed} advantage=${frameAdvantage} remoteSlots=${JSON.stringify(this._rbRemoteSlots)}`);
                }
                break;
            }
            if (stepsThisTick >= maxStepsPerTick) {
                break;
            }
            stepsThisTick++;

            const frame = this._rbFrame;

            // 렌더 보간용 이전 상태 저장
            this._saveInterpState();

            // 내 입력: inputDelay 적용 (현재 키 입력을 frame+delay에 등록)
            const myInput = this.getMyInput();
            const targetFrame = frame + this._rbInputDelay;
            // 현재 프레임용 입력이 아직 없으면 idle
            if (!this._rbLocalInputs.has(frame)) {
                this._rbLocalInputs.set(frame, { left: false, right: false, jump: false });
            }
            // 미래 프레임에 현재 입력 등록
            this._rbLocalInputs.set(targetFrame, { left: myInput.left, right: myInput.right, jump: myInput.jump });

            // 입력 전송 (매 프레임 + 중복 히스토리)
            this._rbInputSendTimer++;
            const lastInput = this._rbLocalInputs.get(targetFrame - 1);
            const changed = !lastInput || lastInput.left !== myInput.left || lastInput.right !== myInput.right || lastInput.jump !== myInput.jump;
            if (changed || this._rbInputSendTimer >= 2) {
                // 히스토리: 최근 N프레임 입력 묶어 보내기
                const history = [];
                for (let i = 1; i <= this._rbInputRedundancy; i++) {
                    const hf = targetFrame - i;
                    const hi = this._rbLocalInputs.get(hf);
                    if (hi) history.push({ f: hf, l: hi.left, r: hi.right, j: hi.jump });
                }
                this.network.sendFrameInput(targetFrame, myInput, history.length > 0 ? history : undefined);
                this._rbInputSendTimer = 0;
            }

            // 입력 적용 + 물리 실행
            this._applyInputsForFrame(frame);
            const result = this.physics.update();
            if (!this._rbSuppressSounds) {
                this.handlePhysicsResult(result);

                // 호스트: 점수/세트/게임오버 이벤트 전송 (비-호스트에게 권위적 동기화)
                if (this.network.isHost && result) {
                    if (result.type === 'score') {
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
                    }
                }
            }

            // 상태 저장 (zero-allocation pooled)
            this._rbStates.set(frame, this.physics.saveStatePooled());
            // 봇 상태 (봇이 있을 때만)
            if (this.botMap.size > 0) {
                const botFrame = new Map();
                for (const [id, bot] of this.botMap) {
                    botFrame.set(id, bot.saveState());
                }
                this._rbBotStates.set(frame, botFrame);
            }

            this._rbFrame++;
            this.physicsAccumulator -= FIXED_DT;

            // 오래된 프레임 정리 (Map.delete는 V8에 안전)
            const oldest = this._rbFrame - this._rbMaxRollback - 2;
            if (oldest >= 0) {
                this._rbStates.delete(oldest);
                this._rbBotStates.delete(oldest);
                this._rbLocalInputs.delete(oldest);
                for (const slotId of this._rbRemoteSlots) {
                    this._rbRemoteInputs.get(slotId)?.delete(oldest);
                    this._rbUsedRemoteInputs.get(slotId)?.delete(oldest);
                }
            }
        }
    }

    _processRemoteInputs() {
        const pending = this._rbPendingRemoteInputs;
        if (pending.length === 0) return;

        let needsRollback = false;
        let rollbackFrame = Infinity;

        for (let pi = 0; pi < pending.length; pi++) {
            const p = pending[pi];
            const frame = p.frame;
            const input = p.input;
            const slotIndex = p.slotIndex;
            const remoteMap = this._rbRemoteInputs.get(slotIndex);
            if (!remoteMap) continue;

            const lastConf = this._rbConfirmedRemoteFrame.get(slotIndex) || -1;
            const prevInput = this._rbLastRemoteInput.get(slotIndex) || this._rbIdleInput;

            // 중간 프레임 채우기
            for (let f = lastConf + 1; f < frame; f++) {
                if (!remoteMap.has(f)) {
                    remoteMap.set(f, { left: prevInput.left, right: prevInput.right, jump: prevInput.jump });
                    if (f < this._rbFrame) {
                        const used = this._rbUsedRemoteInputs.get(slotIndex)?.get(f);
                        if (used && (used.left !== prevInput.left || used.right !== prevInput.right || used.jump !== prevInput.jump)) {
                            needsRollback = true;
                            if (f < rollbackFrame) rollbackFrame = f;
                        }
                    }
                }
            }

            remoteMap.set(frame, { left: input.left, right: input.right, jump: input.jump });
            const lastRI = this._rbLastRemoteInput.get(slotIndex);
            lastRI.left = input.left; lastRI.right = input.right; lastRI.jump = input.jump;

            if (frame > lastConf) {
                this._rbConfirmedRemoteFrame.set(slotIndex, frame);
            }

            // 예측 비교
            if (frame < this._rbFrame) {
                const used = this._rbUsedRemoteInputs.get(slotIndex)?.get(frame);
                if (used && (used.left !== input.left || used.right !== input.right || used.jump !== input.jump)) {
                    needsRollback = true;
                    if (frame < rollbackFrame) rollbackFrame = frame;
                }
            }
        }

        this._rbPendingRemoteInputs.length = 0; // clear without new array

        if (needsRollback) {
            this._rbRollbackCount++;
            this._performRollback(rollbackFrame);
        }
    }

    _performRollback(toFrame) {
        const actualToFrame = Math.max(toFrame, this._rbFrame - this._rbMaxResimFrames);
        const restoreFrame = actualToFrame - 1;
        const savedState = this._rbStates.get(restoreFrame);
        if (!savedState) return;

        this.physics.loadStatePooled(savedState);

        // 봇 상태 복원
        const botStates = this._rbBotStates.get(restoreFrame);
        if (botStates) {
            for (const [id, bot] of this.botMap) {
                const bs = botStates.get(id);
                if (bs) bot.loadState(bs);
            }
        }

        this._rbSuppressSounds = true;

        // 재시뮬레이션
        for (let f = actualToFrame; f < this._rbFrame; f++) {
            this._applyInputsForFrame(f);
            this.physics.update();
            this._rbStates.set(f, this.physics.saveStatePooled());
            if (this.botMap.size > 0) {
                const botFrame = new Map();
                for (const [id, bot] of this.botMap) {
                    botFrame.set(id, bot.saveState());
                }
                this._rbBotStates.set(f, botFrame);
            }
        }

        this._rbSuppressSounds = false;
    }

    _applyInputsForFrame(frame) {
        for (const slime of this.physics.slimes) {
            if (slime.id === this.mySlimeId) {
                const li = this._rbLocalInputs.get(frame);
                if (li) {
                    slime.input.left = li.left;
                    slime.input.right = li.right;
                    slime.input.jump = li.jump;
                } else {
                    slime.input.left = false;
                    slime.input.right = false;
                    slime.input.jump = false;
                }
            } else if (slime.isBot) {
                const bot = this.botMap.get(slime.id);
                if (bot) {
                    slime.input = bot.getInput(slime, this.physics.ball, this.physics.slimes, this.physics);
                }
            } else {
                // 원격 플레이어: 확인된 입력 또는 예측 (직접 대입, spread 없음)
                const remoteMap = this._rbRemoteInputs.get(slime.id);
                const confirmed = remoteMap?.get(frame);
                const usedMap = this._rbUsedRemoteInputs.get(slime.id);

                if (confirmed) {
                    slime.input.left = confirmed.left;
                    slime.input.right = confirmed.right;
                    slime.input.jump = confirmed.jump;
                    // 사용 기록
                    let usedEntry = usedMap?.get(frame);
                    if (!usedEntry) {
                        usedEntry = { left: false, right: false, jump: false };
                        usedMap?.set(frame, usedEntry);
                    }
                    usedEntry.left = confirmed.left;
                    usedEntry.right = confirmed.right;
                    usedEntry.jump = confirmed.jump;
                } else {
                    const predicted = this._rbLastRemoteInput.get(slime.id) || this._rbIdleInput;
                    slime.input.left = predicted.left;
                    slime.input.right = predicted.right;
                    slime.input.jump = predicted.jump;
                    let usedEntry = usedMap?.get(frame);
                    if (!usedEntry) {
                        usedEntry = { left: false, right: false, jump: false };
                        usedMap?.set(frame, usedEntry);
                    }
                    usedEntry.left = predicted.left;
                    usedEntry.right = predicted.right;
                    usedEntry.jump = predicted.jump;
                }
            }
        }
    }

    update() {
        // Lockstep: 양쪽 동일하게 물리 실행
        const mySlime = this.physics.slimes.find(s => s.id === this.mySlimeId);
        if (mySlime && !mySlime.isBot) {
            mySlime.input = this.getMyInput();
        }

        // 멀티플레이어: 원격 플레이어 입력 적용 (서버에서 브로드캐스트 받은 것)
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

        // 호스트: 게임 이벤트를 클라이언트에 전송 (60fps로 제한)
        if (this.mode === 'multiplayer' && this.network.isHost) {
            if (!this._netSendCounter) this._netSendCounter = 0;
            this._netSendCounter++;
            if (this._netSendCounter >= 2) {
                this._netSendCounter = 0;
                this.network.sendGameState(this.physics.getState());
            }

            if (result) {
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
                }
            }
        }
    }

    handlePhysicsResult(result) {
        if (!result) return;

        // 점프 사운드 (어떤 이벤트에든 포함될 수 있음)
        if (result.jumped && result.jumped.length > 0) {
            this.sound.playJump();
        }

        if (result.type === 'jump') return; // 점프만 있는 경우 여기서 종료

        if (result.type === 'hit') {
            const intensity = Math.sqrt(
                this.physics.ball.vx ** 2 + this.physics.ball.vy ** 2
            ) / CONFIG.BALL_MAX_SPEED;
            this.sound.playHit(intensity);
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
                `Set ${result.setNumber}! (${result.setsWon[0]}-${result.setsWon[1]})`,
                1800
            );
        } else if (result.type === 'gameOver') {
            this.running = false;
            const won = result.winner === this.myTeam;
            this.sound.playGameOver(won);
            this.renderer.shake(12);

            setTimeout(() => {
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
        }
    }

    backToLobby() {
        this.running = false;
        if (this.gameLoop && this.renderer.app) {
            this.renderer.app.ticker.remove(this.gameLoop);
            this.gameLoop = null;
        }
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
        }
        this.renderer.clearMessages();
        this.renderer.clearSlimes();
        this.renderer.clearBall();
    }

    // === Multiplayer ===
    becomeHost() {
        this.network.isHost = true;

        // 최신 스냅샷 상태를 물리엔진에 적용
        if (this.snapshotBuffer.length > 0) {
            const latest = this.snapshotBuffer[this.snapshotBuffer.length - 1];
            this.physics.setState(latest.state);
        }
        this.snapshotBuffer = [];

        // 모든 봇 슬라임에 대해 BotAI 생성
        for (const slime of this.physics.slimes) {
            if (slime.isBot && !this.botMap.has(slime.id)) {
                this.botMap.set(slime.id, new BotAI('normal'));
            }
        }
    }

    setupNetworkHandlers() {
        this.network.on('roomCreated', (msg) => {
            this.lobby.showRoomScreen(msg.roomId, msg.players, true, msg.metadata);
        });

        this.network.on('joined', (msg) => {
            this.lobby.showRoomScreen(msg.roomId, msg.players, false, msg.metadata);
        });

        this.network.on('roomState', (msg) => {
            this.lobby.updatePlayerList(msg.players);
            this.lobby.updateRoomMeta(msg.metadata);
        });

        this.network.on('playerJoined', (msg) => {
            this.lobby.updatePlayerList(msg.players);
        });

        this.network.on('playerLeft', (msg) => {
            // 로비 UI 업데이트
            this.lobby.updatePlayerList(msg.players);

            // 게임 중 퇴장 처리
            if (this.running && this.mode === 'multiplayer') {
                // 나간 유저 이름 찾기 (봇 대체 전에)
                let leftName = null;
                if (msg.slotIndex !== undefined) {
                    const slime = this.physics.slimes.find(s => s.id === msg.slotIndex);
                    if (slime) leftName = slime.nickname;
                }

                // 호스트 이전: 내가 새 호스트인 경우
                if (msg.newHostId === this.network.playerId && !this.network.isHost) {
                    this.becomeHost();
                }

                // 나간 유저의 슬라임을 봇으로 대체 (양쪽 모두)
                if (msg.slotIndex !== undefined) {
                    const slime = this.physics.slimes.find(s => s.id === msg.slotIndex);
                    if (slime && !slime.isBot) {
                        slime.isBot = true;
                        slime.nickname = (slime.nickname || 'Player') + ' (Bot)';
                        const seed = (this._gameSeed || 12345) + slime.id;
                        this.botMap.set(slime.id, new BotAI('normal', seed));
                        // Rollback 원격 슬롯에서 제거
                        if (this._rbRemoteSlots) {
                            this._rbRemoteSlots = this._rbRemoteSlots.filter(id => id !== slime.id);
                        }
                    }
                }

                // 퇴장 알림 표시
                if (leftName && this.renderer) {
                    this.renderer.showNotice(`${leftName} left → Bot`, 2500);
                }
            }
        });

        this.network.on('playerReady', (msg) => {
            this.lobby.updatePlayerList(msg.players);
        });

        this.network.on('chat', (msg) => {
            this.lobby.addChatMessage(msg.name, msg.message);
        });

        // P2P 연결 성공 알림
        this.network.on('p2pReady', () => {
            console.log('%c[P2P] ✅ Direct connection established!', 'color: #4FC3F7; font-weight: bold');
            if (this.renderer) this.renderer.showNotice('P2P Direct Connected!', 2000);
            // P2P 연결 시 입력 딜레이 최소화
            if (this._rbInputDelay !== undefined) {
                this._rbInputDelayTarget = 2; // P2P는 2프레임 (16ms) 충분
            }
        });

        this.network.on('p2pFallback', () => {
            console.log('%c[P2P] ❌ Failed, using WebSocket relay', 'color: #EF5350; font-weight: bold');
            if (this.renderer) this.renderer.showNotice('Relay Mode (WS)', 2000);
        });

        this.network.on('pingUpdate', (pings) => {
            this.lobby.updatePingDisplay(pings);
            if (this.network.myPing > 0) {
                this.interpolationDelay = Math.max(30, this.network.myPing * 0.6 + 16);
            }
            // 간단한 네트코드 상태 로그
            if (this.mode === 'multiplayer') {
                console.log(`[Netcode] ping=${this.network.myPing}ms p2p=${this.network.p2pReady} host=${this.network.isHost}`);
            }
        });

        this.network.on('kicked', () => {
            this.network.disconnect();
            this.lobby.showError('방장에 의해 퇴장되었습니다');
            this.lobby.showScreen('main-menu');
        });

        this.network.on('gameStart', async (msg) => {
            this.mode = 'multiplayer';
            this.myTeam = msg.myTeam;
            this.mySlimeId = msg.mySlotIndex;
            this.snapshotBuffer = [];
            this._lastAppliedSnapshot = null;
            this.botMap = new Map();

            this.physics.reset();
            const meta = msg.metadata || {};
            this.physics.configure({
                sets: meta.sets || 1,
                scorePerSet: meta.scorePerSet || 25,
                deuce: meta.deuce !== false,
            });
            this.physics.initSlimes(msg.teamSizes);

            // 슬라임에 닉네임 매핑 + 봇 초기화 (양쪽 모두 동일한 시드로)
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

            // P2P 연결 초기화 (시그널링은 WS 경유, 게임 데이터는 P2P 직접)
            this.network.initiateP2P(msg.players, this.network.playerId, msg.mySlotIndex);

            if (!this.renderer.initialized) {
                await this.renderer.init();
            } else {
                this.renderer.clearSlimes();
                this.renderer.clearBall();
            }

            this.lobby.showScreen('game-screen');
            this.startCountdown();
        });

        // frameInput은 롤백 모드에서만 사용 (현재 호스트 권위 모드)
        this.network.on('frameInput', () => {});

        this.network.on('gameState', (msg) => {
            // Lockstep: desync 보정용 (호스트 상태를 기준으로 보정)
            if (!this.network.isHost && msg.state) {
                // 점수/세트/phase만 호스트 기준으로 강제 동기화
                this.physics.scores = [...msg.state.scores];
                this.physics.phase = msg.state.phase;
                this.physics.servingTeam = msg.state.servingTeam;
                if (msg.state.setsWon) this.physics.setsWon = [...msg.state.setsWon];
                if (msg.state.currentSet !== undefined) this.physics.currentSet = msg.state.currentSet;
            }
        });

        this.network.on('input', (msg) => {
            // Lockstep: 모든 플레이어가 원격 입력 수신
            if (msg.input && msg.slotIndex !== undefined) {
                if (this._remotePlayerInputs) {
                    this._remotePlayerInputs.set(msg.slotIndex, msg.input);
                }
            }
        });

        this.network.on('gameEvent', (msg) => {
            // Lockstep: 양쪽이 자체 물리에서 이벤트 처리하므로
            // gameEvent는 비호스트의 점수/세트 desync 보정용으로만 사용
            if (!this.network.isHost) {
                if (msg.event === 'scored' && msg.scores) {
                    this.physics.scores[0] = msg.scores[0];
                    this.physics.scores[1] = msg.scores[1];
                } else if (msg.event === 'setWon' && msg.setsWon) {
                    this.physics.setsWon[0] = msg.setsWon[0];
                    this.physics.setsWon[1] = msg.setsWon[1];
                } else if (msg.event === 'gameOver') {
                    // 호스트의 게임오버 판정을 비호스트도 따름
                    this.running = false;
                    const won = msg.winner === this.myTeam;
                    this.sound.playGameOver(won);
                    this.renderer.shake(12);
                    setTimeout(() => {
                        this.lobby.showGameOver(
                            msg.winner, msg.setsWon, this.myTeam, msg.setScores, msg.mvp
                        );
                    }, 1500);
                }
            }
        });

        this.network.on('error', () => {
            this.lobby.showError('Server error');
        });

        this.network.on('disconnected', () => {
            if (this.running) {
                this.lobby.showError('Connection lost');
            }
        });
    }

    startMultiplayerGame() {
        this.enterFullscreen();
        this.network.startGame({ gameSeed: Date.now() });
    }

    // === Fullscreen ===
    enterFullscreen() {
        if (document.fullscreenElement || document.webkitFullscreenElement) return;
        const el = document.documentElement;
        const fn = el.requestFullscreen || el.webkitRequestFullscreen;
        if (fn) fn.call(el).catch(() => {});
    }

    // === Sound ===
    toggleSound() {
        this.sound.setMuted(!this.sound.muted);
        this.updateSoundButton();
    }

    updateSoundButton() {
        const btn = document.getElementById('btn-sound');
        if (btn) {
            btn.textContent = this.sound.muted ? 'Sound OFF' : 'Sound ON';
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
