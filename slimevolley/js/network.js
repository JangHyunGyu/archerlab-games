// WebSocket Network Client for Multiplayer
// WS = 로비/시그널링 전용, 게임 데이터 = PeerJS P2P 전용
class NetworkClient {
    constructor(gameId) {
        this.gameId = gameId || 'slimevolley';
        this.ws = null;
        this.connected = false;
        this.roomCode = null;
        this.roomId = null;
        this.playerId = null;
        this.isHost = false;
        this.handlers = {};
        this.baseUrl = null;
        this.pingInterval = null;
        this.lastPing = 0;
        this.myPing = 0;
        this.smoothedRtt = 0;
        this.playerPings = {};
        this.lastSentInput = null;
        this.mySlotIndex = 0;
        this._stateSeq = 0;
        this._lastReceivedStateSeq = -1;
        this._inputSeq = 0;
        this._lastInputSentAt = 0;
        this._inputBurstRemaining = 0;
        this._eventId = 0;
        this._seenEventIds = new Set();
        this._seenEventOrder = [];

        // PeerJS P2P
        this.peerjs = new PeerJSManager();
        this.p2pReady = false;
        this.p2pPings = {};

        this._rebindPeerJSHandlers();
    }

    on(event, handler) {
        if (!this.handlers[event]) this.handlers[event] = [];
        this.handlers[event].push(handler);
    }

    off(event, handler) {
        if (!this.handlers[event]) return;
        this.handlers[event] = this.handlers[event].filter(h => h !== handler);
    }

    emit(event, data) {
        const handlers = this.handlers[event];
        if (handlers) {
            for (const h of handlers) h(data);
        }
    }

    // 방 목록 조회 (REST API)
    async fetchRooms(baseUrl) {
        const httpUrl = baseUrl.replace('wss://', 'https://').replace('ws://', 'http://');
        const res = await fetch(`${httpUrl}/api/rooms?game=${encodeURIComponent(this.gameId)}`);
        if (!res.ok) throw new Error('Failed to fetch rooms');
        return await res.json();
    }

    createRoom(baseUrl, playerName, password) {
        let url = `${baseUrl}/ws?game=${encodeURIComponent(this.gameId)}&action=create&name=${encodeURIComponent(playerName)}`;
        if (password) url += `&password=${encodeURIComponent(password)}`;
        this.baseUrl = baseUrl;
        return this._connect(url);
    }

    joinRoom(baseUrl, roomId, playerName, password) {
        let url = `${baseUrl}/ws?game=${encodeURIComponent(this.gameId)}&action=join&room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(playerName)}`;
        if (password) url += `&password=${encodeURIComponent(password)}`;
        this.baseUrl = baseUrl;
        return this._connect(url);
    }

    _connect(wsUrl) {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(wsUrl);
            } catch (e) {
                reject(e);
                return;
            }

