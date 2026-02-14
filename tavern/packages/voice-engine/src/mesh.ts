import { PeerManager } from "./peer-manager.js";

type SignalMessage =
  | { type: "offer"; sdp: string; target: string; tavernId: string; channelId: string }
  | { type: "answer"; sdp: string; target: string; tavernId: string; channelId: string }
  | { type: "ice-candidate"; candidate: string; target: string; tavernId: string; channelId: string };

type MeshOptions = {
  localStream: MediaStream;
  iceServers: RTCIceServer[];
  onSignal: (message: SignalMessage) => void;
  onRemoteStream: (publicKeyHex: string, stream: MediaStream) => MediaStream | void;
  onPeerRemoved: (publicKeyHex: string) => void;
};

export class MeshManager {
  private readonly peerManager: PeerManager;
  private readonly contexts = new Map<string, { tavernId: string; channelId: string }>();

  public constructor(options: MeshOptions) {
    this.peerManager = new PeerManager({
      localStream: options.localStream,
      iceServers: options.iceServers,
      sendSignal: (message) => {
        const context = this.contexts.get(message.target);
        if (!context) {
          return;
        }

        options.onSignal({ ...message, tavernId: context.tavernId, channelId: context.channelId });
      },
      onRemoteStream: options.onRemoteStream,
      onPeerRemoved: (peerId) => {
        this.contexts.delete(peerId);
        options.onPeerRemoved(peerId);
      }
    });
  }

  public setPeerContext(publicKeyHex: string, tavernId: string, channelId: string): void {
    this.contexts.set(publicKeyHex, { tavernId, channelId });
  }

  public async createOffer(publicKeyHex: string, tavernId: string, channelId: string): Promise<void> {
    this.setPeerContext(publicKeyHex, tavernId, channelId);
    await this.peerManager.createOffer(publicKeyHex);
  }

  public async handleOffer(
    publicKeyHex: string,
    tavernId: string,
    channelId: string,
    sdp: string
  ): Promise<void> {
    this.setPeerContext(publicKeyHex, tavernId, channelId);
    await this.peerManager.handleOffer(publicKeyHex, sdp);
  }

  public async handleAnswer(publicKeyHex: string, sdp: string): Promise<void> {
    await this.peerManager.handleAnswer(publicKeyHex, sdp);
  }

  public async handleIceCandidate(publicKeyHex: string, candidate: string): Promise<void> {
    await this.peerManager.handleIceCandidate(publicKeyHex, candidate);
  }

  public removePeer(publicKeyHex: string): void {
    this.contexts.delete(publicKeyHex);
    this.peerManager.removePeer(publicKeyHex);
  }

  public clear(): void {
    this.contexts.clear();
    this.peerManager.dispose();
  }

  public async setOutputDevice(deviceId: string | null): Promise<void> {
    await this.peerManager.setOutputDevice(deviceId);
  }

  public async replaceOutgoingTrack(track: MediaStreamTrack): Promise<void> {
    await this.peerManager.replaceOutgoingTrack(track);
  }
}
