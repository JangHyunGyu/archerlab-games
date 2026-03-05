// Main Game Controller
class SlimeVolleyGame {
    constructor() {
        this.physics = new PhysicsEngine();
        this.renderer = null;
        this.sound = new SoundManager();
        this.network = new NetworkClient('slimevolley');
        this.lobby = null;
        this.bots = [];
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

        // Init sound on first user interaction
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
            // Prevent arrow key scrolling
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
                if (this.running) e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Mobile touch controls
        this.setupMobileControls();
    }

    setupMobileControls() {
        const leftBtn = document.getElementById('touch-left');
        const rightBtn = document.getElementById('touch-right');
        const jumpBtn = document.getElementById('touch-jump');

        if (!leftBtn) return;

        const setTouch = (btn, code, active) => {
            const handler = (e) => { e.preventDefault(); this.keys[code] = active; };
            btn.addEventListener(active ? 'touchstart' : 'touchend', handler, { passive: false });
            if (!active) btn.addEventListener('touchcancel', handler, { passive: false });
        };

        setTouch(leftBtn, 'ArrowLeft', true);
        setTouch(leftBtn, 'ArrowLeft', false);
        setTouch(rightBtn, 'ArrowRight', true);
        setTouch(rightBtn, 'ArrowRight', false);
        setTouch(jumpBtn, 'ArrowUp', true);
        setTouch(jumpBtn, 'ArrowUp', false);
    }

    getMyInput() {
        return {
            left: this.keys['ArrowLeft'] || this.keys['KeyA'] || false,
            right: this.keys['ArrowRight'] || this.keys['KeyD'] || false,
            jump: this.keys['ArrowUp'] || this.keys['KeyW'] || this.keys['Space'] || false,
        };
    }

    // === Practice Mode ===
    async startPractice(myTeamSize, botTeamSize, difficulty) {
        this.mode = 'practice';
        this.myTeam = 0;
        this.physics.reset();
        this.physics.initSlimes([myTeamSize, botTeamSize]);

        // Mark bots
        this.bots = [];
        for (const slime of this.physics.slimes) {
            if (slime.team === 1) {
                slime.isBot = true;
                this.bots.push(new BotAI(difficulty));
            } else if (slime.id > 0) {
                // Teammate bots (all except first slime on my team)
                slime.isBot = true;
                this.bots.push(new BotAI(difficulty));
            }
        }

        this.mySlimeId = 0; // First slime on team 0

        // Init renderer
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
        this.physics.freezeTimer = 30;

        if (this.gameLoop) {
            this.renderer.app.ticker.remove(this.gameLoop);
        }

        this.gameLoop = () => {
            if (!this.running) return;
            this.update();
            this.renderer.render(this.physics.getState());
        };

        this.renderer.app.ticker.add(this.gameLoop);
    }

    update() {
        // Apply my input
        const mySlime = this.physics.slimes.find(s => s.id === this.mySlimeId);
        if (mySlime) {
            mySlime.input = this.getMyInput();
        }

        // Apply bot inputs
        let botIdx = 0;
        for (const slime of this.physics.slimes) {
            if (slime.isBot) {
                if (botIdx < this.bots.length) {
                    slime.input = this.bots[botIdx].getInput(
                        slime, this.physics.ball, this.physics.slimes, this.physics
                    );
                    botIdx++;
                }
            }
        }

        // Send input to server in multiplayer
        if (this.mode === 'multiplayer' && this.network.isHost) {
            // Host runs physics and broadcasts state
        } else if (this.mode === 'multiplayer') {
            this.network.sendInput(this.getMyInput());
        }

        // Update physics
        const result = this.physics.update();

        if (result) {
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
            } else if (result.type === 'gameOver') {
                this.running = false;
                const won = result.winner === this.myTeam;
                this.sound.playGameOver(won);
                this.renderer.shake(12);

                setTimeout(() => {
                    this.lobby.showGameOver(result.winner, result.scores, this.myTeam);
                }, 1500);
            }
        }

        // Broadcast state in multiplayer (host only)
        if (this.mode === 'multiplayer' && this.network.isHost) {
            this.network.sendGameState(this.physics.getState());
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
        this.renderer.clearSlimes();
        this.renderer.clearBall();
    }

    // === Multiplayer ===
    setupNetworkHandlers() {
        this.network.on('roomCreated', (msg) => {
            this.lobby.showRoomScreen(msg.roomCode, msg.players, true);
        });

        this.network.on('joined', (msg) => {
            this.lobby.showRoomScreen(msg.roomCode, msg.players, false);
        });

        this.network.on('roomState', (msg) => {
            this.lobby.updatePlayerList(msg.players);
        });

        this.network.on('playerJoined', (msg) => {
            this.lobby.updatePlayerList(msg.players);
        });

        this.network.on('playerLeft', (msg) => {
            this.lobby.updatePlayerList(msg.players);
        });

        this.network.on('playerReady', (msg) => {
            this.lobby.updatePlayerList(msg.players);
        });

        this.network.on('gameStart', async (msg) => {
            this.mode = 'multiplayer';
            this.myTeam = msg.myTeam;
            this.mySlimeId = msg.mySlotIndex;

            this.physics.reset();
            this.physics.initSlimes(msg.teamSizes);

            if (!this.renderer.initialized) {
                await this.renderer.init();
            } else {
                this.renderer.clearSlimes();
                this.renderer.clearBall();
            }

            this.lobby.showScreen('game-screen');
            this.startCountdown();
        });

        this.network.on('gameState', (msg) => {
            if (!this.network.isHost && this.running) {
                this.physics.setState(msg.state);
            }
        });

        this.network.on('input', (msg) => {
            if (this.network.isHost) {
                const slime = this.physics.slimes.find(s => s.id === msg.playerId);
                if (slime) {
                    slime.input = msg.input;
                }
            }
        });

        this.network.on('gameEvent', (msg) => {
            if (msg.event === 'scored') {
                this.sound.playScore(msg.team);
                this.renderer.spawnScoreParticles(msg.team);
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
        this.network.startGame();
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
    window.game = game; // for debugging
});
