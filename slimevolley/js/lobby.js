// Lobby and Room UI Manager
class LobbyManager {
    constructor(game) {
        this.game = game;
        this.currentScreen = 'main-menu';
        this.playerName = localStorage.getItem('sv_playerName') || '';
        this.roomPlayers = [];
        this.roomListRefreshTimer = null;
        this.isHost = false;
        this.roomMetadata = null;
        this.lastRooms = [];
        this.gameOverState = null;
        this.pendingJoinRoom = null; // 비밀방 입장 대기용
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Header back button: go to main menu if not already there
        document.getElementById('header-back').addEventListener('click', (e) => {
            if (this.currentScreen === 'main-menu') return;
            e.preventDefault();
            this.game.sound.playUI('click');

            // 게임 중이면 확인창 표시 (실수 방지)
            if (this.currentScreen === 'game-screen' && this.game.running) {
                this.showConfirm(this.t('confirm.leaveGame', '게임을 나가시겠습니까?'), () => {
                    this.game.backToLobby();
                    this.showScreen('main-menu');
                });
                return;
            }

            // 방 화면에서도 확인
            if (this.currentScreen === 'room-screen') {
                this.showConfirm(this.t('confirm.leaveRoom', '방을 나가시겠습니까?'), () => {
                    this.leaveRoom();
                    this.showScreen('main-menu');
                });
                return;
            }

            this.showScreen('main-menu');
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
            const blockedReason = this.getStartBlockedReason();
            if (blockedReason) {
                this.game.sound.playUI('click');
                this.showInfo(blockedReason);
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

        // Confirm modal
        document.getElementById('btn-confirm-yes').addEventListener('click', () => {
            const cb = this._confirmCallback;
            this.hideConfirmModal();
            if (cb) cb();
        });
        document.getElementById('btn-confirm-no').addEventListener('click', () => {
            this.hideConfirmModal();
        });

        document.getElementById('btn-info-ok')?.addEventListener('click', () => {
            this.hideInfo();
        });

        window.addEventListener('slimevolley:languagechange', () => {
            this.refreshLocalizedContent();
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

    showConfirm(message, onConfirm) {
        const modal = document.getElementById('confirm-modal');
        if (!modal) { onConfirm(); return; }
        document.getElementById('confirm-message').textContent = message;
        modal.style.display = '';
        this._confirmCallback = onConfirm;
    }

    hideConfirmModal() {
        const modal = document.getElementById('confirm-modal');
        if (modal) modal.style.display = 'none';
        this._confirmCallback = null;
    }

    showInfo(message) {
        const modal = document.getElementById('info-modal');
        if (!modal) {
            this.showError(message);
            return;
        }
        document.getElementById('info-message').textContent = message;
        modal.style.display = '';
    }

    hideInfo() {
        const modal = document.getElementById('info-modal');
        if (modal) modal.style.display = 'none';
    }

    t(key, fallback) {
        const i18n = window.SlimeVolleyI18n;
        return i18n ? i18n.t(key) : fallback;
    }

    format(key, fallback, values = {}) {
        let text = this.t(key, fallback);
        for (const [name, value] of Object.entries(values)) {
            text = text.replaceAll(`{${name}}`, value);
        }
        return text;
    }

    refreshLocalizedContent() {
        if (this.currentScreen === 'multiplayer-lobby') {
            this.renderRoomList(this.lastRooms);
        }

        if (this.currentScreen === 'room-screen') {
            this.renderRoomTypeDisplay();
            this.updateRoomMeta(this.roomMetadata);
            this.updatePlayerList(this.roomPlayers);
            this.syncReadyButtonLabel();
        }

        if (this.currentScreen === 'game-over' && this.gameOverState) {
            this.renderGameOver();
        }
    }

    getNameFromInput() {
        const input = document.querySelector('#multiplayer-lobby .player-name-input');
        if (!input) return null;
        const name = input.value.trim();
        if (!name) {
            this.showError(this.t('error.enterNickname', '닉네임을 입력해주세요'));
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
            listEl.innerHTML = `<div class="room-list-empty">${this.t('lobby.loadFailed', '서버 연결 실패')}</div>`;
        }
    }

    renderRoomList(rooms) {
        this.lastRooms = rooms;
        const listEl = document.getElementById('room-list');

        if (rooms.length === 0) {
            listEl.innerHTML = `<div class="room-list-empty">${this.t('lobby.empty', '열린 방이 없습니다. 새로 만들어보세요!')}</div>`;
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
            const setsLabel = sets === 1
                ? this.t('room.setSingle', '단판')
                : this.format('room.setBestOf', `${sets}세트`, { sets, wins: Math.ceil(sets / 2) });
            const playerCount = this.format('lobby.playerCount', `${room.playerCount}명`, { count: room.playerCount });
            const scoreLabel = this.format('room.points', `${score}점`, { score });
            const statusLabel = isPlaying
                ? this.t('lobby.statusPlaying', '경기중')
                : this.t('lobby.statusWaiting', '대기중');

            item.innerHTML = `
                <div class="room-info">
                    <span class="room-host">${this.escapeHtml(room.hostName || this.t('room.host', '방장'))}${isPrivate ? '<span class="room-lock-icon">&#128274;</span>' : ''}</span>
                    <span class="room-detail">${playerCount} | ${setsLabel} ${scoreLabel}</span>
                </div>
                <div class="room-status">
                    <span class="room-status-badge ${isPlaying ? 'status-playing' : 'status-waiting'}">${statusLabel}</span>
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
            this.showError(this.t('error.enterFourDigits', '숫자 4자리를 입력해주세요'));
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
            this.showError(this.t('error.enterNicknameFirst', '닉네임을 먼저 입력해주세요'));
            return;
        }

        const isPrivate = document.querySelector('.room-type-btn.active')?.dataset.type === 'private';
        let password = null;
        if (isPrivate) {
            password = document.getElementById('create-password').value.trim();
            if (!password || password.length !== 4 || !/^\d{4}$/.test(password)) {
                this.showError(this.t('error.passwordFourDigits', '비밀번호는 숫자 4자리로 입력해주세요'));
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
            this.showError(this.t('error.serverRetry', '서버 연결 실패. 잠시 후 다시 시도해주세요.'));
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
                this.showError(this.t('error.passwordWrong', '비밀번호가 틀렸습니다'));
            } else {
                this.showError(this.t('error.joinFailed', '방에 입장할 수 없습니다'));
            }
        }
    }

    // === Room Screen ===
    showRoomScreen(roomId, players, isHost, metadata) {
        this.isHost = isHost;
        this.roomMetadata = metadata || null;
        this.renderRoomTypeDisplay();
        this.updateRoomMeta(metadata);
        this.updatePlayerList(players);
        document.getElementById('btn-start-game').style.display = isHost ? 'block' : 'none';
        document.getElementById('btn-ready').style.display = isHost ? 'none' : 'block';
        this.syncReadyButtonLabel();
        this.clearChat();
        this.showScreen('room-screen');
    }

    renderRoomTypeDisplay(metadata = this.roomMetadata) {
        const typeEl = document.getElementById('room-type-display');
        if (!typeEl) return;

        const isPrivate = metadata?.password;
        typeEl.innerHTML = isPrivate
            ? `<span class="room-type-badge badge-private">&#128274; ${this.t('room.private', '비밀방')}</span>`
            : `<span class="room-type-badge badge-public">${this.t('room.public', '공개방')}</span>`;
    }

    updateRoomMeta(metadata) {
        this.roomMetadata = metadata || null;
        const metaEl = document.getElementById('room-meta');
        if (!metadata) { metaEl.innerHTML = ''; return; }
        const sets = metadata.sets || 1;
        const score = metadata.scorePerSet || 25;
        const deuce = metadata.deuce !== false ? this.t('room.deuceOn', 'ON') : this.t('room.deuceOff', 'OFF');
        const setsLabel = sets === 1
            ? this.t('room.setSingle', '단판')
            : this.format('room.setBestOf', `${sets}세트 (${Math.ceil(sets / 2)}선승)`, { sets, wins: Math.ceil(sets / 2) });
        const scoreLabel = this.format('room.points', `${score}점`, { score });
        const deuceLabel = this.format('room.deuce', `듀스 ${deuce}`, { state: deuce });
        metaEl.innerHTML = `<span>${setsLabel}</span> · <span>${scoreLabel}</span> · <span>${deuceLabel}</span>`;
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
            teamDiv.innerHTML = `<div class="team-label">${t === 0 ? this.t('room.teamA', '팀 A (블루)') : this.t('room.teamB', '팀 B (레드)')}</div>`;

            for (const p of teams[t]) {
                const pDiv = document.createElement('div');
                pDiv.className = `player-item ${p.ready ? 'ready' : ''} ${p.isHost ? 'host' : ''} ${p.id === myId ? 'me' : ''}`;

                let badges = '';
                if (p.isHost) badges += `<span class="player-badge host-badge">${this.t('room.host', '방장')}</span>`;
                if (p.ready) badges += `<span class="player-badge ready-badge">${this.t('room.ready', '준비')}</span>`;
                if (p.isBot) badges += `<span class="player-badge bot-badge">${this.t('room.bot', '봇')}</span>`;

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
                emptyDiv.innerHTML = `<span class="player-name empty-slot">${this.t('room.empty', '비어 있음')}</span>`;
                teamDiv.appendChild(emptyDiv);
            }

            // 호스트: 봇 추가 버튼
            if (this.isHost && teams[t].length < maxPerTeam) {
                const addBotBtn = document.createElement('button');
                addBotBtn.className = 'btn-add-bot';
                addBotBtn.textContent = this.t('room.addBot', '+ 봇');
                addBotBtn.addEventListener('click', () => {
                    this.game.network.addBot(t);
                });
                teamDiv.appendChild(addBotBtn);
            }

            listEl.appendChild(teamDiv);
        }

        const allReady = players.filter(p => !p.isHost).every(p => p.ready || p.isBot);
        const bothTeamsHavePlayers = teams[0].length > 0 && teams[1].length > 0;
        const startBtn = document.getElementById('btn-start-game');
        const blockedReason = !bothTeamsHavePlayers
            ? this.t('start.reason.needTwoTeams', '양 팀 모두 최소 1명 이상 있어야 시작할 수 있습니다.')
            : (!allReady ? this.t('start.reason.notReady', '아직 준비하지 않은 플레이어가 있습니다. 모든 플레이어가 Ready 상태여야 합니다.') : '');
        startBtn.disabled = false;
        startBtn.classList.toggle('is-disabled', !!blockedReason);
        startBtn.setAttribute('aria-disabled', String(!!blockedReason));
        startBtn.title = blockedReason;
    }

    getStartBlockedReason(players = this.roomPlayers) {
        const teams = [[], []];
        for (const p of players) teams[p.team || 0].push(p);
        if (teams[0].length === 0 || teams[1].length === 0) {
            return this.t('start.reason.needTwoTeams', '양 팀 모두 최소 1명 이상 있어야 시작할 수 있습니다.');
        }

        const notReadyPlayers = players.filter(p => !p.isHost && !(p.ready || p.isBot));
        if (notReadyPlayers.length > 0) {
            return this.t('start.reason.notReady', '아직 준비하지 않은 플레이어가 있습니다. 모든 플레이어가 Ready 상태여야 합니다.');
        }

        return '';
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
        this.syncReadyButtonLabel();
        this.game.network.setReady(isReady);
    }

    syncReadyButtonLabel() {
        const btn = document.getElementById('btn-ready');
        if (!btn) return;
        const isReady = btn.classList.contains('active');
        btn.textContent = isReady
            ? this.t('room.readyActive', '준비 완료')
            : this.t('room.ready', '준비');
    }

    leaveRoom() {
        this.game.backToLobby();
        this.game.sound.stopAll();
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
        this.gameOverState = { winner, scores, myTeam, setScores, mvp };
        this.renderGameOver();
        this.showScreen('game-over');
    }

    renderGameOver() {
        if (!this.gameOverState) return;
        const { winner, scores, myTeam, setScores, mvp } = this.gameOverState;
        const won = winner === myTeam;
        document.getElementById('game-over-title').textContent = won
            ? this.t('gameOver.victory', '승리!')
            : this.t('gameOver.defeat', '패배');
        document.getElementById('game-over-title').className = won ? 'victory' : 'defeat';
        document.getElementById('game-over-score').textContent = `${scores[0]} - ${scores[1]}`;

        const setsEl = document.getElementById('game-over-sets');
        if (setScores && setScores.length > 1) {
            setsEl.innerHTML = setScores.map((s, i) =>
                `<span class="set-score">${this.t('gameOver.set', '세트')} ${i + 1}: ${s[0]}-${s[1]}</span>`
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
