// Peer connection manager for creating, maintaining, and cleaning WebRTC mesh links.
import { applyOpusConfig } from "./opus-config.js";
const parseCandidate = (raw) => {
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed.candidate === "string") {
            return parsed;
        }
    }
    catch {
        // Ignore parse errors and fallback to candidate-only shape.
    }
    return { candidate: raw };
};
export class PeerManager {
    peers = new Map();
    localStream;
    iceServers;
    sendSignal;
    onRemoteStream;
    onPeerRemoved;
    constructor(options) {
        this.localStream = options.localStream;
        this.iceServers = options.iceServers;
        this.sendSignal = options.sendSignal;
        this.onRemoteStream = options.onRemoteStream;
        this.onPeerRemoved = options.onPeerRemoved;
    }
    ensurePeer(peerId) {
        const existing = this.peers.get(peerId);
        if (existing) {
            return existing;
        }
        const connection = new RTCPeerConnection({ iceServers: this.iceServers });
        for (const track of this.localStream.getTracks()) {
            connection.addTrack(track, this.localStream);
        }
        connection.onicecandidate = (event) => {
            if (!event.candidate) {
                return;
            }
            this.sendSignal({
                type: "ice-candidate",
                target: peerId,
                candidate: JSON.stringify(event.candidate.toJSON())
            });
        };
        connection.ontrack = (event) => {
            const [stream] = event.streams;
            if (!stream) {
                return;
            }
            const entry = this.peers.get(peerId);
            if (!entry) {
                return;
            }
            entry.audioElement.srcObject = stream;
            this.onRemoteStream(peerId, stream);
        };
        connection.onconnectionstatechange = () => {
            if (connection.connectionState === "disconnected" || connection.connectionState === "closed") {
                this.removePeer(peerId);
            }
        };
        const audioElement = document.createElement("audio");
        audioElement.autoplay = true;
        audioElement.setAttribute("playsinline", "true");
        const entry = { connection, audioElement };
        this.peers.set(peerId, entry);
        return entry;
    }
    async createOffer(peerId) {
        const entry = this.ensurePeer(peerId);
        const offer = await entry.connection.createOffer();
        const optimizedSdp = offer.sdp ? applyOpusConfig(offer.sdp) : undefined;
        await entry.connection.setLocalDescription({
            type: "offer",
            sdp: optimizedSdp
        });
        if (!entry.connection.localDescription?.sdp) {
            return;
        }
        this.sendSignal({
            type: "offer",
            target: peerId,
            sdp: entry.connection.localDescription.sdp
        });
    }
    async handleOffer(peerId, sdp) {
        const entry = this.ensurePeer(peerId);
        await entry.connection.setRemoteDescription({
            type: "offer",
            sdp
        });
        const answer = await entry.connection.createAnswer();
        const optimizedSdp = answer.sdp ? applyOpusConfig(answer.sdp) : undefined;
        await entry.connection.setLocalDescription({
            type: "answer",
            sdp: optimizedSdp
        });
        if (!entry.connection.localDescription?.sdp) {
            return;
        }
        this.sendSignal({
            type: "answer",
            target: peerId,
            sdp: entry.connection.localDescription.sdp
        });
    }
    async handleAnswer(peerId, sdp) {
        const entry = this.ensurePeer(peerId);
        await entry.connection.setRemoteDescription({
            type: "answer",
            sdp
        });
    }
    async handleIceCandidate(peerId, candidate) {
        const entry = this.ensurePeer(peerId);
        await entry.connection.addIceCandidate(parseCandidate(candidate));
    }
    removePeer(peerId) {
        const entry = this.peers.get(peerId);
        if (!entry) {
            return;
        }
        entry.connection.onicecandidate = null;
        entry.connection.ontrack = null;
        entry.connection.onconnectionstatechange = null;
        entry.connection.close();
        entry.audioElement.srcObject = null;
        entry.audioElement.remove();
        this.peers.delete(peerId);
        this.onPeerRemoved(peerId);
    }
    dispose() {
        for (const peerId of this.peers.keys()) {
            this.removePeer(peerId);
        }
    }
}
