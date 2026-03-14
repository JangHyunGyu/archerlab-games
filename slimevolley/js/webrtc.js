// WebRTC P2P Manager for Slime Volleyball
// Handles signaling via existing WebSocket relay, then switches to direct DataChannel
class WebRTCManager {
    constructor() {
        this.peers = new Map();       // peerId -> { pc, dc, connected, pendingICE }
        this.myId = null;
        this.onMessage = null;        // callback(peerId, data)
        this.onPeerConnected = null;  // callback(peerId)
        this.onPeerDisconnected = null; // callback(peerId)
        this.signalSend = null;       // function(targetId, signalData) - set by NetworkClient
        this.connected = false;       // true if at least one peer is P2P connected
        this.fallbackToWS = false;    // true if P2P failed, use WS relay

        this._iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
        ];

        // Reusable send buffer (avoid JSON.stringify per peer in broadcast)
        this._sendCache = null;
        this._sendCacheKey = null;
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
        const peerState = { pc, dc: null, connected: false, pendingICE: [] };
        this.peers.set(peerId, peerState);

        this._setupPeerConnection(peerId, pc, peerState);

        // Create DataChannel (caller creates it)
        const dc = pc.createDataChannel('game', {
            ordered: false,       // UDP-like: don't wait for ordering
            maxRetransmits: 0,    // No retransmits: lowest latency
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
            peerState = { pc, dc: null, connected: false, pendingICE: [] };
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

            // Apply any ICE candidates that arrived before the offer
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

            // Apply any ICE candidates that arrived before the answer
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
            // Queue if remote description not set yet
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
            if (state === 'connected') {
                // P2P established
            } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
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
        dc.binaryType = 'arraybuffer';

        dc.onopen = () => {
            peerState.connected = true;
            this.connected = true;
            console.log(`P2P connected to ${peerId}`);
            if (this.onPeerConnected) this.onPeerConnected(peerId);
        };

        dc.onclose = () => {
            peerState.connected = false;
            this._updateConnectedState();
            if (this.onPeerDisconnected) this.onPeerDisconnected(peerId);
        };

        dc.onerror = () => {
            this._failPeer(peerId);
        };

        dc.onmessage = (event) => {
            if (this.onMessage) {
                try {
                    const data = JSON.parse(event.data);
                    this.onMessage(peerId, data);
                } catch (e) {}
            }
        };
    }

    // Send to a specific peer via DataChannel (falls back to WS if not connected)
    sendToPeer(peerId, data) {
        const peer = this.peers.get(peerId);
        if (peer && peer.connected && peer.dc && peer.dc.readyState === 'open') {
            try {
                peer.dc.send(JSON.stringify(data));
                return true;
            } catch (e) {
                return false;
            }
        }
        return false; // Caller should use WS fallback
    }

    // Broadcast to all connected peers
    broadcast(data) {
        const msg = JSON.stringify(data);
        let sentToAll = true;
        for (const [peerId, peer] of this.peers) {
            if (peer.connected && peer.dc && peer.dc.readyState === 'open') {
                try {
                    peer.dc.send(msg);
                } catch (e) {
                    sentToAll = false;
                }
            } else {
                sentToAll = false;
            }
        }
        return sentToAll;
    }

    // Check if a specific peer has P2P connection
    isPeerConnected(peerId) {
        const peer = this.peers.get(peerId);
        return peer && peer.connected && peer.dc && peer.dc.readyState === 'open';
    }

    // Check if all peers are P2P connected
    allPeersConnected() {
        if (this.peers.size === 0) return false;
        for (const [, peer] of this.peers) {
            if (!peer.connected) return false;
        }
        return true;
    }

    _failPeer(peerId) {
        const peer = this.peers.get(peerId);
        if (!peer) return;

        peer.connected = false;
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
            console.log('All P2P connections failed, falling back to WebSocket relay');
        }

        if (this.onPeerDisconnected) this.onPeerDisconnected(peerId);
    }

    _updateConnectedState() {
        this.connected = false;
        for (const [, peer] of this.peers) {
            if (peer.connected) {
                this.connected = true;
                break;
            }
        }
    }

    // Get P2P latency estimate for a peer (DataChannel has no built-in RTT)
    // We'll measure with custom ping/pong
    pingPeer(peerId) {
        const t = performance.now();
        const sent = this.sendToPeer(peerId, { _p: 1, _t: t });
        return sent;
    }

    destroy() {
        for (const [peerId, peer] of this.peers) {
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
