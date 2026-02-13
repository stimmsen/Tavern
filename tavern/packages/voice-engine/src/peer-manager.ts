// Peer connection manager for creating, maintaining, and cleaning WebRTC mesh links.

import { applyOpusConfig } from "./opus-config.js";

type SignalSendMessage =
  | { type: "offer"; sdp: string; target: string }
  | { type: "answer"; sdp: string; target: string }
  | { type: "ice-candidate"; candidate: string; target: string };

type PeerEntry = {
  connection: RTCPeerConnection;
  audioElement: HTMLAudioElement;
};

type PeerManagerOptions = {
  localStream: MediaStream;
  iceServers: RTCIceServer[];
  sendSignal: (message: SignalSendMessage) => void;
  onRemoteStream: (peerId: string, stream: MediaStream) => void;
  onPeerRemoved: (peerId: string) => void;
};

const parseCandidate = (raw: string): RTCIceCandidateInit => {
  try {
    const parsed = JSON.parse(raw) as RTCIceCandidateInit;
    if (typeof parsed.candidate === "string") {
      return parsed;
    }
  } catch {
    // Ignore parse errors and fallback to candidate-only shape.
  }

  return { candidate: raw };
};

export class PeerManager {
  private readonly peers = new Map<string, PeerEntry>();
  private readonly localStream: MediaStream;
  private readonly iceServers: RTCIceServer[];
  private readonly sendSignal: (message: SignalSendMessage) => void;
  private readonly onRemoteStream: (peerId: string, stream: MediaStream) => void;
  private readonly onPeerRemoved: (peerId: string) => void;

  public constructor(options: PeerManagerOptions) {
    this.localStream = options.localStream;
    this.iceServers = options.iceServers;
    this.sendSignal = options.sendSignal;
    this.onRemoteStream = options.onRemoteStream;
    this.onPeerRemoved = options.onPeerRemoved;
  }

  private ensurePeer(peerId: string): PeerEntry {
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

    const entry: PeerEntry = { connection, audioElement };
    this.peers.set(peerId, entry);

    return entry;
  }

  public async createOffer(peerId: string): Promise<void> {
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

  public async handleOffer(peerId: string, sdp: string): Promise<void> {
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

  public async handleAnswer(peerId: string, sdp: string): Promise<void> {
    const entry = this.ensurePeer(peerId);
    await entry.connection.setRemoteDescription({
      type: "answer",
      sdp
    });
  }

  public async handleIceCandidate(peerId: string, candidate: string): Promise<void> {
    const entry = this.ensurePeer(peerId);
    await entry.connection.addIceCandidate(parseCandidate(candidate));
  }

  public removePeer(peerId: string): void {
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

  public dispose(): void {
    for (const peerId of this.peers.keys()) {
      this.removePeer(peerId);
    }
  }
}
