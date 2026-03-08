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
        this.baseUrl = null;
        this.pingInterval = null;
        this.lastPing = 0;
        this.myPing = 0;
        this.playerPings = {};
        this.lastSentInput = null;
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

    sendFrameInput(frame, input) {
        this.send({ type: 'frameInput', frame, input });
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
        this.roomId = null;
        this.playerId = null;
        this.isHost = false;
    }

    disconnect() {
        this.stopPingLoop();
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
