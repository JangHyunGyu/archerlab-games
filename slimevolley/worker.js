// Archerlab Game Relay Server - Cloudflare Worker + Durable Objects
// 범용 WebSocket 방 관리/릴레이 서버 (모든 게임 공용)

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Upgrade',
};

function generateRoomId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 8; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
}

// --- Worker Entry ---
export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        // Health check
        if (path === '/' || path === '/health') {
            return new Response(JSON.stringify({
                service: 'archerlab-game-relay',
                version: '2.0.0',
                status: 'ok',
            }), {
                headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            });
        }

        // 방 목록 API
        if (path === '/api/rooms') {
            const game = url.searchParams.get('game');
            if (!game) {
                return new Response(JSON.stringify({ error: 'game parameter required' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
                });
            }
            const lobbyId = env.GAME_LOBBY.idFromName(`lobby:${game}`);
            const lobby = env.GAME_LOBBY.get(lobbyId);
            const res = await lobby.fetch(new Request(`http://internal/list?game=${game}`));
            const data = await res.json();
            return new Response(JSON.stringify(data), {
                headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            });
        }

        // WebSocket endpoint
        if (path === '/ws') {
            const upgradeHeader = request.headers.get('Upgrade');
            if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
                return new Response('Expected WebSocket', { status: 426 });
            }

            const game = url.searchParams.get('game');
            if (!game) {
                return new Response(JSON.stringify({ error: 'game parameter required' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
                });
            }

            const action = url.searchParams.get('action');
            const name = url.searchParams.get('name') || 'Player';
            const password = url.searchParams.get('password') || '';
            let roomId = url.searchParams.get('room');

            if (action === 'create') {
                roomId = generateRoomId();
            }

            if (!roomId) {
                return new Response(JSON.stringify({ error: 'room id required' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
                });
            }

            const doId = env.GAME_ROOM.idFromName(`${game}:${roomId}`);
            const room = env.GAME_ROOM.get(doId);

            const newUrl = new URL(request.url);
            newUrl.searchParams.set('game', game);
            newUrl.searchParams.set('room', roomId);
            newUrl.searchParams.set('action', action || 'join');
            newUrl.searchParams.set('name', name);
            newUrl.searchParams.set('password', password);

            return room.fetch(new Request(newUrl.toString(), request));
        }

        return new Response('Not Found', { status: 404 });
    },
};

// --- Durable Object: GameLobby (방 목록 관리) ---
export class GameLobby {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.rooms = null; // lazy loaded from storage
    }

    async loadRooms() {
        if (this.rooms) return;
        this.rooms = new Map(Object.entries((await this.state.storage.get('rooms')) || {}));
    }

    async saveRooms() {
        await this.state.storage.put('rooms', Object.fromEntries(this.rooms));
    }

    async fetch(request) {
        await this.loadRooms();
        const url = new URL(request.url);
        const path = url.pathname;

        if (path === '/list') {
            const now = Date.now();
            let changed = false;
            for (const [id, info] of this.rooms) {
                if (now - info.updatedAt > 30 * 60 * 1000) {
                    this.rooms.delete(id);
                    changed = true;
                }
            }
            if (changed) await this.saveRooms();
            const rooms = [];
            for (const [id, info] of this.rooms) {
                rooms.push({ ...info, roomId: id });
            }
            return new Response(JSON.stringify({ rooms }));
        }

        if (path === '/register') {
            const data = await request.json();
            this.rooms.set(data.roomId, {
                game: data.game,
                hostName: data.hostName,
                playerCount: data.playerCount || 1,
                gameStarted: false,
                metadata: data.metadata || {},
                updatedAt: Date.now(),
            });
            await this.saveRooms();
            return new Response('ok');
        }

        if (path === '/update') {
            const data = await request.json();
            const room = this.rooms.get(data.roomId);
            if (room) {
                if (data.playerCount !== undefined) room.playerCount = data.playerCount;
                if (data.gameStarted !== undefined) room.gameStarted = data.gameStarted;
                if (data.metadata) Object.assign(room.metadata, data.metadata);
                room.updatedAt = Date.now();
                await this.saveRooms();
            }
            return new Response('ok');
        }

        if (path === '/unregister') {
            const data = await request.json();
            this.rooms.delete(data.roomId);
            await this.saveRooms();
            return new Response('ok');
        }

        return new Response('Not Found', { status: 404 });
    }
}

