// WebRTC P2P Manager for Slime Volleyball
// Handles signaling via existing WebSocket relay, then switches to direct DataChannel
class WebRTCManager {
    constructor() {
        this.peers = new Map();       // peerId -> { pc, dc, connected, verified, pendingICE }
        this.myId = null;
        this.onMessage = null;        // callback(peerId, data)
        this.onPeerConnected = null;  // callback(peerId) - called after verification
        this.onPeerDisconnected = null; // callback(peerId)
        this.signalSend = null;       // function(targetId, signalData) - set by NetworkClient
        this.connected = false;       // true if at least one peer is P2P connected & verified
        this.fallbackToWS = false;    // true if P2P failed, use WS relay

        this._iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
        ];
    }

    setSignalSender(fn) {
        this.signalSend = fn;
    }

    setMyId(id) {
        this.myId = id;
    }

    // Initiate P2P connection to a peer (caller side)
    async connectToPeer(peerId) {
        if (this.peers.has(peerId)) return;

        const pc = new RTCPeerConnection({ iceServers: this._iceServers });
        const peerState = { pc, dc: null, connected: false, verified: false, pendingICE: [] };
        this.peers.set(peerId, peerState);

        this._setupPeerConnection(peerId, pc, peerState);

        // Create DataChannel - reliable ordered (TCP-like)
        const dc = pc.createDataChannel('game', {
            ordered: true,
        });
        this._setupDataChannel(peerId, dc, peerState);

        // Create and send offer
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.signalSend(peerId, { type: 'offer', sdp: offer.sdp });
        } catch (e) {
            console.warn('WebRTC offer failed:', e);
            this._failPeer(peerId);
        }
    }

    // Handle incoming signaling message from relay
    async handleSignal(fromId, signal) {
        if (signal.type === 'offer') {
            await this._handleOffer(fromId, signal);
        } else if (signal.type === 'answer') {
            await this._handleAnswer(fromId, signal);
        } else if (signal.type === 'ice') {
            await this._handleICE(fromId, signal);
        }
    }

    async _handleOffer(fromId, signal) {
        let peerState = this.peers.get(fromId);
        if (!peerState) {
            const pc = new RTCPeerConnection({ iceServers: this._iceServers });
            peerState = { pc, dc: null, connected: false, verified: false, pendingICE: [] };
            this.peers.set(fromId, peerState);
            this._setupPeerConnection(fromId, pc, peerState);
        }

        const pc = peerState.pc;

        // Callee receives DataChannel
        pc.ondatachannel = (event) => {
            this._setupDataChannel(fromId, event.channel, peerState);
        };

        try {
            await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });

            for (const ice of peerState.pendingICE) {
                await pc.addIceCandidate(ice).catch(() => {});
            }
            peerState.pendingICE = [];

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            this.signalSend(fromId, { type: 'answer', sdp: answer.sdp });
        } catch (e) {
            console.warn('WebRTC answer failed:', e);
            this._failPeer(fromId);
        }
    }

    async _handleAnswer(fromId, signal) {
        const peerState = this.peers.get(fromId);
        if (!peerState) return;

        try {
            await peerState.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });

            for (const ice of peerState.pendingICE) {
                await peerState.pc.addIceCandidate(ice).catch(() => {});
            }
            peerState.pendingICE = [];
        } catch (e) {
            console.warn('WebRTC setRemoteDescription failed:', e);
        }
    }

    async _handleICE(fromId, signal) {
        const peerState = this.peers.get(fromId);
        if (!peerState) return;

        const candidate = new RTCIceCandidate(signal.candidate);

        if (peerState.pc.remoteDescription) {
            await peerState.pc.addIceCandidate(candidate).catch(() => {});
        } else {
            peerState.pendingICE.push(candidate);
        }
    }

    _setupPeerConnection(peerId, pc, peerState) {
        pc.onicecandidate = (event) => {
            if (event.candidate && this.signalSend) {
                this.signalSend(peerId, { type: 'ice', candidate: event.candidate.toJSON() });
            }
        };

        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            console.log(`[P2P:${peerId}] connection: ${state}`);
            if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                this._failPeer(peerId);
            }
        };

        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'failed') {
                this._failPeer(peerId);
            }
        };
    }

    _setupDataChannel(peerId, dc, peerState) {
        peerState.dc = dc;

        const onDCOpen = () => {
            peerState.connected = true;
            console.log(`%c[P2P:${peerId}] DataChannel OPEN (ordered=${dc.ordered})`, 'color: #4FC3F7; font-weight: bold');
            // 연결 검증: ping 전송
            try {
                dc.send(JSON.stringify({ _verify: 'ping' }));
                console.log(`[P2P:${peerId}] verification ping sent`);
            } catch (e) {
                console.error(`[P2P:${peerId}] failed to send verification ping:`, e);
                this._failPeer(peerId);
            }
        };

        dc.onopen = onDCOpen;

        // Edge case: DC가 이미 open 상태면 onopen이 안 불림
        if (dc.readyState === 'open') {
            onDCOpen();
        }

        dc.onclose = () => {
            console.log(`[P2P:${peerId}] DataChannel closed`);
            peerState.connected = false;
            peerState.verified = false;
            this._updateConnectedState();
            if (this.onPeerDisconnected) this.onPeerDisconnected(peerId);
        };

        dc.onerror = (e) => {
            console.error(`[P2P:${peerId}] DataChannel error:`, e);
            this._failPeer(peerId);
        };

        dc.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                // 연결 검증 핸들링
                if (data._verify === 'ping') {
                    dc.send(JSON.stringify({ _verify: 'pong' }));
                    console.log(`[P2P:${peerId}] verification pong sent`);
                    return;
                }
                if (data._verify === 'pong') {
                    peerState.verified = true;
                    this.connected = true;
                    console.log(`%c[P2P:${peerId}] ✅ VERIFIED - data flows!`, 'color: #66BB6A; font-weight: bold');
                    if (this.onPeerConnected) this.onPeerConnected(peerId);
                    return;
                }

                // P2P ping/pong for latency
                if (data._p === 1) {
                    this.sendToPeer(peerId, { _p: 2, _t: data._t });
                    return;
                }
                if (data._p === 2) {
                    if (this._onPingResult) this._onPingResult(peerId, performance.now() - data._t);
                    return;
                }

                // 일반 게임 메시지
                if (this.onMessage) this.onMessage(peerId, data);
            } catch (e) {
                console.error(`[P2P:${peerId}] message parse error:`, e, 'raw:', typeof event.data, event.data?.substring?.(0, 100));
            }
        };
    }

    sendToPeer(peerId, data) {
        const peer = this.peers.get(peerId);
        if (peer && peer.connected && peer.verified && peer.dc && peer.dc.readyState === 'open') {
            try {
                peer.dc.send(JSON.stringify(data));
                return true;
            } catch (e) {
                console.error(`[P2P:${peerId}] send failed:`, e);
                return false;
            }
        }
        return false;
    }

    broadcast(data) {
        const msg = JSON.stringify(data);
        let sentToAll = true;
        for (const [peerId, peer] of this.peers) {
            if (peer.connected && peer.verified && peer.dc && peer.dc.readyState === 'open') {
                try {
                    peer.dc.send(msg);
                } catch (e) {
                    console.error(`[P2P:${peerId}] broadcast send failed:`, e);
                    sentToAll = false;
                }
            } else {
                sentToAll = false;
            }
        }
        return sentToAll;
    }

    isPeerConnected(peerId) {
        const peer = this.peers.get(peerId);
        return peer && peer.connected && peer.verified && peer.dc && peer.dc.readyState === 'open';
    }

    allPeersConnected() {
        if (this.peers.size === 0) return false;
        for (const [, peer] of this.peers) {
            if (!peer.connected || !peer.verified) return false;
        }
        return true;
    }

    _failPeer(peerId) {
        const peer = this.peers.get(peerId);
        if (!peer) return;

        peer.connected = false;
        peer.verified = false;
        if (peer.dc) {
            try { peer.dc.close(); } catch (e) {}
        }
        if (peer.pc) {
            try { peer.pc.close(); } catch (e) {}
        }
        this.peers.delete(peerId);
        this._updateConnectedState();

        if (this.peers.size === 0) {
            this.fallbackToWS = true;
            console.log('%c[P2P] All connections failed → WebSocket fallback', 'color: #EF5350');
        }

        if (this.onPeerDisconnected) this.onPeerDisconnected(peerId);
    }

    _updateConnectedState() {
        this.connected = false;
        for (const [, peer] of this.peers) {
            if (peer.connected && peer.verified) {
                this.connected = true;
                break;
            }
        }
    }

    pingPeer(peerId) {
        return this.sendToPeer(peerId, { _p: 1, _t: performance.now() });
    }

    destroy() {
        for (const [, peer] of this.peers) {
            if (peer.dc) try { peer.dc.close(); } catch (e) {}
            if (peer.pc) try { peer.pc.close(); } catch (e) {}
        }
        this.peers.clear();
        this.connected = false;
        this.fallbackToWS = false;
        this.onMessage = null;
        this.onPeerConnected = null;
        this.onPeerDisconnected = null;
    }
}
