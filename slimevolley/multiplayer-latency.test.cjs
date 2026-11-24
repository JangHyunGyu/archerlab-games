const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

function createRuntime() {
    const noop = () => {};
    const context = {
        console,
        Math,
        Number,
        Object,
        Array,
        Map,
        Set,
        JSON,
        Date,
        Promise,
        Reflect,
        TextDecoder,
        performance: { now: () => context.__now },
        __now: 1000,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        window: {
            addEventListener: noop,
            removeEventListener: noop,
            SlimeVolleyI18n: null,
        },
        document: {
            hidden: false,
            addEventListener: noop,
            removeEventListener: noop,
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => [],
        },
        navigator: { userAgent: '' },
        WebSocket: class MockWebSocket {
            constructor() {
                this.readyState = 1;
                this.sent = [];
            }
            send(payload) {
                this.sent.push(payload);
            }
            close() {
                this.readyState = 3;
            }
        },
        Peer: class MockPeer {},
    };
    context.WebSocket.OPEN = 1;
    context.globalThis = context;
    vm.createContext(context);

    const files = [
        'js/config.js',
        'js/physics.js',
        'js/bot.js',
        'js/webrtc.js',
        'js/network.js',
        'js/main.js',
    ];
    for (const rel of files) {
        const src = fs.readFileSync(path.join(__dirname, rel), 'utf8');
        vm.runInContext(src, context, { filename: rel });
    }
    vm.runInContext(
        'Object.assign(globalThis, { CONFIG, PhysicsEngine, BotAI, PeerJSManager, NetworkClient, SlimeVolleyGame });',
        context
    );

    vm.runInContext(`
        class SoundManager {
            playHit() {}
            playJump() {}
            playWallBounce() {}
            playNetBounce() {}
            playFloorBounce() {}
            playScore() {}
            playGameOver() {}
            playCountdown() {}
        }
        this.SoundManager = SoundManager;
    `, context);

    return context;
}

test('slimevolley physics: exposes net/wall/floor bounce flags and steps ball independently', () => {
    const rt = createRuntime();
    const physics = vm.runInContext('new PhysicsEngine()', rt);
    const CONFIG = vm.runInContext('CONFIG', rt);

    physics.configure({ sets: 3, scorePerSet: 25, deuce: true });
    physics.initSlimes([1, 1]);
    physics.phase = 'playing';

    assert.equal(physics.getState().totalSets, 3);

    // Wall bounce flag
    physics.ball.x = CONFIG.BALL_RADIUS + 1;
    physics.ball.y = 140;
    physics.ball.vx = -6;
    physics.ball.vy = 0;
    const wallRes = physics.update();
    assert.equal(wallRes.type, 'bounce');
    assert.equal(wallRes.wallBounce, true);
    assert.equal(wallRes.netBounce, false);
    assert.ok(physics.ball.vx > 0);

    // Net bounce flag
    physics.ball.x = CONFIG.NET_X - CONFIG.NET_WIDTH / 2 - CONFIG.BALL_RADIUS + 2;
    physics.ball.y = CONFIG.GROUND_Y - CONFIG.NET_HEIGHT + 40;
    physics.ball.vx = 5;
    physics.ball.vy = 0;
    const netRes = physics.update();
    assert.equal(netRes.type, 'bounce');
    assert.equal(netRes.netBounce, true);
    assert.ok(physics.ball.vx < 0);

    // stepBallOnly advances ball without altering scores or ground clamping past floor
    const initialScores = [...physics.scores];
    const leadBall = { x: 200, y: CONFIG.GROUND_Y - CONFIG.BALL_RADIUS - 3, vx: 3, vy: 5 };
    physics.stepBallOnly(leadBall, 4, 0.5);
    assert.equal(leadBall.y, CONFIG.GROUND_Y - CONFIG.BALL_RADIUS);
    assert.equal(leadBall.vy, 0);
    assert.deepEqual(Array.from(physics.scores), initialScores);
});