            let settled = false;
            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error('Connection timeout'));
                try { this.ws.close(); } catch (e) {}
            }, 8000);

            this.ws.onopen = () => {
                this.connected = true;
                this.startPingLoop();
                this.emit('connected');
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    this.handleMessage(msg);

                    if (!settled && (msg.type === 'roomCreated' || msg.type === 'joined')) {
                        settled = true;
                        clearTimeout(timeout);
                        resolve(msg);
                    } else if (!settled && msg.type === 'error') {
                        settled = true;
                        clearTimeout(timeout);
                        reject(new Error(msg.message || 'Server error'));
                    }
                } catch (e) {
                    console.warn('Invalid message:', e);
                }
            };

            this.ws.onclose = (event) => {
                clearTimeout(timeout);
                this.connected = false;
                if (!settled) {
                    settled = true;
                    reject(new Error(event.reason || 'Connection closed'));
                }
                this.emit('disconnected', { code: event.code, reason: event.reason });
            };

            this.ws.onerror = (error) => {
                clearTimeout(timeout);
                this.emit('error', error);
                if (!settled) {
                    settled = true;
                    reject(error);
                }
            };
        });
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify(data));
                return true;
            } catch (e) {
                return false;
            }
        }
        return false;
    }

    // === 게임 데이터: PeerJS P2P 전용 (WS 안 씀) ===

    static _round2(n) {
        return Math.round(n * 100) / 100;
    }

    _quantizeState(state) {
        if (!this._wireState) {
            this._wireState = {
                ball: { x: 0, y: 0, vx: 0, vy: 0, lastHitBy: -1, lastHitSlimeId: -1 },
                slimes: [],
                scores: [0, 0],
                phase: '',
                servingTeam: 0,
                setsWon: [0, 0],
                currentSet: 0,
            };
        }
        const ws = this._wireState;
        const round2 = NetworkClient._round2;
        ws.ball.x = round2(state.ball.x);
        ws.ball.y = round2(state.ball.y);
        ws.ball.vx = round2(state.ball.vx);
        ws.ball.vy = round2(state.ball.vy);
        ws.ball.lastHitBy = state.ball.lastHitBy;
        ws.ball.lastHitSlimeId = state.ball.lastHitSlimeId;

        while (ws.slimes.length < state.slimes.length) {
            ws.slimes.push({ id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, onGround: true, colorIdx: 0 });
        }
        ws.slimes.length = state.slimes.length;
        for (let i = 0; i < state.slimes.length; i++) {
            const s = state.slimes[i];
            const c = ws.slimes[i];
            c.id = s.id;
            c.team = s.team;
            c.x = round2(s.x);
            c.y = round2(s.y);
            c.vx = round2(s.vx);
            c.vy = round2(s.vy);
            c.onGround = !!s.onGround;
            c.colorIdx = s.colorIdx;
        }

        ws.scores[0] = state.scores[0];
        ws.scores[1] = state.scores[1];
        ws.phase = state.phase;
        ws.servingTeam = state.servingTeam;
        ws.setsWon[0] = state.setsWon ? state.setsWon[0] : 0;
        ws.setsWon[1] = state.setsWon ? state.setsWon[1] : 0;
        ws.currentSet = state.currentSet || 0;
        return ws;
    }

    sendGameState(state, ackInputs = null) {
        this.peerjs.broadcastRealtime({
            type: 'gameState',
            state: this._quantizeState(state),
            seq: ++this._stateSeq,
            ack: ackInputs || undefined,
        });
    }

    sendGameEvent(eventData) {
        this.peerjs.broadcast({
            type: 'gameEvent',
            eventId: ++this._eventId,
            ...eventData,
        });
    }

    sendInput(input) {
        const last = this.lastSentInput;
        const changed = !last || last.left !== input.left || last.right !== input.right || last.jump !== input.jump;
        const now = performance.now();

        if (changed) {
            if (!this.lastSentInput) this.lastSentInput = { left: false, right: false, jump: false };
            this.lastSentInput.left = !!input.left;
            this.lastSentInput.right = !!input.right;
            this.lastSentInput.jump = !!input.jump;
            // Repeat an input edge on the next render frame so unordered low-latency
            // delivery can recover quickly from a single lost packet.
            this._inputBurstRemaining = 1;
        }

        const heartbeatDue = now - this._lastInputSentAt >= 50;
        if (!changed && !heartbeatDue && this._inputBurstRemaining <= 0) {
            return null;
        }

        if (!changed && this._inputBurstRemaining > 0) {
            this._inputBurstRemaining--;
        }
        this._lastInputSentAt = now;
        const seq = ++this._inputSeq;
        this.peerjs.broadcastRealtime({
            type: 'input',
            input: { left: !!input.left, right: !!input.right, jump: !!input.jump },
            slotIndex: this.mySlotIndex,
            seq,
        }, changed);
        return seq;
    }

    // === PeerJS P2P 연결 ===

    async initP2P(hostPlayerId) {
        // hostPlayerId 미지정 시: 호스트면 자기 ID, 비호스트면 인자 필수
        const hostId = hostPlayerId || (this.isHost ? this.playerId : null);
        if (!hostId) {
            throw new Error('initP2P: hostPlayerId required for non-host');
        }
        try {
            if (this.isHost) {
                await this.peerjs.createHost(this.roomId, hostId);
            } else {
                await this.peerjs.connectToHost(this.roomId, hostId);
            }
        } catch (e) {
            console.error('[P2P] Connection failed:', e);
            throw e;
        }
    }

    // 호스트 마이그레이션: 옛 PeerJS 정리하고 새 호스트로 재구성
    async migrateP2P(newHostPlayerId) {
        if (this._p2pPingInterval) {
            clearInterval(this._p2pPingInterval);
            this._p2pPingInterval = null;
        }
        this.peerjs.destroy();
        this.p2pReady = false;
        this.p2pPings = {};
        this.myPing = 0;
        this.smoothedRtt = 0;
        this.resetRealtimeState();

        // 짧은 정리 시간 확보
        await new Promise(r => setTimeout(r, 120));

        this.peerjs = new PeerJSManager();
        this._rebindPeerJSHandlers();

        await this.initP2P(newHostPlayerId);
    }

    // PeerJS 이벤트 핸들러 바인딩
    _rebindPeerJSHandlers() {
        this.peerjs.onMessage = (peerId, data) => {
            this.handleMessage(data);
        };
        this.peerjs.onPeerConnected = (peerId) => {
            this.p2pReady = true;
            this.emit('p2pReady');
            this.peerjs.pingPeer(peerId);
            this._startP2PPingLoop();
        };
        this.peerjs.onPeerDisconnected = (peerId) => {
            delete this.p2pPings[peerId];
            this.p2pReady = this.peerjs.connected;
        };
        this.peerjs._onPingResult = (peerId, rtt) => {
            const clampedRtt = Math.max(0, Math.min(2000, rtt));
            this.p2pPings[peerId] = Math.round(clampedRtt);
            const peerValues = Object.values(this.p2pPings);
            const avgRtt = peerValues.length > 0
                ? peerValues.reduce((sum, v) => sum + v, 0) / peerValues.length
                : clampedRtt;
            this.smoothedRtt = this.smoothedRtt > 0
                ? this.smoothedRtt * 0.75 + avgRtt * 0.25
                : avgRtt;
            this.myPing = Math.round(this.smoothedRtt);
            this.send({ type: 'reportPing', ping: this.myPing });
            this.emit('localPing', this.myPing);
        };
    }

    _startP2PPingLoop() {
        if (this._p2pPingInterval) clearInterval(this._p2pPingInterval);
        this._p2pPingInterval = setInterval(() => {
            for (const [peerId] of this.peerjs.connections) {
                this.peerjs.pingPeer(peerId);
            }
        }, 1000);
    }

    handleMessage(msg) {
        if (!msg || typeof msg !== 'object') return;
        switch (msg.type) {
            case 'roomCreated':
                this.roomId = msg.roomId;
                this.playerId = msg.playerId;
                this.isHost = true;
                this.emit('roomCreated', msg);
                break;

            case 'joined':
                this.roomId = msg.roomId;
                this.playerId = msg.playerId;
                this.isHost = false;
                this.emit('joined', msg);
                break;

            case 'pong':
                if (msg.t && !this.p2pReady) {
                    const rtt = Math.max(0, Date.now() - msg.t);
                    this.smoothedRtt = this.smoothedRtt > 0
                        ? this.smoothedRtt * 0.75 + rtt * 0.25
                        : rtt;
                    this.myPing = Math.round(this.smoothedRtt);
                    this.send({ type: 'reportPing', ping: this.myPing });
                    this.emit('localPing', this.myPing);
                }
                break;

            case 'pingUpdate':
                if (msg.pings) {
                    this.playerPings = msg.pings;
                    this.emit('pingUpdate', msg.pings);
                }
                break;

            case 'gameStart':
                this.resetRealtimeState();
                this.emit('gameStart', msg);
                break;

            case 'gameState':
                if (Number.isSafeInteger(msg.seq)) {
                    if (msg.seq <= this._lastReceivedStateSeq) return;
                    this._lastReceivedStateSeq = msg.seq;
                }
                this.emit('gameState', msg);
                break;

            case 'gameEvent':
                if (Number.isSafeInteger(msg.eventId)) {
                    if (this._seenEventIds.has(msg.eventId)) return;
                    this._seenEventIds.add(msg.eventId);
                    this._seenEventOrder.push(msg.eventId);
                    if (this._seenEventOrder.length > 200) {
                        const oldest = this._seenEventOrder.shift();
                        this._seenEventIds.delete(oldest);
                    }
                }
                this.emit('gameEvent', msg);
                break;

            case 'gameEnded':
                this.emit('gameEnded', msg);
                break;

            default:
                this.emit(msg.type, msg);
                break;
        }
    }

    startPingLoop() {
        this.stopPingLoop();
        this.pingInterval = setInterval(() => {
            if (this.connected) {
                this.ping();
            }
        }, 2000);
    }

    stopPingLoop() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    setTeam(team) {
        this.send({ type: 'setTeam', team });
    }

    setReady(ready) {
        this.send({ type: 'setReady', ready });
    }

    startGame(config) {
        this.send({ type: 'startGame', config });
    }

    endGame() {
        this.send({ type: 'gameEnded' });
    }

    setMetadata(metadata) {
        this.send({ type: 'setMetadata', metadata });
    }

    addBot(team, name) {
        this.send({ type: 'addBot', team, name });
    }

    removeBot(botId, team) {
        this.send({ type: 'removeBot', botId, team });
    }

    leaveRoom() {
        this.send({ type: 'leaveRoom' });
        this.roomId = null;
        this.playerId = null;
        this.isHost = false;
    }

    disconnect() {
        this.stopPingLoop();
        if (this._p2pPingInterval) {
            clearInterval(this._p2pPingInterval);
            this._p2pPingInterval = null;
        }
        this.peerjs.destroy();
        this.p2pReady = false;
        this.roomId = null;
        this.playerId = null;
        this.isHost = false;
        this.myPing = 0;
        this.smoothedRtt = 0;
        this.p2pPings = {};
        this.playerPings = {};
        this.resetRealtimeState();
        if (this.ws) {
            try { this.ws.close(); } catch (e) {}
            this.ws = null;
        }
        this.connected = false;
    }

    resetRealtimeState() {
        this._stateSeq = 0;
        this._lastReceivedStateSeq = -1;
        this._inputSeq = 0;
        this._lastInputSentAt = 0;
        this._inputBurstRemaining = 0;
        this._eventId = 0;
        this._seenEventIds.clear();
        this._seenEventOrder.length = 0;
        this.lastSentInput = null;
    }

    clearAllHandlers() {
        for (const event in this.handlers) {
            this.handlers[event] = [];
        }
    }

    ping() {
        this.send({ type: 'ping', t: Date.now() });
    }
}