// --- Durable Object: GameRoom (범용) ---
export class GameRoom {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.sessions = new Map();
        this.game = null;
        this.roomId = null;
        this.hostId = null;
        this.players = [];
        this.gameStarted = false;
        this.nextPlayerId = 1;
        this.metadata = {};
        this.password = null; // 비밀방 비밀번호 (null = 공개방)
    }

    async fetch(request) {
        const url = new URL(request.url);
        const action = url.searchParams.get('action');
        const name = url.searchParams.get('name');
        const roomId = url.searchParams.get('room');
        const game = url.searchParams.get('game');
        const password = url.searchParams.get('password') || '';

        if (!this.roomId) {
            this.roomId = roomId;
            this.game = game;
        }

        // 방 생성 시 비밀번호 설정
        if (action === 'create' && password) {
            this.password = password;
        }

        // 입장 시 비밀번호 검증
        if (action === 'join') {
            if (this.gameStarted) {
                return new Response(JSON.stringify({ error: 'Game already in progress' }), {
                    status: 403,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            if (this.password && password !== this.password) {
                // 비밀번호 틀림 - WebSocket 대신 에러 응답
                // WebSocket은 HTTP 에러로 거부할 수 없으므로 연결 후 에러 메시지 전송
                const pair = new WebSocketPair();
                const [client, server] = Object.values(pair);
                server.accept();
                server.send(JSON.stringify({ type: 'error', message: 'Wrong password' }));
                server.close(4001, 'Wrong password');
                return new Response(null, { status: 101, webSocket: client });
            }
        }

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        const playerId = 'P' + (this.nextPlayerId++);
        const isHost = action === 'create';

        if (isHost) {
            this.hostId = playerId;
        }

        const teamACnt = this.players.filter(p => p.team === 0).length;
        const teamBCnt = this.players.filter(p => p.team === 1).length;
        const team = teamACnt <= teamBCnt ? 0 : 1;

        const playerData = {
            id: playerId,
            name: name.slice(0, 12),
            team,
            ready: isHost,
            isBot: false,
            isHost,
            slotIndex: this.nextPlayerId - 1,
        };

        this.sessions.set(server, playerData);
        this.players.push(playerData);

        server.accept();

        this.sendTo(server, {
            type: isHost ? 'roomCreated' : 'joined',
            game: this.game,
            roomId: this.roomId,
            playerId,
            players: this.getPlayerList(),
            metadata: this.metadata,
        });

        if (!isHost) {
            this.broadcast({
                type: 'playerJoined',
                player: this.sanitizePlayer(playerData),
                players: this.getPlayerList(),
            }, server);
        }

        // 로비에 방 정보 업데이트
        if (isHost) {
            await this.notifyLobby('register', {
                roomId: this.roomId,
                game: this.game,
                hostName: playerData.name,
                playerCount: this.players.filter(p => !p.isBot).length,
                metadata: { ...this.metadata, password: !!this.password },
            });
        } else {
            await this.notifyLobby('update', {
                roomId: this.roomId,
                playerCount: this.players.filter(p => !p.isBot).length,
            });
        }

        server.addEventListener('message', (event) => {
            try {
                const msg = JSON.parse(event.data);
                this.handleMessage(server, playerData, msg);
            } catch (e) {
                console.error('Message parse error:', e);
            }
        });

        server.addEventListener('close', () => {
            this.handleDisconnect(server, playerData);
        });

        server.addEventListener('error', () => {
            this.handleDisconnect(server, playerData);
        });

        return new Response(null, { status: 101, webSocket: client });
    }

    async notifyLobby(action, data) {
        try {
            const lobbyId = this.env.GAME_LOBBY.idFromName(`lobby:${this.game}`);
            const lobby = this.env.GAME_LOBBY.get(lobbyId);
            await lobby.fetch(new Request(`http://internal/${action}`, {
                method: 'POST',
                body: JSON.stringify(data),
            }));
        } catch (e) {
            console.error('Lobby notify error:', e);
        }
    }

    handleMessage(ws, player, msg) {
        switch (msg.type) {
            case 'setTeam':
                if (msg.team === 0 || msg.team === 1) {
                    player.team = msg.team;
                    this.broadcastRoomState();
                }
                break;

            case 'setReady':
                player.ready = !!msg.ready;
                this.broadcast({
                    type: 'playerReady',
                    playerId: player.id,
                    ready: player.ready,
                    players: this.getPlayerList(),
                });
                break;

            case 'startGame':
                if (player.id === this.hostId && this.canStart()) {
                    this.startGame(msg);
                }
                break;

            case 'input':
                if (player.id !== this.hostId) {
                    const hostWs = this.getHostWs();
                    if (hostWs) {
                        this.sendTo(hostWs, { ...msg, playerId: player.id, slotIndex: player.slotIndex });
                    }
                }
                break;

            case 'gameState':
                if (player.id === this.hostId) {
                    this.broadcast(msg, ws);
                }
                break;

            case 'gameEvent':
                if (player.id === this.hostId) {
                    this.broadcast(msg, ws);
                }
                break;

            case 'setMetadata':
                if (player.id === this.hostId && msg.metadata) {
                    Object.assign(this.metadata, msg.metadata);
                    this.broadcastRoomState();
                    this.notifyLobby('update', {
                        roomId: this.roomId,
                        metadata: this.metadata,
                    });
                }
                break;

            case 'addBot':
                if (player.id === this.hostId) {
                    this.addBot(msg.team, msg.name);
                }
                break;

            case 'removeBot':
                if (player.id === this.hostId) {
                    this.removeBot(msg.botId, msg.team);
                }
                break;

            case 'kick':
                if (player.id === this.hostId && msg.targetId) {
                    for (const [targetWs, targetData] of this.sessions) {
                        if (targetData.id === msg.targetId && !targetData.isHost) {
                            this.sendTo(targetWs, { type: 'kicked' });
                            this.handleDisconnect(targetWs, targetData);
                            targetWs.close(1000, 'kicked');
                            break;
                        }
                    }
                }
                break;

            case 'leaveRoom':
                this.handleDisconnect(ws, player);
                ws.close(1000, 'left');
                break;

            case 'ping':
                this.sendTo(ws, { type: 'pong', t: msg.t });
                break;

            case 'reportPing':
                player.ping = Math.min(Math.max(Math.round(msg.ping || 0), 0), 9999);
                this.broadcastPings();
                break;

            case 'chat':
                this.broadcast({
                    type: 'chat',
                    playerId: player.id,
                    name: player.name,
                    message: String(msg.message || '').slice(0, 200),
                });
                break;

            default:
                if (player.id !== this.hostId) {
                    const hostWs = this.getHostWs();
                    if (hostWs) {
                        this.sendTo(hostWs, { ...msg, _from: player.id });
                    }
                } else {
                    this.broadcast(msg, ws);
                }
                break;
        }
    }

    handleDisconnect(ws, player) {
        this.sessions.delete(ws);
        this.players = this.players.filter(p => p.id !== player.id);

        if (player.id === this.hostId) {
            const remaining = this.players.filter(p => !p.isBot);
            if (remaining.length > 0) {
                const newHost = remaining[0];
                this.hostId = newHost.id;
                newHost.isHost = true;
                newHost.ready = true;
            }
        }

        this.broadcast({
            type: 'playerLeft',
            playerId: player.id,
            slotIndex: player.slotIndex,
            newHostId: this.hostId,
            players: this.getPlayerList(),
        });

        const humanCount = this.players.filter(p => !p.isBot).length;
        if (humanCount === 0) {
            this.notifyLobby('unregister', { roomId: this.roomId });
        } else {
            this.notifyLobby('update', {
                roomId: this.roomId,
                playerCount: humanCount,
            });
        }
    }

    startGame(msg) {
        this.gameStarted = true;

        let slotIdx = 0;
        for (const p of this.players.filter(pp => pp.team === 0)) {
            p.slotIndex = slotIdx++;
        }
        for (const p of this.players.filter(pp => pp.team === 1)) {
            p.slotIndex = slotIdx++;
        }

        const teamSizes = [
            this.players.filter(p => p.team === 0).length,
            this.players.filter(p => p.team === 1).length,
        ];

        for (const [ws, pData] of this.sessions) {
            this.sendTo(ws, {
                type: 'gameStart',
                game: this.game,
                teamSizes,
                myTeam: pData.team,
                mySlotIndex: pData.slotIndex,
                players: this.getPlayerList(),
                metadata: this.metadata,
                config: msg.config || null,
            });
        }

        this.notifyLobby('update', {
            roomId: this.roomId,
            gameStarted: true,
        });
    }

    canStart() {
        if (this.players.length < 2) return false;
        const nonHostHumans = this.players.filter(p => !p.isHost && !p.isBot);
        return nonHostHumans.every(p => p.ready);
    }

    addBot(team, name) {
        const targetTeam = team ?? (
            this.players.filter(p => p.team === 0).length <= this.players.filter(p => p.team === 1).length ? 0 : 1
        );
        if (this.players.filter(p => p.team === targetTeam).length >= 4) return;

        const botData = {
            id: 'BOT' + (this.nextPlayerId++),
            name: name || ('Bot ' + this.players.filter(p => p.isBot).length),
            team: targetTeam,
            ready: true,
            isBot: true,
            isHost: false,
            slotIndex: -1,
        };
        this.players.push(botData);
        this.broadcastRoomState();
    }

    removeBot(botId, team) {
        let idx;
        if (botId) {
            idx = this.players.findIndex(p => p.id === botId);
        } else {
            idx = this.players.findIndex(p => p.isBot && (team === undefined || p.team === team));
        }
        if (idx !== -1 && this.players[idx].isBot) {
            this.players.splice(idx, 1);
            this.broadcastRoomState();
        }
    }

    getHostWs() {
        for (const [ws, data] of this.sessions) {
            if (data.id === this.hostId) return ws;
        }
        return null;
    }

    broadcastRoomState() {
        this.broadcast({
            type: 'roomState',
            game: this.game,
            players: this.getPlayerList(),
            metadata: this.metadata,
        });
    }

    getPlayerList() {
        return this.players.map(p => this.sanitizePlayer(p));
    }

    broadcastPings() {
        const pings = {};
        for (const p of this.players) {
            if (!p.isBot) {
                pings[p.id] = p.ping || 0;
            }
        }
        this.broadcast({ type: 'pingUpdate', pings });
    }

    sanitizePlayer(p) {
        return {
            id: p.id,
            name: p.name,
            team: p.team,
            ready: p.ready,
            isBot: p.isBot,
            isHost: p.isHost,
            slotIndex: p.slotIndex,
            ping: p.ping || 0,
        };
    }

    sendTo(ws, data) {
        try { ws.send(JSON.stringify(data)); } catch (e) {}
    }

    broadcast(data, excludeWs) {
        const msg = JSON.stringify(data);
        for (const [ws] of this.sessions) {
            if (ws !== excludeWs) {
                try { ws.send(msg); } catch (e) {}
            }
        }
    }
}