test('slimevolley bot: distributes multiple bots across defensive zones instead of clumping', () => {
    const rt = createRuntime();
    const physics = vm.runInContext('new PhysicsEngine()', rt);
    const bots = vm.runInContext('[new BotAI("hard"), new BotAI("hard")]', rt);

    physics.initSlimes([2, 1]);
    physics.slimes[0].isBot = true;
    physics.slimes[1].isBot = true;
    physics.slimes[0].x = 122;
    physics.slimes[1].x = 290;
    physics.ball = { x: 300, y: 180, vx: -1, vy: 2, lastHitBy: 1, lastHitSlimeId: 2 };

    // Reaction delay for hard bot may skip frame 1, advance until primary decision frame
    let input0;
    let input1;
    for (let f = 0; f < 6; f++) {
        input0 = bots[0].getInput(physics.slimes[0], physics.ball, physics.slimes, physics);
        input1 = bots[1].getInput(physics.slimes[1], physics.ball, physics.slimes, physics);
    }

    // Left bot (0) should hold its defensive zone centered near 121.75 instead of chasing teammate 1's ball
    assert.equal(input0.left, false, 'secondary bot should not drift left out of its zone center');
    assert.equal(input0.right, false, 'secondary bot should hold its defensive left zone instead of chasing across the court');
    assert.equal(typeof input1.left, 'boolean');
    assert.equal(typeof input1.right, 'boolean');
});

test('slimevolley webrtc: uses 4KB congestion threshold and negotiated zero-retransmit DataChannel sv_rt', () => {
    const rt = createRuntime();
    const { PeerJSManager } = rt;
    assert.equal(PeerJSManager.MAX_REALTIME_BUFFERED_BYTES, 4096);

    const mgr = new PeerJSManager();
    const createdChannels = [];
    const fallbackSent = [];
    const fastSent = [];
    const handlers = {};

    const mockDc = {
        label: 'sv_rt',
        readyState: 'open',
        bufferedAmount: 0,
        binaryType: '',
        send: (payload) => fastSent.push(payload),
        close: () => { mockDc.readyState = 'closed'; },
    };

    const mockConn = {
        peer: 'peer-2',
        open: true,
        dataChannel: { bufferedAmount: 0 },
        peerConnection: {
            createDataChannel(label, opts) {
                createdChannels.push({ label, opts });
                return mockDc;
            },
        },
        on(ev, fn) {
            handlers[ev] = fn;
        },
        send(payload) {
            fallbackSent.push(payload);
        },
        close() {
            mockConn.open = false;
        },
    };

    mgr._setupConnection(mockConn);
    handlers.open();

    assert.equal(createdChannels.length, 1);
    assert.equal(createdChannels[0].label, 'sv_rt');
    assert.deepEqual(
        { ...createdChannels[0].opts },
        { negotiated: true, id: 100, ordered: false, maxRetransmits: 0 }
    );

    // Uses fast channel while uncongested
    assert.equal(mgr.broadcastRealtime({ type: 'gameState', seq: 1 }), true);
    assert.equal(fastSent.length, 1);
    assert.equal(fallbackSent.length, 0);

    // Drops stale snapshot on fast-channel congestion unless forceFallbackOnCongestion=true
    mockDc.bufferedAmount = 5000;
    assert.equal(mgr.broadcastRealtime({ type: 'gameState', seq: 2 }, false), false);
    assert.equal(fallbackSent.length, 0);

    // Critical input edge falls back to main DataChannel when forced
    assert.equal(mgr.broadcastRealtime({ type: 'input', seq: 3 }, true), true);
    assert.equal(fallbackSent.length, 1);

    // Ping uses fast channel first and measures RTT on pong
    let measuredRtt = null;
    mgr._onPingResult = (peerId, rtt) => { measuredRtt = rtt; };
    fastSent.length = 0;
    mockDc.bufferedAmount = 0;
    rt.__now = 1200;
    assert.equal(mgr.pingPeer('peer-2'), true);
    const pingPacket = JSON.parse(fastSent[0]);
    assert.equal(pingPacket._p, 1);
    rt.__now = 1232;
    mockDc.onmessage({ data: JSON.stringify({ _p: 2, _t: pingPacket._t }) });
    assert.equal(measuredRtt, 32);

    mgr.destroy();
    assert.equal(mgr.fastChannels.size, 0);
    assert.equal(mgr.connections.size, 0);
    assert.equal(mockDc.readyState, 'closed');
});

