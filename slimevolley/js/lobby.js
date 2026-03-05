// Lobby and Room UI Manager
class LobbyManager {
    constructor(game) {
        this.game = game;
        this.currentScreen = 'main-menu';
        this.playerName = localStorage.getItem('sv_playerName') || '';
        this.roomPlayers = [];
        this.roomListRefreshTimer = null;
        this.isHost = false;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Main menu
        document.getElementById('btn-practice').addEventListener('click', () => {
            this.game.sound.playUI('click');
            this.showScreen('practice-setup');
        });

        document.getElementById('btn-multiplayer').addEventListener('click', () => {
            this.game.sound.playUI('click');
            // 닉네임이 없으면 로비에서 입력하게
            this.showMultiplayerLobby();
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

        // Multiplayer lobby
        document.getElementById('btn-refresh-rooms').addEventListener('click', () => {
            this.game.sound.playUI('click');
            this.refreshRoomList();
        });

        document.getElementById('btn-create-room').addEventListener('click', () => {
            this.game.sound.playUI('click');
            const name = this.getNameFromInput();
            if (!name) return;
            this.showScreen('create-room');
        });

        document.getElementById('btn-back-multiplayer').addEventListener('click', () => {
            this.game.sound.playUI('click');
            this.stopRoomListRefresh();
            this.showScreen('main-menu');
        });

        // Create room
        document.getElementById('btn-do-create').addEventListener('click', () => {
            this.game.sound.playUI('click');
            this.createRoom();
        });

        document.getElementById('btn-back-create').addEventListener('click', () => {
            this.game.sound.playUI('click');
            this.showMultiplayerLobby();
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

        // Team switch
        document.getElementById('btn-switch-team').addEventListener('click', () => {
            this.game.sound.playUI('click');
            this.switchTeam();
        });

        // Chat
        const chatInput = document.getElementById('chat-input');
        const chatSend = document.getElementById('btn-chat-send');
        chatSend.addEventListener('click', () => this.sendChat());
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.sendChat();
        });

        // Game over
        document.getElementById('btn-play-again').addEventListener('click', () => {
            this.game.sound.playUI('click');
            this.game.restartGame();
        });

        document.getElementById('btn-gameover-lobby').addEventListener('click', () => {
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
                nameInputs.forEach(i => { if (i !== e.target) i.value = this.playerName; });
            });
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

    getNameFromInput() {
        const input = document.querySelector('#multiplayer-lobby .player-name-input');
        const name = input.value.trim();
        if (!name) {
            this.showError('닉네임을 입력해주세요');
            input.focus();
            return null;
        }
        this.playerName = name;
        localStorage.setItem('sv_playerName', name);
        return name;
    }

    // === Multiplayer Lobby ===
    showMultiplayerLobby() {
        this.showScreen('multiplayer-lobby');
        // 닉네임 인풋에 포커스
        const input = document.querySelector('#multiplayer-lobby .player-name-input');
        if (!input.value.trim()) {
            setTimeout(() => input.focus(), 100);
        }
        this.refreshRoomList();
        this.startRoomListRefresh();
    }

    startRoomListRefresh() {
        this.stopRoomListRefresh();
        this.roomListRefreshTimer = setInterval(() => this.refreshRoomList(), 5000);
    }

    stopRoomListRefresh() {
        if (this.roomListRefreshTimer) {
            clearInterval(this.roomListRefreshTimer);
            this.roomListRefreshTimer = null;
        }
    }

    async refreshRoomList() {
        const listEl = document.getElementById('room-list');
        try {
            const data = await this.game.network.fetchRooms(this.game.relayUrl);
            this.renderRoomList(data.rooms || []);
        } catch (e) {
            listEl.innerHTML = '<div class="room-list-empty">서버 연결 실패</div>';
        }
    }

    renderRoomList(rooms) {
        const listEl = document.getElementById('room-list');

        if (rooms.length === 0) {
            listEl.innerHTML = '<div class="room-list-empty">열린 방이 없습니다. 새로 만들어보세요!</div>';
            return;
        }

        listEl.innerHTML = '';
        for (const room of rooms) {
            const item = document.createElement('div');
            const isPlaying = room.gameStarted;
            item.className = `room-item ${isPlaying ? 'room-playing' : 'room-waiting'}`;

            const sets = room.metadata?.sets || 1;
            const score = room.metadata?.scorePerSet || 25;
            const setsLabel = sets === 1 ? '단판' : `${sets}세트`;

            item.innerHTML = `
                <div class="room-info">
                    <span class="room-host">${this.escapeHtml(room.hostName || 'Host')}</span>
                    <span class="room-detail">${room.playerCount}명 | ${setsLabel} ${score}점</span>
                </div>
                <div class="room-status">
                    <span class="room-status-badge ${isPlaying ? 'status-playing' : 'status-waiting'}">${isPlaying ? '경기중' : '대기중'}</span>
                    <span class="room-code-small">${room.roomCode}</span>
                </div>
            `;

            if (!isPlaying) {
                item.style.cursor = 'pointer';
                item.addEventListener('click', () => {
                    this.game.sound.playUI('click');
                    this.joinRoomByCode(room.roomCode);
                });
            }

            listEl.appendChild(item);
        }
    }

    // === Create Room ===
    async createRoom() {
        const name = this.playerName;
        if (!name) {
            this.showError('닉네임을 먼저 입력해주세요');
            return;
        }

        const sets = parseInt(document.getElementById('create-sets').value);
        const scorePerSet = parseInt(document.getElementById('create-score').value);
        const deuce = document.getElementById('create-deuce').checked;

        try {
            this.game.network.disconnect();
            await this.game.network.createRoom(this.game.relayUrl, name);
            this.game.network.setMetadata({ sets, scorePerSet, deuce });
            this.stopRoomListRefresh();
        } catch (e) {
            this.showError('서버 연결 실패. 잠시 후 다시 시도해주세요.');
        }
    }

    // === Join Room ===
    async joinRoomByCode(roomCode) {
        const name = this.getNameFromInput();
        if (!name) return;

        try {
            this.game.network.disconnect();
            await this.game.network.joinRoom(this.game.relayUrl, roomCode, name);
            this.stopRoomListRefresh();
        } catch (e) {
            this.showError('방에 입장할 수 없습니다');
        }
    }

    // === Room Screen ===
    showRoomScreen(roomCode, players, isHost, metadata) {
        this.isHost = isHost;
        document.getElementById('room-code-display').textContent = roomCode;
        this.updateRoomMeta(metadata);
        this.updatePlayerList(players);
        document.getElementById('btn-start-game').style.display = isHost ? 'block' : 'none';
        document.getElementById('btn-ready').style.display = isHost ? 'none' : 'block';
        this.clearChat();
        this.showScreen('room-screen');
    }

    updateRoomMeta(metadata) {
        const metaEl = document.getElementById('room-meta');
        if (!metadata) { metaEl.innerHTML = ''; return; }
        const sets = metadata.sets || 1;
        const score = metadata.scorePerSet || 25;
        const deuce = metadata.deuce !== false ? 'ON' : 'OFF';
        const setsLabel = sets === 1 ? '단판' : `${sets}세트 (${Math.ceil(sets / 2)}선승)`;
        metaEl.innerHTML = `<span>${setsLabel}</span> · <span>${score}점</span> · <span>듀스 ${deuce}</span>`;
    }

    updatePlayerList(players) {
        this.roomPlayers = players;
        const listEl = document.getElementById('player-list');
        listEl.innerHTML = '';
        const myId = this.game.network.playerId;

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
                pDiv.className = `player-item ${p.ready ? 'ready' : ''} ${p.isHost ? 'host' : ''} ${p.id === myId ? 'me' : ''}`;

                let badges = '';
                if (p.isHost) badges += '<span class="player-badge host-badge">HOST</span>';
                if (p.ready) badges += '<span class="player-badge ready-badge">READY</span>';
                if (p.isBot) badges += '<span class="player-badge bot-badge">BOT</span>';

                let kickBtn = '';
                if (this.isHost && !p.isHost && !p.isBot) {
                    kickBtn = `<button class="btn-kick" data-id="${p.id}" title="강퇴">✕</button>`;
                }

                pDiv.innerHTML = `
                    <span class="player-name">${this.escapeHtml(p.name)}</span>
                    ${badges}${kickBtn}
                `;

                // 강퇴 버튼 이벤트
                if (kickBtn) {
                    pDiv.querySelector('.btn-kick').addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.game.network.send({ type: 'kick', targetId: p.id });
                    });
                }

                teamDiv.appendChild(pDiv);
            }

            const maxPerTeam = 4;
            for (let i = teams[t].length; i < maxPerTeam; i++) {
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'player-item empty';
                emptyDiv.innerHTML = '<span class="player-name empty-slot">Empty</span>';
                teamDiv.appendChild(emptyDiv);
            }

            listEl.appendChild(teamDiv);
        }

