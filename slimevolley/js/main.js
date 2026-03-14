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
        this._remotePlayerInputs = new Map();
        const isNonHost = this.mode === 'multiplayer' && !this.network.isHost;

        this.gameLoop = (ticker) => {
            if (!this.running) return;

            if (isNonHost) {
                // 비호스트: 물리 안 돌림. 입력 전송 + 호스트 상태 렌더링만.
                this.network.sendInput(this.getMyInput());
                this.renderer.render(this.physics.getState());
                return;
            }

            // 호스트 또는 연습모드: 물리 실행
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

    update() {
        // 호스트만 물리 실행 (비호스트는 gameLoop에서 return됨)
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
            if (this.renderer) this.renderer.showNotice('P2P Connected!', 2000);
        });

        this.network.on('pingUpdate', (pings) => {
            this.lobby.updatePingDisplay(pings);
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

            // PeerJS P2P 연결 (필수 — 연결 안되면 게임 안 시작)
            this.network.mySlotIndex = msg.mySlotIndex;
            this._remotePlayerInputs = new Map();

            // 봇만 있으면 P2P 불필요 → 바로 시작
            const humanPeers = msg.players.filter(p => p.id !== this.network.playerId && !p.isBot);
            if (humanPeers.length === 0) {
                this.startCountdown();
                return;
            }

            this.renderer.showMessage('P2P 연결 중...', 10000);

            try {
                await this.network.initP2P();

                // 호스트: 비호스트가 연결할 때까지 대기 (최대 10초)
                if (this.network.isHost && !this.network.p2pReady) {
                    await new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => reject(new Error('P2P timeout')), 10000);
                        this.network.on('p2pReady', () => {
                            clearTimeout(timeout);
                            resolve();
                        });
                        // 이미 ready인 경우
                        if (this.network.p2pReady) {
                            clearTimeout(timeout);
                            resolve();
                        }
                    });
                }

                this.startCountdown();
            } catch (e) {
                console.error('[P2P] Failed:', e);
                this.lobby.showError('P2P 연결 실패. 다시 시도해주세요.');
                this.lobby.showScreen('room-screen');
            }
        });

        this.network.on('gameState', (msg) => {
            // 비호스트: 호스트 상태 그대로 적용 (단일 소스)
            if (!this.network.isHost && msg.state) {
                this.physics.setState(msg.state);
            }
        });

        this.network.on('input', (msg) => {
            // 호스트: 원격 플레이어 입력 수신
            if (this.network.isHost && msg.input && msg.slotIndex !== undefined) {
                if (this._remotePlayerInputs) {
                    this._remotePlayerInputs.set(msg.slotIndex, msg.input);
                }
            }
        });

        this.network.on('gameEvent', (msg) => {
            // 비호스트: 호스트의 이벤트 효과 재생
            if (!this.network.isHost) {
                if (msg.event === 'hit') {
                    this.sound.playHit(msg.intensity || 0.5);
                    this.renderer.spawnHitParticles(msg.x, msg.y, msg.color);
                    if (msg.intensity > 0.6) this.renderer.shake(msg.intensity * 6);
                } else if (msg.event === 'scored') {
                    this.sound.playScore(msg.team);
                    this.renderer.spawnScoreParticles(msg.team);
                    this.renderer.shake(8);
                    this.renderer.showMessage(`${msg.scores[0]} - ${msg.scores[1]}`, CONFIG.POINT_FREEZE);
                } else if (msg.event === 'setWon') {
                    this.sound.playScore(msg.setWinner);
                    this.renderer.shake(10);
                    this.renderer.showMessage(`Set ${msg.setNumber}! (${msg.setsWon[0]}-${msg.setsWon[1]})`, 1800);
                } else if (msg.event === 'gameOver') {
                    this.running = false;
                    const won = msg.winner === this.myTeam;
                    this.sound.playGameOver(won);
                    this.renderer.shake(12);
                    setTimeout(() => {
                        this.lobby.showGameOver(msg.winner, msg.setsWon, this.myTeam, msg.setScores, msg.mvp);
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
