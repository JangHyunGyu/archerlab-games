// PeerJS P2P Manager for Slime Volleyball
// 게임 데이터는 100% PeerJS P2P — Worker(WS)는 로비 전용
class PeerJSManager {
    constructor() {
        this.peer = null;
        this.connections = new Map(); // peerId -> DataConnection
        this.fastChannels = new Map(); // peerId -> negotiated unreliable RTCDataChannel
        this.onMessage = null;
        this.onPeerConnected = null;
        this.onPeerDisconnected = null;
        this.connected = false;
        this.myPeerId = null;
        this._pingTimers = {};
        const decoderCtor = typeof globalThis !== 'undefined' ? globalThis['TextDecoder'] : null;
        this._textDecoder = typeof decoderCtor === 'function' ? Reflect.construct(decoderCtor, []) : null;
    }

    static get MAX_REALTIME_BUFFERED_BYTES() {
        return 4 * 1024;
    }

    // TURN 크레덴셜 가져오기 (metered.ca)
    async _fetchIceServers() {
        const fallback = [
            { urls: 'stun:stun.cloudflare.com:3478' },
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
        ];

        if (!CONFIG.METERED_TURN_ENABLED || !CONFIG.METERED_APP || !CONFIG.METERED_API_KEY) {
            return fallback;
        }

        try {
            const res = await fetch(
                `https://${CONFIG.METERED_APP}.metered.live/api/v1/turn/credentials?apiKey=${CONFIG.METERED_API_KEY}`
            );
            if (!res.ok) throw new Error(`TURN API ${res.status}`);
            const servers = await res.json();
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
            const rtcConfig = { iceServers, iceCandidatePoolSize: 4 };

            // 이전 peer가 있으면 정리
            if (this.peer) {
                try { this.peer.destroy(); } catch (e) {}
            }

            this.peer = new Peer(id, {
                debug: 1,
                config: rtcConfig
            });

            const timeout = setTimeout(() => {
                reject(new Error('PeerJS host open timeout'));
            }, 10000);

            this.peer.on('open', (peerId) => {
                clearTimeout(timeout);
                this.myPeerId = peerId;

                // 들어오는 연결 수신
                this.peer.on('connection', (conn) => {
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
                    this.peer = new Peer(retryId, {
                        debug: 1,
                        config: rtcConfig
                    });
                    const retryTimeout = setTimeout(() => {
                        reject(new Error('PeerJS host open timeout'));
                    }, 10000);
                    this.peer.on('open', (peerId) => {
                        clearTimeout(retryTimeout);
                        this.myPeerId = peerId;
                        this.peer.on('connection', (conn) => {
                            this._setupConnection(conn);
                        });
                        resolve(peerId);
                    });
                    this.peer.on('error', (err2) => {
                        clearTimeout(retryTimeout);
                        reject(err2);
                    });
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
                    const delay = 200 + attempt * 250;
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
            const rtcConfig = { iceServers, iceCandidatePoolSize: 4 };

            if (this.peer) {
                try { this.peer.destroy(); } catch (e) {}
            }

            this.peer = new Peer(undefined, {
                debug: 1,
                config: rtcConfig
            });

            let settled = false;
            let activeConn = null;

            const cleanupFail = (err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                reject(err);
            };

            const timeout = setTimeout(() => {
                if (activeConn) {
                    try { activeConn.close(); } catch (e) {}
                }
                cleanupFail(new Error('PeerJS connect timeout'));
            }, 10000);

            this.peer.on('open', (myId) => {
                if (settled) return;
                this.myPeerId = myId;

                const conn = this.peer.connect(hostId, {
                    // PeerJS implements reliable: false as { ordered: false }, avoiding
                    // head-of-line blocking for unordered events while staying reliable.
                    reliable: false,
                    serialization: 'json',
                });
                activeConn = conn;

                const onOpen = () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeout);
                    resolve(myId);
                };
                if (typeof conn.once === 'function') {
                    conn.once('open', onOpen);
                } else {
                    conn.on('open', onOpen);
                }
                conn.on('error', (err) => cleanupFail(err));
                conn.on('close', () => {
                    if (!settled) cleanupFail(new Error('PeerJS connection closed before open'));
                });

                this._setupConnection(conn);
                if (conn.open) onOpen();
            });

            this.peer.on('error', (err) => {
                console.error('[PeerJS] Client error:', err.type, err);
                cleanupFail(err);
            });
        });
    }

    _attachFastChannel(conn) {
        const peerId = conn.peer;
        const pc = conn.peerConnection;
        if (!pc || this.fastChannels.has(peerId) || typeof pc.createDataChannel !== 'function') {
            return;
        }
        try {
            const dc = pc.createDataChannel('sv_rt', {
                negotiated: true,
                id: 100,
                ordered: false,
                maxRetransmits: 0,
            });
            dc.binaryType = 'arraybuffer';
            dc.onmessage = (ev) => {
                try {
                    const raw = typeof ev.data === 'string'
                        ? ev.data
                        : (this._textDecoder ? this._textDecoder.decode(ev.data) : '');
                    const parsed = JSON.parse(raw);
                    this._handleIncomingData(peerId, parsed);
                } catch (e) {}
            };
            dc.onclose = () => {
                if (this.fastChannels.get(peerId) === dc) {
                    this.fastChannels.delete(peerId);
                }
            };
            dc.onerror = () => {};
            this.fastChannels.set(peerId, dc);
        } catch (e) {}
    }

    _handleIncomingData(peerId, data) {
        if (!data || typeof data !== 'object') return;
        if (data._p === 1) {
            // ping → pong 응답 (실시간 채널 우선 사용)
            const pong = { _p: 2, _t: data._t };
            if (!this._sendFastTo(peerId, pong)) {
                this.sendTo(peerId, pong);
            }
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
    }

    _sendFastTo(peerId, data) {
        const dc = this.fastChannels.get(peerId);
        if (dc && dc.readyState === 'open') {
            try {
                dc.send(typeof data === 'string' ? data : JSON.stringify(data));
                return true;
            } catch (e) {
                return false;
            }
        }
        return false;
    }

    _setupConnection(conn) {
        const peerId = conn.peer;
        this._attachFastChannel(conn);

        conn.on('open', () => {
            this.connections.set(peerId, conn);
            this._attachFastChannel(conn);
            this.connected = true;
            if (this.onPeerConnected) this.onPeerConnected(peerId);
        });

        conn.on('data', (data) => {
            this._handleIncomingData(peerId, data);
        });

        conn.on('close', () => {
            this.connections.delete(peerId);
            const dc = this.fastChannels.get(peerId);
            if (dc) {
                try { dc.close(); } catch (e) {}
                this.fastChannels.delete(peerId);
            }
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

    broadcastRealtime(data, forceFallbackOnCongestion = false) {
        if (this.connections.size === 0) return false;
        let ok = true;
        let encoded = null;
        for (const [peerId, conn] of this.connections) {
            const dc = this.fastChannels.get(peerId);
            if (dc && dc.readyState === 'open') {
                if (dc.bufferedAmount > PeerJSManager.MAX_REALTIME_BUFFERED_BYTES) {
                    if (!forceFallbackOnCongestion || !conn.open) {
                        ok = false;
                        continue;
                    }
                } else {
                    try {
                        if (encoded === null) encoded = JSON.stringify(data);
                        dc.send(encoded);
                        continue;
                    } catch (e) {
                        ok = false;
                    }
                }
            }

            const bufferedAmount = conn.dataChannel ? conn.dataChannel.bufferedAmount : 0;
            if (!conn.open || (!forceFallbackOnCongestion && bufferedAmount > PeerJSManager.MAX_REALTIME_BUFFERED_BYTES)) {
                // Do not add obsolete snapshots behind an already congested send queue.
                ok = false;
                continue;
            }
            try {
                conn.send(data);
            } catch (e) {
                console.error(`[PeerJS] Realtime broadcast failed to ${peerId}:`, e);
                ok = false;
            }
        }
        return ok;
    }

    pingPeer(peerId) {
        const pingMsg = { _p: 1, _t: performance.now() };
        if (this._sendFastTo(peerId, pingMsg)) return true;
        return this.sendTo(peerId, pingMsg);
    }

    isPeerConnected(peerId) {
        const conn = this.connections.get(peerId);
        return !!(conn && conn.open);
    }

    _updateConnected() {
        this.connected = this.connections.size > 0;
    }

    destroy() {
        for (const id in this._pingTimers) {
            clearTimeout(this._pingTimers[id]);
        }
        this._pingTimers = {};
        for (const [, dc] of this.fastChannels) {
            try { dc.close(); } catch (e) {}
        }
        this.fastChannels.clear();
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
