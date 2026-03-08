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

        if (this.gameLoop) {
            this.renderer.app.ticker.remove(this.gameLoop);
        }

        const FIXED_DT = 1000 / 120; // 120fps 고정 물리 스텝
        const isMultiplayer = this.mode === 'multiplayer';

        if (isMultiplayer) {
            this._initRollback();
        }

        this.gameLoop = (ticker) => {
            if (!this.running) return;

            this.physicsAccumulator += ticker.deltaMS;
            if (this.physicsAccumulator > FIXED_DT * 4) {
                this.physicsAccumulator = FIXED_DT * 4;
            }

            if (isMultiplayer) {
                this._rollbackTick(FIXED_DT);
            } else {
                while (this.physicsAccumulator >= FIXED_DT) {
                    this.update();
                    this.physicsAccumulator -= FIXED_DT;
                }
            }

            const state = this.physics.getState();

            // 멀티플레이어: 롤백 비주얼 스무딩 적용
            if (isMultiplayer && this._rbVisualOffsets) {
                for (const slotId of this._rbRemoteSlots) {
                    const off = this._rbVisualOffsets[slotId];
                    if (off && (off.x !== 0 || off.y !== 0)) {
                        const sl = state.slimes.find(s => s.id === slotId);
                        if (sl) {
                            sl.x += off.x;
                            sl.y += off.y;
                        }
                        // 느린 감쇄: 300ms 핑에서 부드러운 보정 (약 400ms에 걸쳐 수렴)
                        off.x *= 0.92;
                        off.y *= 0.92;
                        if (Math.abs(off.x) < 0.5) off.x = 0;
                        if (Math.abs(off.y) < 0.5) off.y = 0;
                    }
                }
            }

            this.renderer.render(state);
        };

        this.renderer.app.ticker.add(this.gameLoop);
    }

    // === Rollback Netcode ===
    _initRollback() {
        this._rbFrame = 0;
        this._rbLocalInputs = {};
        this._rbRemoteInputs = {};      // { [slotIndex]: { [frame]: input } }
        this._rbUsedRemoteInputs = {};  // { [slotIndex]: { [frame]: input } }
        this._rbLastRemoteInput = {};   // { [slotIndex]: input }
        this._rbConfirmedRemoteFrame = {}; // { [slotIndex]: frame }
        this._rbStates = {};            // frame -> { physics, bots }
        this._rbBotStates = {};         // frame -> { [slimeId]: botState }
        this._rbPendingRemoteInputs = [];
        this._rbSuppressSounds = false;
        this._rbMaxRollback = 60;
        this._rbInputSendTimer = 0;
        this._rbVisualOffsets = {}; // 롤백 시 비주얼 스무딩용 오프셋

        // 원격 플레이어 슬롯 목록
        this._rbRemoteSlots = [];
        for (const slime of this.physics.slimes) {
            if (slime.id !== this.mySlimeId && !slime.isBot) {
                this._rbRemoteSlots.push(slime.id);
                this._rbRemoteInputs[slime.id] = {};
                this._rbUsedRemoteInputs[slime.id] = {};
                this._rbLastRemoteInput[slime.id] = { left: false, right: false, jump: false };
                this._rbConfirmedRemoteFrame[slime.id] = -1;
                this._rbVisualOffsets[slime.id] = { x: 0, y: 0 };
            }
        }
    }

    _rollbackTick(FIXED_DT) {
        this._processRemoteInputs();

        let stepsThisTick = 0;
        const maxStepsPerTick = 6; // CPU 스파이크 방지

        while (this.physicsAccumulator >= FIXED_DT) {
            // Frame advantage: 너무 앞서나가지 않기 (soft limit)
            const minConfirmed = this._rbRemoteSlots.length > 0
                ? Math.min(...this._rbRemoteSlots.map(id => this._rbConfirmedRemoteFrame[id]))
                : this._rbFrame;
            const frameAdvantage = this._rbFrame - minConfirmed;
            if (frameAdvantage > this._rbMaxRollback - 2) {
                // Hard break 대신 accumulator만 소비 (프레임 스킵으로 부드러운 대기)
                this.physicsAccumulator -= FIXED_DT;
                continue;
            }
            if (stepsThisTick >= maxStepsPerTick) {
                break; // 한 틱에 너무 많은 물리 스텝 방지
            }
            stepsThisTick++;

            const frame = this._rbFrame;

            // 내 입력 기록 + 전송
            const myInput = this.getMyInput();
            this._rbLocalInputs[frame] = { ...myInput };
            this._rbInputSendTimer++;
            // 입력 변경 시 또는 2프레임마다 전송 (하트비트 주기 단축)
            const lastSent = this._rbLocalInputs[frame - 1];
            if (!lastSent || lastSent.left !== myInput.left || lastSent.right !== myInput.right || lastSent.jump !== myInput.jump || this._rbInputSendTimer >= 2) {
                this.network.sendFrameInput(frame, myInput);
                this._rbInputSendTimer = 0;
            }

            // 입력 적용 + 물리 실행
            this._applyInputsForFrame(frame);
            const result = this.physics.update();
            if (!this._rbSuppressSounds) {
                this.handlePhysicsResult(result);
            }

            // 상태 저장
            this._rbStates[frame] = this.physics.saveFullState();
            this._rbBotStates[frame] = {};
            for (const [id, bot] of this.botMap) {
                this._rbBotStates[frame][id] = bot.saveState();
            }

            this._rbFrame++;
            this.physicsAccumulator -= FIXED_DT;

            // 오래된 프레임 정리
            const oldest = this._rbFrame - this._rbMaxRollback - 2;
            if (oldest >= 0) {
                delete this._rbStates[oldest];
                delete this._rbBotStates[oldest];
                delete this._rbLocalInputs[oldest];
                for (const slotId of this._rbRemoteSlots) {
                    delete this._rbRemoteInputs[slotId][oldest];
                    delete this._rbUsedRemoteInputs[slotId][oldest];
                }
            }
        }
    }

    _processRemoteInputs() {
        const pending = this._rbPendingRemoteInputs;
        if (pending.length === 0) return;

        let needsRollback = false;
        let rollbackFrame = Infinity;

        for (const { frame, input, slotIndex } of pending) {
            if (!this._rbRemoteInputs[slotIndex]) continue;

            const lastConf = this._rbConfirmedRemoteFrame[slotIndex] || -1;
            const prevInput = this._rbLastRemoteInput[slotIndex] || { left: false, right: false, jump: false };

            // 중간 프레임 채우기: lastConfirmed+1 ~ frame-1은 이전 입력과 동일
            for (let f = lastConf + 1; f < frame; f++) {
                if (!this._rbRemoteInputs[slotIndex][f]) {
                    this._rbRemoteInputs[slotIndex][f] = { ...prevInput };
                    // 이미 시뮬레이션한 프레임이면 예측과 비교
                    if (f < this._rbFrame) {
                        const predicted = this._rbUsedRemoteInputs[slotIndex]?.[f];
                        if (predicted && (predicted.left !== prevInput.left || predicted.right !== prevInput.right || predicted.jump !== prevInput.jump)) {
                            needsRollback = true;
                            rollbackFrame = Math.min(rollbackFrame, f);
                        }
                    }
                }
            }

            this._rbRemoteInputs[slotIndex][frame] = input;
            this._rbLastRemoteInput[slotIndex] = { ...input };

            if (frame > lastConf) {
                this._rbConfirmedRemoteFrame[slotIndex] = frame;
            }

            // 현재 프레임 예측 비교
            if (frame < this._rbFrame) {
                const predicted = this._rbUsedRemoteInputs[slotIndex]?.[frame];
                if (predicted && (predicted.left !== input.left || predicted.right !== input.right || predicted.jump !== input.jump)) {
                    needsRollback = true;
                    rollbackFrame = Math.min(rollbackFrame, frame);
                }
            }
        }

        this._rbPendingRemoteInputs = [];

        if (needsRollback) {
            // 롤백 전 원격 슬라임 위치 저장 (비주얼 스무딩용)
            const prePos = {};
            for (const slotId of this._rbRemoteSlots) {
                const slime = this.physics.slimes.find(s => s.id === slotId);
                if (slime) prePos[slotId] = { x: slime.x, y: slime.y };
            }

            this._performRollback(rollbackFrame);

            // 롤백 후 위치 차이를 비주얼 오프셋에 누적
            for (const slotId of this._rbRemoteSlots) {
                const slime = this.physics.slimes.find(s => s.id === slotId);
                if (slime && prePos[slotId]) {
                    const off = this._rbVisualOffsets[slotId];
                    off.x += prePos[slotId].x - slime.x;
                    off.y += prePos[slotId].y - slime.y;
                    // 오프셋 제한 (너무 큰 보정은 바로 적용)
                    const maxOff = 80;
                    if (Math.abs(off.x) > maxOff) off.x = Math.sign(off.x) * maxOff;
                    if (Math.abs(off.y) > maxOff) off.y = Math.sign(off.y) * maxOff;
                }
            }
        }
    }

    _performRollback(toFrame) {
        // 재시뮬레이션 깊이 제한 (CPU 스파이크 방지)
        const maxResimFrames = 20;
        const actualToFrame = Math.max(toFrame, this._rbFrame - maxResimFrames);

        const restoreFrame = actualToFrame - 1;
        const savedState = this._rbStates[restoreFrame];
        if (!savedState) return;

        this.physics.loadFullState(savedState);
        // 봇 상태 복원
        const botStates = this._rbBotStates[restoreFrame];
        if (botStates) {
            for (const [id, bot] of this.botMap) {
                if (botStates[id]) bot.loadState(botStates[id]);
            }
        }

        this._rbSuppressSounds = true;

        // 재시뮬레이션
        for (let f = actualToFrame; f < this._rbFrame; f++) {
            this._applyInputsForFrame(f);
            this.physics.update();
            this._rbStates[f] = this.physics.saveFullState();
            this._rbBotStates[f] = {};
            for (const [id, bot] of this.botMap) {
                this._rbBotStates[f][id] = bot.saveState();
            }
        }

        this._rbSuppressSounds = false;
    }

    _applyInputsForFrame(frame) {
        for (const slime of this.physics.slimes) {
            if (slime.id === this.mySlimeId) {
                slime.input = this._rbLocalInputs[frame] || { left: false, right: false, jump: false };
            } else if (slime.isBot) {
                const bot = this.botMap.get(slime.id);
                if (bot) {
                    slime.input = bot.getInput(slime, this.physics.ball, this.physics.slimes, this.physics);
                }
            } else {
                // 원격 플레이어: 확인된 입력 또는 예측
                const confirmed = this._rbRemoteInputs[slime.id]?.[frame];
                if (confirmed) {
                    slime.input = { ...confirmed };
                    if (!this._rbUsedRemoteInputs[slime.id]) this._rbUsedRemoteInputs[slime.id] = {};
                    this._rbUsedRemoteInputs[slime.id][frame] = { ...confirmed };
                } else {
                    const predicted = this._rbLastRemoteInput[slime.id] || { left: false, right: false, jump: false };
                    slime.input = { ...predicted };
                    if (!this._rbUsedRemoteInputs[slime.id]) this._rbUsedRemoteInputs[slime.id] = {};
                    this._rbUsedRemoteInputs[slime.id][frame] = { ...predicted };
                }
            }
        }
    }

    update() {
        // 호스트 또는 연습 모드: 기존 로직
        const mySlime = this.physics.slimes.find(s => s.id === this.mySlimeId);
        if (mySlime && !mySlime.isBot) {
            mySlime.input = this.getMyInput();
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

        this.network.on('pingUpdate', (pings) => {
            this.lobby.updatePingDisplay(pings);
            // 핑 기반 적응형 보간 지연 (최소 30ms, 핑의 60% + 1프레임 버퍼)
            if (this.network.myPing > 0) {
                this.interpolationDelay = Math.max(30, this.network.myPing * 0.6 + 16);
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

            if (!this.renderer.initialized) {
                await this.renderer.init();
            } else {
                this.renderer.clearSlimes();
                this.renderer.clearBall();
            }

            this.lobby.showScreen('game-screen');
            this.startCountdown();
        });

        this.network.on('frameInput', (msg) => {
            if (this._rbPendingRemoteInputs) {
                this._rbPendingRemoteInputs.push({
                    frame: msg.frame,
                    input: msg.input,
                    slotIndex: msg.slotIndex,
                });
            }
        });

        this.network.on('gameState', (msg) => {
            // Rollback 모드에서는 gameState 무시 (양쪽 로컬 물리 사용)
        });

        this.network.on('input', (msg) => {
            // Legacy: 호스트 전용 모드 (rollback에서는 미사용)
        });

        this.network.on('gameEvent', (msg) => {
            if (msg.event === 'scored') {
                this.sound.playScore(msg.team);
                this.renderer.spawnScoreParticles(msg.team);
                this.renderer.shake(8);
                this.renderer.showMessage(
                    `${msg.scores[0]} - ${msg.scores[1]}`,
                    CONFIG.POINT_FREEZE
                );
            } else if (msg.event === 'hit') {
                // 클라이언트 로컬 물리에서 히트를 직접 처리 → 서버 이벤트 무시
            } else if (msg.event === 'setWon') {
                this.sound.playScore(msg.setWinner);
                this.renderer.shake(10);
                this.renderer.showMessage(
                    `Set ${msg.setNumber}! (${msg.setsWon[0]}-${msg.setsWon[1]})`,
                    1800
                );
            } else if (msg.event === 'gameOver') {
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
        this.network.startGame({ gameSeed: Date.now() });
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
