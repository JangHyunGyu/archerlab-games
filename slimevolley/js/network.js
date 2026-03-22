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
        this.playerPings = {};
        this.lastSentInput = null;
        this.mySlotIndex = 0;

        // PeerJS P2P
        this.peerjs = new PeerJSManager();
        this.p2pReady = false;
        this.p2pPings = {};

        // P2P 메시지 수신 → 이벤트 emit
        this.peerjs.onMessage = (peerId, data) => {
            this.emit(data.type, data);
        };

        this.peerjs.onPeerConnected = (peerId) => {
            console.log(`%c[P2P] Peer connected: ${peerId}`, 'color: #66BB6A; font-weight: bold');
            this.p2pReady = true;
            this.emit('p2pReady');
            // 즉시 핑 1회 측정 + 루프 시작
            this.peerjs.pingPeer(peerId);
            this._startP2PPingLoop();
        };

        this.peerjs.onPeerDisconnected = (peerId) => {
            console.log(`%c[P2P] Peer disconnected: ${peerId}`, 'color: #EF5350');
            this.p2pReady = this.peerjs.connected;
        };

        this.peerjs._onPingResult = (peerId, rtt) => {
            this.p2pPings[peerId] = Math.round(rtt);
            // P2P 핑을 서버에 보고 → 로비에 P2P 핑 표시
            this.myPing = Math.round(rtt);
            this.send({ type: 'reportPing', ping: this.myPing });
        };
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

            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
                this.ws.close();
            }, 8000);

            this.ws.onopen = () => {
                clearTimeout(timeout);
                this.connected = true;
                this.startPingLoop();
                this.emit('connected');
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    this.handleMessage(msg);

                    if (msg.type === 'roomCreated' || msg.type === 'joined') {
                        clearTimeout(timeout);
                        resolve(msg);
                    } else if (msg.type === 'error') {
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
                this.emit('disconnected', { code: event.code, reason: event.reason });
            };

            this.ws.onerror = (error) => {
                clearTimeout(timeout);
                this.emit('error', error);
                reject(error);
            };
        });
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    // === 게임 데이터: PeerJS P2P 전용 (WS 안 씀) ===

    sendGameState(state) {
        this.peerjs.broadcast({ type: 'gameState', state });
    }

    sendGameEvent(eventData) {
        this.peerjs.broadcast({ type: 'gameEvent', ...eventData });
    }

    sendInput(input) {
        const last = this.lastSentInput;
        if (last && last.left === input.left && last.right === input.right && last.jump === input.jump) {
            return;
        }
        this.lastSentInput = { ...input };
        this.peerjs.broadcast({ type: 'input', input, slotIndex: this.mySlotIndex });
    }

    // === PeerJS P2P 연결 ===

    async initP2P() {
        try {
            if (this.isHost) {
                await this.peerjs.createHost(this.roomId);
                console.log('[P2P] Host peer created, waiting for connections...');
            } else {
                await this.peerjs.connectToHost(this.roomId);
                console.log('[P2P] Connected to host!');
            }
        } catch (e) {
            console.error('[P2P] Connection failed:', e);
            throw e;
        }
    }

    _startP2PPingLoop() {
        if (this._p2pPingInterval) clearInterval(this._p2pPingInterval);
        this._p2pPingInterval = setInterval(() => {
            for (const [peerId] of this.peerjs.connections) {
                this.peerjs.pingPeer(peerId);
            }
        }, 2000);
    }

    handleMessage(msg) {
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
                if (msg.t) {
                    // P2P 핑이 있으면 P2P 핑 사용, 없으면 WS 핑
                    if (!this.p2pReady) {
                        this.myPing = Date.now() - msg.t;
                        this.send({ type: 'reportPing', ping: this.myPing });
                    }
                    // P2P 연결 시에는 _onPingResult에서 보고함
                }
                break;

            case 'pingUpdate':
                if (msg.pings) {
                    this.playerPings = msg.pings;
                    this.emit('pingUpdate', msg.pings);
                }
                break;

            // rtcSignal은 더 이상 사용하지 않음 (PeerJS가 자체 시그널링)

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
        this.playerPings = {};
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
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
