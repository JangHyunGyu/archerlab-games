// WebSocket Network Client for Multiplayer (범용 relay 서버 대응)
class NetworkClient {
    constructor(gameId) {
        this.gameId = gameId || 'slimevolley';
        this.ws = null;
        this.connected = false;
        this.roomCode = null;
        this.playerId = null;
        this.isHost = false;
        this.handlers = {};
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.baseUrl = null;
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

    // 방 생성 (WebSocket 연결과 동시에)
    createRoom(baseUrl, playerName) {
        const url = `${baseUrl}/ws?game=${encodeURIComponent(this.gameId)}&action=create&name=${encodeURIComponent(playerName)}`;
        this.baseUrl = baseUrl;
        return this._connect(url);
    }

    // 방 참가 (WebSocket 연결과 동시에)
    joinRoom(baseUrl, roomCode, playerName) {
        const url = `${baseUrl}/ws?game=${encodeURIComponent(this.gameId)}&action=join&room=${encodeURIComponent(roomCode.toUpperCase())}&name=${encodeURIComponent(playerName)}`;
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
                this.reconnectAttempts = 0;
                this.emit('connected');
                // resolve는 서버 응답(roomCreated/joined) 받을 때
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    this.handleMessage(msg);

                    // 첫 응답으로 resolve
                    if (msg.type === 'roomCreated' || msg.type === 'joined') {
                        clearTimeout(timeout);
                        resolve(msg);
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

    handleMessage(msg) {
        switch (msg.type) {
            case 'roomCreated':
                this.roomCode = msg.roomCode;
                this.playerId = msg.playerId;
                this.isHost = true;
                this.emit('roomCreated', msg);
                break;

            case 'joined':
                this.roomCode = msg.roomCode;
                this.playerId = msg.playerId;
                this.isHost = false;
                this.emit('joined', msg);
                break;

            default:
                this.emit(msg.type, msg);
                break;
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
        this.send({ type: 'input', input });
    }

    sendGameState(state) {
        this.send({ type: 'gameState', state });
    }

    sendGameEvent(eventData) {
        this.send({ type: 'gameEvent', ...eventData });
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
        this.roomCode = null;
        this.playerId = null;
        this.isHost = false;
    }

    disconnect() {
        this.roomCode = null;
        this.playerId = null;
        this.isHost = false;
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
