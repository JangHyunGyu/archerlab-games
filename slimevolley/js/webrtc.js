// PeerJS P2P Manager for Slime Volleyball
// 게임 데이터는 100% PeerJS P2P — Worker(WS)는 로비 전용
class PeerJSManager {
    constructor() {
        this.peer = null;
        this.connections = new Map(); // peerId -> DataConnection
        this.onMessage = null;
        this.onPeerConnected = null;
        this.onPeerDisconnected = null;
        this.connected = false;
        this.myPeerId = null;
        this._pingTimers = {};
    }

    // TURN 크레덴셜 가져오기 (metered.ca)
    async _fetchIceServers() {
        const fallback = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
        ];

        if (!CONFIG.METERED_APP || !CONFIG.METERED_API_KEY) {
            return fallback;
        }

        try {
            const res = await fetch(
                `https://${CONFIG.METERED_APP}.metered.live/api/v1/turn/credentials?apiKey=${CONFIG.METERED_API_KEY}`
            );
            if (!res.ok) throw new Error(`TURN API ${res.status}`);
            const servers = await res.json();
            console.log(`%c[TURN] Got ${servers.length} ICE servers from metered.ca`, 'color: #FFB74D');
            return servers;
        } catch (e) {
            console.warn('[TURN] Failed to fetch credentials, using STUN only:', e);
            return fallback;
        }
    }

    // 호스트의 peer ID 생성 규칙 (마이그레이션 대비: 호스트별 고유 ID)
    static makeHostPeerId(roomId, hostPlayerId) {
        const safe = (roomId + '_h_' + hostPlayerId).replace(/[^a-zA-Z0-9_-]/g, '');
        return 'sv_' + safe;
    }

    // 호스트: 고정 ID로 Peer 생성, 연결 대기
    createHost(roomId, hostPlayerId) {
        return new Promise(async (resolve, reject) => {
            const id = PeerJSManager.makeHostPeerId(roomId, hostPlayerId);
            const iceServers = await this._fetchIceServers();

            // 이전 peer가 있으면 정리
            if (this.peer) {
                try { this.peer.destroy(); } catch (e) {}
            }

            this.peer = new Peer(id, {
                debug: 1,
                config: { iceServers }
            });

            const timeout = setTimeout(() => {
                reject(new Error('PeerJS host open timeout'));
            }, 10000);

            this.peer.on('open', (peerId) => {
                clearTimeout(timeout);
                this.myPeerId = peerId;
                console.log(`%c[PeerJS] Host ready: ${peerId}`, 'color: #4FC3F7; font-weight: bold');

                // 들어오는 연결 수신
                this.peer.on('connection', (conn) => {
                    console.log(`[PeerJS] Incoming connection from: ${conn.peer}`);
                    this._setupConnection(conn);
                });

                resolve(peerId);
            });

            this.peer.on('error', (err) => {
                clearTimeout(timeout);
                console.error('[PeerJS] Host error:', err.type, err);
                // ID 충돌 시 재시도
                if (err.type === 'unavailable-id') {
                    const retryId = id + '_' + Date.now().toString(36);
                    console.log(`[PeerJS] ID taken, retrying with: ${retryId}`);
                    this.peer = new Peer(retryId, {
                        debug: 1,
                        config: { iceServers }
                    });
                    this.peer.on('open', (peerId) => {
                        this.myPeerId = peerId;
                        this.peer.on('connection', (conn) => {
                            this._setupConnection(conn);
                        });
                        resolve(peerId);
                    });
                    this.peer.on('error', (err2) => reject(err2));
                } else {
                    reject(err);
                }
            });
        });
    }

    // 비호스트: 랜덤 ID로 Peer 생성, 호스트에 연결
    // maxRetries: 호스트 마이그레이션 직후 새 호스트가 준비될 때까지 재시도
    async connectToHost(roomId, hostPlayerId, maxRetries = 5) {
        let lastErr = null;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await this._connectToHostOnce(roomId, hostPlayerId);
            } catch (err) {
                lastErr = err;
                const retryable =
                    err && (err.type === 'peer-unavailable' ||
                            (err.message && err.message.includes('timeout')));
                if (attempt < maxRetries && retryable) {
                    const delay = 400 + attempt * 400;
                    console.log(`[PeerJS] Connect retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
                throw err;
            }
        }
        throw lastErr || new Error('connectToHost failed');
    }

    _connectToHostOnce(roomId, hostPlayerId) {
        return new Promise(async (resolve, reject) => {
            const hostId = PeerJSManager.makeHostPeerId(roomId, hostPlayerId);
            const iceServers = await this._fetchIceServers();

            if (this.peer) {
                try { this.peer.destroy(); } catch (e) {}
            }

            this.peer = new Peer(undefined, {
                debug: 1,
                config: { iceServers }
            });

            let checkOpen = null;

            const timeout = setTimeout(() => {
                if (checkOpen) clearInterval(checkOpen);
                reject(new Error('PeerJS connect timeout'));
            }, 10000);

            this.peer.on('open', (myId) => {
                this.myPeerId = myId;
                console.log(`[PeerJS] Client peer open: ${myId}`);
                console.log(`[PeerJS] Connecting to host: ${hostId}`);

                const conn = this.peer.connect(hostId, {
                    reliable: true,
                    serialization: 'json',
                });

                this._setupConnection(conn);

                // 연결 성공 대기
                checkOpen = setInterval(() => {
                    if (conn.open) {
                        clearInterval(checkOpen);
                        clearTimeout(timeout);
                        resolve(myId);
                    }
                }, 100);
            });

            this.peer.on('error', (err) => {
                clearTimeout(timeout);
                console.error('[PeerJS] Client error:', err.type, err);
                reject(err);
            });
        });
    }

    _setupConnection(conn) {
        const peerId = conn.peer;

        conn.on('open', () => {
            this.connections.set(peerId, conn);
            this.connected = true;
            console.log(`%c[PeerJS] ✅ Connected to ${peerId}`, 'color: #66BB6A; font-weight: bold');
            if (this.onPeerConnected) this.onPeerConnected(peerId);
        });

        conn.on('data', (data) => {
            // PeerJS가 자동 역직렬화 해줌
            if (data._p === 1) {
                // ping → pong 응답
                this.sendTo(peerId, { _p: 2, _t: data._t });
                return;
            }
            if (data._p === 2) {
                // pong 수신 → RTT 계산
                if (this._onPingResult) {
                    this._onPingResult(peerId, performance.now() - data._t);
                }
                return;
            }

            if (this.onMessage) this.onMessage(peerId, data);
        });

        conn.on('close', () => {
            console.log(`[PeerJS] Connection closed: ${peerId}`);
            this.connections.delete(peerId);
            this._updateConnected();
            if (this.onPeerDisconnected) this.onPeerDisconnected(peerId);
        });

        conn.on('error', (err) => {
            console.error(`[PeerJS] Connection error (${peerId}):`, err);
        });
    }

    sendTo(peerId, data) {
        const conn = this.connections.get(peerId);
        if (conn && conn.open) {
            try {
                conn.send(data);
                return true;
            } catch (e) {
                console.error(`[PeerJS] Send failed to ${peerId}:`, e);
                return false;
            }
        }
        return false;
    }

    broadcast(data) {
        if (this.connections.size === 0) return false;
        let ok = true;
        for (const [peerId, conn] of this.connections) {
            if (conn.open) {
                try {
                    conn.send(data);
                } catch (e) {
                    console.error(`[PeerJS] Broadcast failed to ${peerId}:`, e);
                    ok = false;
                }
            } else {
                ok = false;
            }
        }
        return ok;
    }

    pingPeer(peerId) {
        return this.sendTo(peerId, { _p: 1, _t: performance.now() });
    }

    isPeerConnected(peerId) {
        const conn = this.connections.get(peerId);
        return conn && conn.open;
    }

    _updateConnected() {
        this.connected = this.connections.size > 0;
    }

    destroy() {
        for (const id in this._pingTimers) {
            clearTimeout(this._pingTimers[id]);
        }
        this._pingTimers = {};
        for (const [, conn] of this.connections) {
            try { conn.close(); } catch (e) {}
        }
        this.connections.clear();
        if (this.peer) {
            try { this.peer.destroy(); } catch (e) {}
            this.peer = null;
        }
        this.connected = false;
        this.myPeerId = null;
    }
}