        const allReady = players.filter(p => !p.isHost).every(p => p.ready || p.isBot);
        const hasPlayers = players.length >= 2;
        const startBtn = document.getElementById('btn-start-game');
        startBtn.disabled = !allReady || !hasPlayers;
    }

    switchTeam() {
        const myId = this.game.network.playerId;
        const me = this.roomPlayers.find(p => p.id === myId);
        if (me) {
            this.game.network.setTeam(me.team === 0 ? 1 : 0);
        }
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
        this.showMultiplayerLobby();
    }

    // === Chat ===
    clearChat() {
        const chatEl = document.getElementById('chat-messages');
        if (chatEl) chatEl.innerHTML = '';
    }

    addChatMessage(name, message) {
        const chatEl = document.getElementById('chat-messages');
        if (!chatEl) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-msg';
        msgDiv.innerHTML = `<span class="chat-name">${this.escapeHtml(name)}</span> ${this.escapeHtml(message)}`;
        chatEl.appendChild(msgDiv);
        chatEl.scrollTop = chatEl.scrollHeight;

        // 최대 50개 메시지 유지
        while (chatEl.children.length > 50) {
            chatEl.removeChild(chatEl.firstChild);
        }
    }

    sendChat() {
        const input = document.getElementById('chat-input');
        const msg = input.value.trim();
        if (!msg) return;
        this.game.network.send({ type: 'chat', message: msg });
        input.value = '';
    }

    // === Practice ===
    startPractice() {
        const myTeamSize = parseInt(document.getElementById('practice-my-team').value);
        const botTeamSize = parseInt(document.getElementById('practice-bot-team').value);
        const difficulty = document.getElementById('practice-difficulty').value;
        this.game.startPractice(myTeamSize, botTeamSize, difficulty);
        this.showScreen('game-screen');
    }

    // === Game Over ===
    showGameOver(winner, scores, myTeam, setScores) {
        const won = winner === myTeam;
        document.getElementById('game-over-title').textContent = won ? 'Victory!' : 'Defeat';
        document.getElementById('game-over-title').className = won ? 'victory' : 'defeat';
        document.getElementById('game-over-score').textContent = `${scores[0]} - ${scores[1]}`;

        const setsEl = document.getElementById('game-over-sets');
        if (setScores && setScores.length > 1) {
            setsEl.innerHTML = setScores.map((s, i) =>
                `<span class="set-score">Set ${i + 1}: ${s[0]}-${s[1]}</span>`
            ).join(' ');
        } else {
            setsEl.innerHTML = '';
        }

        this.showScreen('game-over');
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
