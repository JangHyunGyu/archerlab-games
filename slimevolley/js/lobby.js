// Lobby and Room UI Manager
class LobbyManager {
    constructor(game) {
        this.game = game;
        this.currentScreen = 'main-menu';
        this.playerName = localStorage.getItem('sv_playerName') || '';
        this.roomPlayers = [];
        this.roomListRefreshTimer = null;
        this.isHost = false;
        this.pendingJoinRoom = null; // 비밀방 입장 대기용
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Header back button: go to main menu if not already there
        document.getElementById('header-back').addEventListener('click', (e) => {
            if (this.currentScreen !== 'main-menu') {
                e.preventDefault();
                this.game.sound.playUI('click');
                this.showScreen('main-menu');
            }
        });

        // Main menu
        document.getElementById('btn-practice').addEventListener('click', () => {
            this.game.sound.playUI('click');
            this.showScreen('practice-setup');
        });

        document.getElementById('btn-multiplayer').addEventListener('click', () => {
            this.game.sound.playUI('click');
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
            // 방 만들기 화면 초기화
            document.querySelectorAll('.room-type-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('btn-type-public').classList.add('active');
            document.getElementById('password-group').style.display = 'none';
            document.getElementById('create-password').value = '';
            this.showScreen('create-room');
        });

        document.getElementById('btn-back-multiplayer').addEventListener('click', () => {
            this.game.sound.playUI('click');
            this.stopRoomListRefresh();
            this.showScreen('main-menu');
        });

        // Create room - room type toggle
        document.querySelectorAll('.room-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.room-type-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const isPrivate = btn.dataset.type === 'private';
                document.getElementById('password-group').style.display = isPrivate ? '' : 'none';
                if (isPrivate) document.getElementById('create-password').focus();
            });
        });

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
            // 시작 조건 재검증 + 알림
            const teams = [[], []];
            for (const p of this.roomPlayers) teams[p.team || 0].push(p);
            if (teams[0].length === 0 || teams[1].length === 0) {
                this.showError('양 팀 모두 최소 1명이 필요합니다');
                return;
            }
            const allReady = this.roomPlayers.filter(p => !p.isHost).every(p => p.ready || p.isBot);
            if (!allReady) {
                this.showError('모든 플레이어가 Ready 상태여야 합니다');
                return;
            }
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

        // Password modal
        document.getElementById('btn-pw-cancel').addEventListener('click', () => {
            this.hidePasswordModal();
        });
        document.getElementById('btn-pw-confirm').addEventListener('click', () => {
            this.confirmPasswordJoin();
        });
        document.getElementById('join-password').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.confirmPasswordJoin();
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
            const isPrivate = room.metadata?.password;
            item.className = `room-item ${isPlaying ? 'room-playing' : 'room-waiting'}`;

            const sets = room.metadata?.sets || 1;
            const score = room.metadata?.scorePerSet || 25;
            const setsLabel = sets === 1 ? '단판' : `${sets}세트`;

            item.innerHTML = `
                <div class="room-info">
                    <span class="room-host">${this.escapeHtml(room.hostName || 'Host')}${isPrivate ? '<span class="room-lock-icon">&#128274;</span>' : ''}</span>
                    <span class="room-detail">${room.playerCount}명 | ${setsLabel} ${score}점</span>
                </div>
                <div class="room-status">
                    <span class="room-status-badge ${isPlaying ? 'status-playing' : 'status-waiting'}">${isPlaying ? '경기중' : '대기중'}</span>
                </div>
            `;

            if (!isPlaying) {
                item.style.cursor = 'pointer';
                item.addEventListener('click', () => {
                    this.game.sound.playUI('click');
                    this.tryJoinRoom(room);
                });
            }

            listEl.appendChild(item);
        }
    }

    // === Password Modal ===
    tryJoinRoom(room) {
        const name = this.getNameFromInput();
        if (!name) return;

        if (room.metadata?.password) {
            // 비밀방: 비밀번호 입력 팝업
            this.pendingJoinRoom = room;
            document.getElementById('join-password').value = '';
            document.getElementById('password-modal').style.display = '';
            setTimeout(() => document.getElementById('join-password').focus(), 100);
        } else {
            this.doJoinRoom(room.roomId);
        }
    }

    hidePasswordModal() {
        document.getElementById('password-modal').style.display = 'none';
        this.pendingJoinRoom = null;
    }

    confirmPasswordJoin() {
        const pw = document.getElementById('join-password').value.trim();
        if (!pw || pw.length !== 4 || !/^\d{4}$/.test(pw)) {
            this.showError('숫자 4자리를 입력해주세요');
            return;
        }
        if (!this.pendingJoinRoom) return;

        this.doJoinRoom(this.pendingJoinRoom.roomId, pw);
        this.hidePasswordModal();
    }

    // === Create Room ===
    async createRoom() {
        const name = this.playerName;
        if (!name) {
            this.showError('닉네임을 먼저 입력해주세요');
            return;
        }

        const isPrivate = document.querySelector('.room-type-btn.active')?.dataset.type === 'private';
        let password = null;
        if (isPrivate) {
            password = document.getElementById('create-password').value.trim();
            if (!password || password.length !== 4 || !/^\d{4}$/.test(password)) {
                this.showError('비밀번호는 숫자 4자리로 입력해주세요');
                document.getElementById('create-password').focus();
                return;
            }
        }

        const sets = parseInt(document.getElementById('create-sets').value);
        const scorePerSet = parseInt(document.getElementById('create-score').value);
        const deuce = document.getElementById('create-deuce').checked;

        try {
            this.game.network.disconnect();
            await this.game.network.createRoom(this.game.relayUrl, name, password);
            this.game.network.setMetadata({ sets, scorePerSet, deuce, password: !!password });
            this.stopRoomListRefresh();
        } catch (e) {
            this.showError('서버 연결 실패. 잠시 후 다시 시도해주세요.');
        }
    }

    // === Join Room ===
    async doJoinRoom(roomId, password) {
        try {
            this.game.network.disconnect();
            await this.game.network.joinRoom(this.game.relayUrl, roomId, this.playerName, password);
            this.stopRoomListRefresh();
        } catch (e) {
            const msg = e.message || '';
            if (msg.includes('password') || msg.includes('Wrong')) {
                this.showError('비밀번호가 틀렸습니다');
            } else {
                this.showError('방에 입장할 수 없습니다');
            }
        }
    }

    // === Room Screen ===
    showRoomScreen(roomId, players, isHost, metadata) {
        this.isHost = isHost;
        // 방 유형 표시
        const typeEl = document.getElementById('room-type-display');
        const isPrivate = metadata?.password;
        typeEl.innerHTML = isPrivate
            ? '<span class="room-type-badge badge-private">&#128274; 비밀방</span>'
            : '<span class="room-type-badge badge-public">공개방</span>';
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

                let pingHtml = '';
                if (!p.isBot) {
                    const ping = this.getPingForPlayer(p.id);
                    const pingClass = ping < 50 ? 'ping-good' : ping < 100 ? 'ping-ok' : 'ping-bad';
                    pingHtml = `<span class="player-ping ${pingClass}" data-player-ping="${p.id}">${ping}ms</span>`;
                }

                let actionBtn = '';
                if (this.isHost && !p.isHost && !p.isBot) {
                    actionBtn = `<button class="btn-kick" data-id="${p.id}" title="강퇴">&#10005;</button>`;
                } else if (this.isHost && p.isBot) {
                    actionBtn = `<button class="btn-kick btn-remove-bot" data-bot-id="${p.id}" title="봇 제거">&#10005;</button>`;
                }

                pDiv.innerHTML = `
                    <span class="player-name">${this.escapeHtml(p.name)}</span>
                    ${pingHtml}${badges}${actionBtn}
                `;

                if (this.isHost && !p.isHost && !p.isBot) {
                    pDiv.querySelector('.btn-kick').addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.game.network.send({ type: 'kick', targetId: p.id });
                    });
                } else if (this.isHost && p.isBot) {
                    pDiv.querySelector('.btn-remove-bot').addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.game.network.removeBot(p.id, p.team);
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

            // 호스트: 봇 추가 버튼
            if (this.isHost && teams[t].length < maxPerTeam) {
                const addBotBtn = document.createElement('button');
                addBotBtn.className = 'btn-add-bot';
                addBotBtn.textContent = '+ Bot';
                addBotBtn.addEventListener('click', () => {
                    this.game.network.addBot(t);
                });
                teamDiv.appendChild(addBotBtn);
            }

            listEl.appendChild(teamDiv);
        }

        const allReady = players.filter(p => !p.isHost).every(p => p.ready || p.isBot);
        const hasPlayers = players.length >= 2;
        const bothTeamsHavePlayers = teams[0].length > 0 && teams[1].length > 0;
        const startBtn = document.getElementById('btn-start-game');
        startBtn.disabled = !allReady || !hasPlayers || !bothTeamsHavePlayers;
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
    showGameOver(winner, scores, myTeam, setScores, mvp) {
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

        let mvpEl = document.getElementById('game-over-mvp');
        if (!mvpEl) {
            mvpEl = document.createElement('div');
            mvpEl.id = 'game-over-mvp';
            mvpEl.className = 'game-over-mvp';
            const setsContainer = document.getElementById('game-over-sets');
            setsContainer.parentNode.insertBefore(mvpEl, setsContainer.nextSibling);
        }

        if (mvp && mvp.length > 0) {
            const names = mvp.map(m => this.escapeHtml(m.nickname || '???')).join(', ');
            const stats = mvp.map(m =>
                `${this.escapeHtml(m.nickname || '???')} (Kill: ${m.kills}, Receive: ${m.receives})`
            ).join('<br>');
            mvpEl.innerHTML = `<div class="mvp-title">MVP</div><div class="mvp-names">${names}</div><div class="mvp-stats">${stats}</div>`;
        } else {
            mvpEl.innerHTML = '';
        }

        this.showScreen('game-over');
    }

    getPingForPlayer(playerId) {
        const pings = this.game.network.playerPings;
        return pings[playerId] || 0;
    }

    updatePingDisplay(pings) {
        for (const [playerId, ping] of Object.entries(pings)) {
            const el = document.querySelector(`[data-player-ping="${playerId}"]`);
            if (el) {
                el.textContent = `${ping}ms`;
                el.className = `player-ping ${ping < 50 ? 'ping-good' : ping < 100 ? 'ping-ok' : 'ping-bad'}`;
            }
        }
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