test('slimevolley network: quantizes snapshots, deduplicates events, tracks EMA RTT', () => {
    const rt = createRuntime();
    const client = new rt.NetworkClient('slimevolley');
    const sentRealtime = [];
    client.peerjs.connections.set('p1', { open: true });
    client.peerjs.broadcastRealtime = (packet, force) => {
        sentRealtime.push({ packet, force });
        return true;
    };

    client.sendGameState(
        {
            ball: { x: 123.4567, y: 234.5678, vx: 3.14159, vy: -2.71828, lastHitSlimeId: 1 },
            slimes: [{ x: 100.129, y: 449.999, vx: 1.555, vy: -0.444 }],
            scores: [5, 3],
            phase: 'playing',
            servingTeam: 0,
            setsWon: [1, 0],
            currentSet: 1,
        },
        { 1: 42 }
    );

    assert.equal(sentRealtime.length, 1);
    const snap = sentRealtime[0].packet;
    assert.equal(snap.type, 'gameState');
    assert.equal(snap.ball, undefined);
    assert.equal(snap.state.ball.x, 123.46);
    assert.equal(snap.state.ball.vx, 3.14);
    assert.equal(snap.state.slimes[0].x, 100.13);
    assert.deepEqual({ ...snap.ack }, { 1: 42 });

    // Event deduplication
    let receivedEvents = 0;
    client.on('gameEvent', () => { receivedEvents++; });
    client.handleMessage({ type: 'gameEvent', eventId: 9, event: 'hit' });
    client.handleMessage({ type: 'gameEvent', eventId: 9, event: 'hit' });
    client.handleMessage({ type: 'gameEvent', eventId: 10, event: 'wallBounce' });
    assert.equal(receivedEvents, 2);

    // Out-of-order state snapshots dropped
    let receivedStates = 0;
    client.on('gameState', () => { receivedStates++; });
    client.handleMessage({ type: 'gameState', seq: 5, state: {} });
    client.handleMessage({ type: 'gameState', seq: 4, state: {} });
    client.handleMessage({ type: 'gameState', seq: 6, state: {} });
    assert.equal(receivedStates, 2);

    // Smoothed RTT EMA (0.75/0.25) & localPing emission
    let latestLocalPing = null;
    client.on('localPing', (p) => { latestLocalPing = p; });
    client.peerjs._onPingResult('p1', 40);
    assert.equal(client.smoothedRtt, 40);
    assert.equal(latestLocalPing, 40);
    client.peerjs._onPingResult('p1', 80);
    assert.equal(client.smoothedRtt, 50);
    assert.equal(latestLocalPing, 50);
});

test('slimevolley client latency: interpolates smoothly with jitter, applies bounded lead, reconciles prediction', () => {
    const rt = createRuntime();
    const game = new rt.SlimeVolleyGame();
    const CONFIG = rt.CONFIG;

    game.network.isHost = false;
    game.network.myPing = 60;
    game.network.smoothedRtt = 60;
    game.mySlimeId = 1;
    game.myTeam = 1;
    game.physics.initSlimes([1, 1]);
    game.physics.phase = 'playing';

    // Simulate 4 incoming snapshots with slight jitter (~16ms, ~24ms, ~18ms, ~22ms)
    const times = [1000, 1016, 1040, 1058];
    const ballXs = [200, 206, 214, 222];
    for (let i = 0; i < times.length; i++) {
        rt.__now = times[i];
        game._pushRemoteState({
            ball: { x: ballXs[i], y: 180, vx: 3.5, vy: -1.0, lastHitSlimeId: -1 },
            slimes: [
                { x: 150, y: CONFIG.GROUND_Y, vx: 0, vy: 0 },
                { x: 600, y: CONFIG.GROUND_Y, vx: 0, vy: 0 },
            ],
            scores: [0, 0],
            phase: 'playing',
            servingTeam: 0,
        });
    }

    rt.__now = 1070;
    const interp = game._getInterpolatedState(16.667);
    assert.ok(Number.isFinite(interp.ball.x) && Number.isFinite(interp.ball.y));
    // With 60ms RTT, half-RTT forward lead advances predicted ball without overshooting past max court width
    assert.ok(interp.ball.x > 206 && interp.ball.x < CONFIG.COURT_WIDTH);

    // Client prediction & reconciliation (exact seq cutoff when RTT == 0)
    game.network.smoothedRtt = 0;
    game.network.myPing = 0;
    const mySlime = game.physics.slimes.find(s => s.id === 1);
    const startX = mySlime.x;
    game._pushPendingInput(10, { left: true, right: false, jump: false });
    game._pushPendingInput(11, { left: true, right: false, jump: false });
    game._pushPendingInput(12, { left: true, right: false, jump: false });

    // Server acks up to seq 10 at startX - 2, unacked seq 11 & 12 replay cleanly
    mySlime.x = startX - 2;
    game._reconcileMySlime({ ack: { 1: 10 } }, startX - 6, mySlime.y);
    assert.equal(game._pendingInputs.length, 2);
    assert.equal(mySlime.x, startX - 2 - CONFIG.SLIME_SPEED * 2);
    assert.equal(game._predVisualOffsetX, 0); // within < 1.0px deadband or exact match

    // Test larger visual mismatch triggers smooth offset decay instead of snap
    mySlime.x = 600;
    game._reconcileMySlime({ ack: { 1: 12 } }, 610, mySlime.y);
    assert.equal(game._pendingInputs.length, 0);
    assert.equal(game._predVisualOffsetX, 10);

    // Held-key RTT cutoff reconciliation: retain recent same-seq substeps within RTT window
    game.network.smoothedRtt = 40;
    for (const ts of [2000, 2008, 2016, 2024, 2032]) {
        rt.__now = ts;
        game._pushPendingInput(20, { left: true, right: false, jump: false });
    }
    rt.__now = 2056; // cutoff = 2056 - 40 = 2016 -> retires 2000, 2008, 2016; keeps 2024, 2032
    mySlime.x = 600;
    game._reconcileMySlime({ ack: { 1: 20 } }, 600, mySlime.y);
    assert.equal(game._pendingInputs.length, 2);
    assert.equal(mySlime.x, 600 - CONFIG.SLIME_SPEED * 2);
});

