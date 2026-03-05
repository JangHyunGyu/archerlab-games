// Lobby and Room UI Manager
class LobbyManager {
    constructor(game) {
        this.game = game;
        this.currentScreen = 'main-menu';
        this.playerName = localStorage.getItem('sv_playerName') || '';
        this.roomPlayers = [];
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Main menu buttons
        document.getElementById('btn-practice').addEventListener('click', () => {
            this.game.sound.playUI('click');
            this.showScreen('practice-setup');
        });

        document.getElementById('btn-create-room').addEventListener('click', () => {
            this.game.sound.playUI('click');
            this.showScreen('create-room');
        });

        document.getElementById('btn-join-room').addEventListener('click', () => {
            this.game.sound.playUI('click');
            this.showScreen('join-room');
        });

        // Practice setup
        document.getElementById('btn-start-practice').addEventListener('click', () => {
            this.game.sound.playUI('start');
            this.startPractice();
        });

        document.getElementById('btn-back-practice').addEventListener('click', () => {
            this.game.sound.playUI('click');
            this.showScreen('main-menu');
        });

        // Create room
        document.getElementById('btn-do-create').addEventListener('click', () => {
            this.game.sound.playUI('click');
            this.createRoom();
        });

        document.getElementById('btn-back-create').addEventListener('click', () => {
            this.game.sound.playUI('click');
            this.showScreen('main-menu');
        });

        // Join room
        document.getElementById('btn-do-join').addEventListener('click', () => {
            this.game.sound.playUI('click');
            this.joinRoom();
        });

        document.getElementById('btn-back-join').addEventListener('click', () => {
            this.game.sound.playUI('click');
            this.showScreen('main-menu');
        });

        // Room screen
        document.getElementById('btn-ready').addEventListener('click', () => {
            this.game.sound.playUI('ready');
            this.toggleReady();
        });

        document.getElementById('btn-start-game').addEventListener('click', () => {
            this.game.sound.playUI('start');
            this.game.startMultiplayerGame();
        });

        document.getElementById('btn-leave-room').addEventListener('click', () => {
            this.game.sound.playUI('click');
            this.leaveRoom();
        });

        // Game over
        document.getElementById('btn-play-again').addEventListener('click', () => {
            this.game.sound.playUI('click');
            this.game.restartGame();
        });

        document.getElementById('btn-back-lobby').addEventListener('click', () => {
            this.game.sound.playUI('click');
            this.game.backToLobby();
            this.showScreen('main-menu');
        });

        // Sound toggle
        document.getElementById('btn-sound').addEventListener('click', () => {
            this.game.toggleSound();
        });

        // Player name input - save on change
        const nameInputs = document.querySelectorAll('.player-name-input');
        nameInputs.forEach(input => {
            input.value = this.playerName;
            input.addEventListener('input', (e) => {
                this.playerName = e.target.value.trim();
                localStorage.setItem('sv_playerName', this.playerName);
                // Sync all name inputs
                nameInputs.forEach(i => { if (i !== e.target) i.value = this.playerName; });
            });
        });

        // Enter key on room code input
        document.getElementById('join-code-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });

        // Copy room code
        document.getElementById('btn-copy-code').addEventListener('click', () => {
            const code = document.getElementById('room-code-display').textContent;
            navigator.clipboard.writeText(code).then(() => {
                const btn = document.getElementById('btn-copy-code');
                btn.textContent = 'Copied!';
                setTimeout(() => btn.textContent = 'Copy', 1500);
            });
        });
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
        this.currentScreen = screenId;
    }

    showError(message) {
        const el = document.getElementById('error-toast');
        el.textContent = message;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 3000);
    }

    startPractice() {
        const myTeamSize = parseInt(document.getElementById('practice-my-team').value);
        const botTeamSize = parseInt(document.getElementById('practice-bot-team').value);
        const difficulty = document.getElementById('practice-difficulty').value;

        this.game.startPractice(myTeamSize, botTeamSize, difficulty);
        this.showScreen('game-screen');
    }

