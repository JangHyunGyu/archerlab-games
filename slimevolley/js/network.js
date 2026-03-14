// WebSocket Network Client for Multiplayer (범용 relay 서버 대응)
// WebRTC P2P 지원: 게임 데이터는 P2P, 로비/시그널링은 WS
class NetworkClient {
    constructor(gameId) {
        this.gameId = gameId || 'slimevolley';
        this.ws = null;
        this.connected = false;
        this.roomCode = null;
        this.playerId = null;
        this.isHost = false;
        this.handlers = {};
        this.baseUrl = null;
        this.pingInterval = null;
        this.lastPing = 0;
        this.myPing = 0;
        this.playerPings = {};
        this.lastSentInput = null;

        // WebRTC P2P
        this.webrtc = new WebRTCManager();
        this.p2pReady = false;       // all game peers connected via P2P
        this.p2pPeers = [];          // peer player IDs to connect to
        this.p2pPings = {};          // peerId -> rtt ms
        this._p2pPingSent = {};      // peerId -> timestamp

        // Wire up WebRTC signaling through WebSocket
        this.webrtc.setSignalSender((targetId, signal) => {
            this.send({ type: 'rtcSignal', targetId, signal });
        });

        // Handle P2P messages (game data arriving via DataChannel)
        this.webrtc.onMessage = (peerId, data) => {
            this._handleP2PMessage(peerId, data);
        };

        this.webrtc.onPeerConnected = (peerId) => {
            console.log(`%c[P2P] Peer ${peerId} connected via DataChannel`, 'color: #4FC3F7; font-weight: bold');
            this._checkAllP2PReady();
        };

        this.webrtc.onPeerDisconnected = (peerId) => {
            console.log(`%c[P2P] Peer ${peerId} disconnected`, 'color: #EF5350');
            this.p2pReady = false;
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

    // === P2P game data send (with WS fallback) ===

    sendFrameInput(frame, input, history) {
        const msg = { type: 'frameInput', frame, input };
        if (history) msg.history = history;

        // Try P2P first, fall back to WS
        if (this.p2pReady && !this.webrtc.fallbackToWS) {
            // P2P는 서버가 slotIndex를 안 붙여주므로 직접 포함
            msg.slotIndex = this.mySlotIndex;
            if (this.webrtc.broadcast(msg)) return;
        }
        // WS fallback (서버가 slotIndex 붙여줌)
        this.send(msg);
    }

    sendGameState(state) {
        const msg = { type: 'gameState', state };
        if (this.p2pReady && !this.webrtc.fallbackToWS) {
            if (this.webrtc.broadcast(msg)) return;
        }
        this.send(msg);
    }

    sendGameEvent(eventData) {
        const msg = { type: 'gameEvent', ...eventData };
        if (this.p2pReady && !this.webrtc.fallbackToWS) {
            if (this.webrtc.broadcast(msg)) return;
        }
        this.send(msg);
    }

    // === P2P message handling ===

    _handleP2PMessage(peerId, data) {
        // P2P ping/pong for latency measurement
        if (data._p === 1) {
            // Pong back
            this.webrtc.sendToPeer(peerId, { _p: 2, _t: data._t });
            return;
        }
        if (data._p === 2) {
            // Pong received
            this.p2pPings[peerId] = performance.now() - data._t;
            return;
        }

        // Game data: emit as if it came from WS
        // Add slotIndex from the peer's player data if needed
        this.emit(data.type, data);
    }

    _checkAllP2PReady() {
        if (this.p2pPeers.length === 0) {
            // 피어 목록이 아직 비어있지만 연결된 피어가 있으면 보류
            if (this.webrtc.connected) {
                console.log('[P2P] peers list empty but WebRTC connected - deferring check');
                this._p2pDeferredCheck = true;
            }
            return;
        }
        for (const peerId of this.p2pPeers) {
            if (!this.webrtc.isPeerConnected(peerId)) {
                console.log(`[P2P] checkReady: peer ${peerId} not yet connected`);
                return;
            }
        }
        this.p2pReady = true;
        console.log('%c[P2P] All P2P connections established!', 'color: #4FC3F7; font-weight: bold');
        this.emit('p2pReady');

        // Start P2P ping measurement
        this._startP2PPingLoop();
    }

    _startP2PPingLoop() {
        if (this._p2pPingInterval) clearInterval(this._p2pPingInterval);
        this._p2pPingInterval = setInterval(() => {
            for (const peerId of this.p2pPeers) {
                this.webrtc.pingPeer(peerId);
            }
        }, 1000);
    }

    // === P2P connection initiation (called when game starts) ===

    initiateP2P(playerList, myPlayerId, mySlotIndex) {
        this.webrtc.setMyId(myPlayerId);
        this.mySlotIndex = mySlotIndex;
        this.p2pPeers = [];
        this.p2pReady = false;

        // Connect to all non-bot players except myself
        for (const p of playerList) {
            if (p.id !== myPlayerId && !p.isBot) {
                this.p2pPeers.push(p.id);
            }
        }

        if (this.p2pPeers.length === 0) {
            // No human peers (all bots), P2P not needed
            return;
        }

        console.log(`[P2P] initiateP2P: myId=${myPlayerId}, peers=${JSON.stringify(this.p2pPeers)}`);

        // Only the "lower" ID initiates to avoid duplicate offers
        for (const peerId of this.p2pPeers) {
            if (myPlayerId < peerId) {
                this.webrtc.connectToPeer(peerId);
            }
            // The other side will receive the offer and respond
        }

        // 피어 목록 설정 후 재확인 (이미 연결된 경우 대비)
        if (this._p2pDeferredCheck) {
            this._p2pDeferredCheck = false;
            this._checkAllP2PReady();
        }

        // Timeout: if P2P not ready in 5 seconds, fall back to WS
        setTimeout(() => {
            if (!this.p2pReady) {
                // 마지막으로 한번 더 확인 (race condition 방지)
                this._checkAllP2PReady();
                if (this.p2pReady) {
                    console.log('[P2P] Connected just in time!');
                    return;
                }
                console.log('%c[P2P] ✗ Connection timeout, using WebSocket fallback', 'color: #EF5350');
                this.webrtc.fallbackToWS = true;
                this.emit('p2pFallback');
            }
        }, 5000);
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
                    this.myPing = Date.now() - msg.t;
                    this.send({ type: 'reportPing', ping: this.myPing });
                }
                break;

            case 'pingUpdate':
                if (msg.pings) {
                    this.playerPings = msg.pings;
                    this.emit('pingUpdate', msg.pings);
                }
                break;

            case 'rtcSignal':
                // WebRTC signaling from a peer, relayed through WS
                if (msg.fromId && msg.signal) {
                    this.webrtc.handleSignal(msg.fromId, msg.signal);
                }
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

    sendInput(input) {
        const last = this.lastSentInput;
        if (last && last.left === input.left && last.right === input.right && last.jump === input.jump) {
            return;
        }
        this.lastSentInput = { ...input };
        this.send({ type: 'input', input });
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
        this.webrtc.destroy();
        this.p2pReady = false;
        this.p2pPeers = [];
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

    ping() {
        this.send({ type: 'ping', t: Date.now() });
    }
}