test('slimevolley worker GameRoom: enforces 4-per-team cap, both-team start guard, gameEnded reset', async () => {
    const workerUrl = pathToFileURL(path.join(__dirname, 'worker.js')).href;
    const { GameRoom } = await import(workerUrl);

    const sentMessages = [];
    const lobbyCalls = [];
    const makeWs = (id) => ({
        readyState: 1,
        send(raw) {
            sentMessages.push({ to: id, msg: JSON.parse(raw) });
        },
        close() {},
    });

    const mockState = {
        storage: {
            get: async () => null,
            put: async () => {},
            delete: async () => {},
        },
    };
    const mockEnv = {
        GAME_LOBBY: {
            idFromName: () => 'lobby',
            get: () => ({
                fetch: async (_url, init) => {
                    if (init && init.body) lobbyCalls.push(JSON.parse(init.body));
                    return new Response('ok');
                },
            }),
        },
    };

    const room = new GameRoom(mockState, mockEnv);
    room.roomId = 'ROOM1';
    const hostWs = makeWs('host');
    const guestWs = makeWs('guest');

    room.players = [
        { id: 'host', name: 'Host', ws: hostWs, team: 0, isHost: true, ready: true, isBot: false, ping: 0 },
        { id: 'guest', name: 'Guest', ws: guestWs, team: 0, isHost: false, ready: true, isBot: false, ping: 0 },
    ];
    room.sessions.set(hostWs, room.players[0]);
    room.sessions.set(guestWs, room.players[1]);
    room.hostId = 'host';

    // Both players on team 0 -> cannot start
    assert.equal(room.canStart(), false);

    // Move guest to team 1 -> now canStart is true
    room.handleMessage(guestWs, room.players[1], { type: 'setTeam', team: 1 });
    assert.equal(room.players[1].team, 1);
    assert.equal(room.canStart(), true);

    // Pack team 0 to 4 players; reject 5th player moving to team 0
    room.players.push(
        { id: 'b1', name: 'B1', ws: null, team: 0, isHost: false, ready: true, isBot: true, ping: 0 },
        { id: 'b2', name: 'B2', ws: null, team: 0, isHost: false, ready: true, isBot: true, ping: 0 },
        { id: 'b3', name: 'B3', ws: null, team: 0, isHost: false, ready: true, isBot: true, ping: 0 },
    );
    sentMessages.length = 0;
    room.handleMessage(guestWs, room.players[1], { type: 'setTeam', team: 0 });
    assert.equal(room.players[1].team, 1, 'team 1 player must be blocked from joining a full 4-player team 0');
    assert.ok(sentMessages.some(s => s.to === 'guest' && s.msg.type === 'error'));

    // Start game, then host sends gameEnded -> resets gameStarted & non-host ready
    room.startGame({ sets: 1, scorePerSet: 15, deuce: true });
    assert.equal(room.gameStarted, true);
    room.handleMessage(hostWs, room.players[0], { type: 'gameEnded' });
    assert.equal(room.gameStarted, false);
    assert.equal(room.players[1].ready, false);

    // Last human disconnects -> resets gameStarted and unregisters room
    room.gameStarted = true;
    const [hostPlayer, guestPlayer] = [room.players[0], room.players[1]];
    await room.handleDisconnect(guestWs, guestPlayer);
    await room.handleDisconnect(hostWs, hostPlayer);
    assert.equal(room.gameStarted, false);
});