    async createRoom() {
        const nameInput = document.querySelector('#create-room .player-name-input');
        const name = nameInput.value.trim();
        if (!name) {
            this.showError('이름을 입력해주세요');
            nameInput.focus();
            return;
        }
        this.playerName = name;
        localStorage.setItem('sv_playerName', name);

        try {
            this.game.network.disconnect();
            await this.game.network.createRoom(this.game.relayUrl, name);
        } catch (e) {
            this.showError('서버 연결 실패. 잠시 후 다시 시도해주세요.');
        }
    }

    async joinRoom() {
        const nameInput = document.querySelector('#join-room .player-name-input');
        const name = nameInput.value.trim();
        const code = document.getElementById('join-code-input').value.trim().toUpperCase();

        if (!name) {
            this.showError('이름을 입력해주세요');
            nameInput.focus();
            return;
        }
        if (!code || code.length < 4) {
            this.showError('방 코드를 입력해주세요');
            document.getElementById('join-code-input').focus();
            return;
        }

        this.playerName = name;
        localStorage.setItem('sv_playerName', name);

        try {
            this.game.network.disconnect();
            await this.game.network.joinRoom(this.game.relayUrl, code, name);
        } catch (e) {
            this.showError('서버 연결 실패');
        }
    }

    showRoomScreen(roomCode, players, isHost) {
        document.getElementById('room-code-display').textContent = roomCode;
        this.updatePlayerList(players);
        document.getElementById('btn-start-game').style.display = isHost ? 'block' : 'none';
        document.getElementById('btn-ready').style.display = isHost ? 'none' : 'block';
        this.showScreen('room-screen');
    }

    updatePlayerList(players) {
        this.roomPlayers = players;
        const listEl = document.getElementById('player-list');
        listEl.innerHTML = '';

        const teams = [[], []];
        for (const p of players) {
            teams[p.team || 0].push(p);
        }

        for (let t = 0; t < 2; t++) {
            const teamDiv = document.createElement('div');
            teamDiv.className = `team-group team-${t}`;
            teamDiv.innerHTML = `<div class="team-label">${t === 0 ? 'Team A (Blue)' : 'Team B (Red)'}</div>`;

            for (const p of teams[t]) {
                const pDiv = document.createElement('div');
                pDiv.className = `player-item ${p.ready ? 'ready' : ''} ${p.isHost ? 'host' : ''}`;
                pDiv.innerHTML = `
                    <span class="player-name">${this.escapeHtml(p.name)}</span>
                    ${p.isHost ? '<span class="player-badge host-badge">HOST</span>' : ''}
                    ${p.ready ? '<span class="player-badge ready-badge">READY</span>' : ''}
                    ${p.isBot ? '<span class="player-badge bot-badge">BOT</span>' : ''}
                `;
                teamDiv.appendChild(pDiv);
            }

            // Empty slots
            const maxPerTeam = 4;
            for (let i = teams[t].length; i < maxPerTeam; i++) {
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'player-item empty';
                emptyDiv.innerHTML = '<span class="player-name empty-slot">Empty</span>';
                teamDiv.appendChild(emptyDiv);
            }

            listEl.appendChild(teamDiv);
        }

        // Update start button state
        const allReady = players.filter(p => !p.isHost).every(p => p.ready || p.isBot);
        const hasPlayers = players.length >= 2;
        const startBtn = document.getElementById('btn-start-game');
        startBtn.disabled = !allReady || !hasPlayers;
    }

    toggleReady() {
        const btn = document.getElementById('btn-ready');
        const isReady = btn.classList.toggle('active');
        btn.textContent = isReady ? 'Ready!' : 'Ready';
        this.game.network.setReady(isReady);
    }

    leaveRoom() {
        this.game.network.leaveRoom();
        this.game.network.disconnect();
        this.showScreen('main-menu');
    }

    showGameOver(winner, scores, myTeam) {
        const won = winner === myTeam;
        document.getElementById('game-over-title').textContent = won ? 'Victory!' : 'Defeat';
        document.getElementById('game-over-title').className = won ? 'victory' : 'defeat';
        document.getElementById('game-over-score').textContent = `${scores[0]} - ${scores[1]}`;
        this.showScreen('game-over');
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
