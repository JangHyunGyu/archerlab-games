// Archerlab Game Relay Server - Cloudflare Worker + Durable Objects
// 범용 WebSocket 방 관리/릴레이 서버 (모든 게임 공용)
//
// Worker 이름: game-relay (game-relay.yama5993.workers.dev)
// Durable Object 바인딩: GAME_ROOM -> GameRoom class
//
// 엔드포인트:
//   GET  /                          - Health check
//   WS   /ws?game=slimevolley&action=create&name=Player
//   WS   /ws?game=slimevolley&action=join&room=ABCD&name=Player

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Upgrade',
};

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
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
                version: '1.0.0',
                status: 'ok',
            }), {
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
            let roomCode = url.searchParams.get('room');

            if (action === 'create') {
                roomCode = generateRoomCode();
            }

            if (!roomCode) {
                return new Response(JSON.stringify({ error: 'room code required' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
                });
            }

            // Durable Object ID = "game:roomCode" -> 게임간 방 코드 충돌 방지
            const doId = env.GAME_ROOM.idFromName(`${game}:${roomCode}`);
            const room = env.GAME_ROOM.get(doId);

            const newUrl = new URL(request.url);
            newUrl.searchParams.set('game', game);
            newUrl.searchParams.set('room', roomCode);
            newUrl.searchParams.set('action', action || 'join');
            newUrl.searchParams.set('name', name);

            return room.fetch(new Request(newUrl.toString(), request));
        }

        return new Response('Not Found', { status: 404 });
    },
};

// --- Durable Object: GameRoom (범용) ---
export class GameRoom {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.sessions = new Map(); // WebSocket -> playerData
        this.game = null;
        this.roomCode = null;
        this.hostId = null;
        this.players = [];
        this.gameStarted = false;
        this.nextPlayerId = 1;
        this.metadata = {}; // 게임별 커스텀 데이터 (클라이언트가 설정)
    }

    async fetch(request) {
        const url = new URL(request.url);
        const action = url.searchParams.get('action');
        const name = url.searchParams.get('name');
        const roomCode = url.searchParams.get('room');
        const game = url.searchParams.get('game');

        if (!this.roomCode) {
            this.roomCode = roomCode;
            this.game = game;
        }

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        const playerId = 'P' + (this.nextPlayerId++);
        const isHost = action === 'create';

        if (isHost) {
            this.hostId = playerId;
        }

        // 팀 자동 배분
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
            roomCode: this.roomCode,
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

            // 범용 릴레이: 호스트에게 전달
            case 'input':
                if (player.id !== this.hostId) {
                    const hostWs = this.getHostWs();
                    if (hostWs) {
                        this.sendTo(hostWs, { ...msg, playerId: player.id });
                    }
                }
                break;

            // 범용 릴레이: 호스트 -> 나머지 전원
            case 'gameState':
                if (player.id === this.hostId) {
                    this.broadcast(msg, ws);
                }
                break;

            // 범용 릴레이: 호스트 -> 나머지 전원 (이벤트성)
            case 'gameEvent':
                if (player.id === this.hostId) {
                    this.broadcast(msg, ws);
                }
                break;

            // 방 메타데이터 설정 (호스트만)
            case 'setMetadata':
                if (player.id === this.hostId && msg.metadata) {
                    Object.assign(this.metadata, msg.metadata);
                    this.broadcastRoomState();
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

            case 'leaveRoom':
                this.handleDisconnect(ws, player);
                ws.close(1000, 'left');
                break;

            case 'ping':
                this.sendTo(ws, { type: 'pong', t: msg.t, st: Date.now() });
                break;

            // 채팅
            case 'chat':
                this.broadcast({
                    type: 'chat',
                    playerId: player.id,
                    name: player.name,
                    message: String(msg.message || '').slice(0, 200),
                });
                break;

            // 알 수 없는 메시지 -> 호스트에게 릴레이 (게임별 커스텀 메시지용)
            default:
                if (player.id !== this.hostId) {
                    const hostWs = this.getHostWs();
                    if (hostWs) {
                        this.sendTo(hostWs, { ...msg, _from: player.id });
                    }
                } else {
                    // 호스트가 보낸 알 수 없는 타입 -> 전원 브로드캐스트
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
            players: this.getPlayerList(),
        });
    }

    startGame(msg) {
        this.gameStarted = true;

        // 슬롯 인덱스 재할당 (팀 순서대로)
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

        // 각 플레이어에게 자신의 정보 포함해서 전송
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

    sanitizePlayer(p) {
        return {
            id: p.id,
            name: p.name,
            team: p.team,
            ready: p.ready,
            isBot: p.isBot,
            isHost: p.isHost,
            slotIndex: p.slotIndex,
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
