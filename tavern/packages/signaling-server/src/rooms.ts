import type { Tavern, Channel, PeerInfo, PeerIdentity } from "./types.js";
import { randomUUID } from "node:crypto";

const DEFAULT_CHANNEL_NAME = "General";

type ChannelState = {
  id: string;
  name: string;
  peersByPeerId: Map<string, PeerInfo>;
};

type TavernState = {
  id: string;
  name: string;
  icon?: string;
  createdBy: string;
  createdAt: string;
  channels: Map<string, ChannelState>;
};

type PeerLocation = {
  tavernId: string;
  channelId: string;
};

export type JoinChannelResult =
  | {
      ok: true;
      previousLocation: PeerLocation | null;
      existingPeers: PeerInfo[];
      joinedPeer: PeerInfo;
    }
  | {
      ok: false;
      reason: "tavern-not-found" | "channel-not-found" | "channel-full";
    };

export class TavernRooms {
  private readonly maxPeersPerChannel: number;
  private readonly taverns = new Map<string, TavernState>();
  private readonly peerLocations = new Map<string, PeerLocation>();

  public constructor(maxPeersPerChannel: number) {
    this.maxPeersPerChannel = maxPeersPerChannel;
  }

  public createTavern(name: string, icon: string | undefined, createdBy: string): Tavern {
    const tavernId = randomUUID();
    const channelId = randomUUID();
    const createdAt = new Date().toISOString();

    const defaultChannel: ChannelState = {
      id: channelId,
      name: DEFAULT_CHANNEL_NAME,
      peersByPeerId: new Map<string, PeerInfo>()
    };

    const tavernState: TavernState = {
      id: tavernId,
      name,
      icon,
      createdBy,
      createdAt,
      channels: new Map([[channelId, defaultChannel]])
    };

    this.taverns.set(tavernId, tavernState);
    return this.toTavern(tavernState);
  }

  public getTavernInfo(tavernId: string): Tavern | null {
    const tavern = this.taverns.get(tavernId);
    if (!tavern) {
      return null;
    }

    return this.toTavern(tavern);
  }

  public createChannel(tavernId: string, name: string): Channel | null {
    const tavern = this.taverns.get(tavernId);
    if (!tavern) {
      return null;
    }

    const channelId = randomUUID();
    const channel: ChannelState = {
      id: channelId,
      name,
      peersByPeerId: new Map<string, PeerInfo>()
    };

    tavern.channels.set(channelId, channel);
    return this.toChannel(channel);
  }

  public joinChannel(
    peerId: string,
    tavernId: string,
    channelId: string,
    identity: Pick<PeerIdentity, "publicKeyHex" | "displayName" | "tag">
  ): JoinChannelResult {
    const tavern = this.taverns.get(tavernId);
    if (!tavern) {
      return { ok: false, reason: "tavern-not-found" };
    }

    const channel = tavern.channels.get(channelId);
    if (!channel) {
      return { ok: false, reason: "channel-not-found" };
    }

    const currentLocation = this.peerLocations.get(peerId) ?? null;
    if (
      currentLocation &&
      currentLocation.tavernId === tavernId &&
      currentLocation.channelId === channelId &&
      channel.peersByPeerId.has(peerId)
    ) {
      const currentPeer = channel.peersByPeerId.get(peerId);
      if (!currentPeer) {
        return { ok: false, reason: "channel-not-found" };
      }

      return {
        ok: true,
        previousLocation: null,
        existingPeers: Array.from(channel.peersByPeerId.values()).filter(
          (peer) => peer.publicKeyHex !== currentPeer.publicKeyHex
        ),
        joinedPeer: currentPeer
      };
    }

    if (!currentLocation && channel.peersByPeerId.size >= this.maxPeersPerChannel) {
      return { ok: false, reason: "channel-full" };
    }

    if (currentLocation) {
      this.leaveChannel(peerId, currentLocation.tavernId, currentLocation.channelId);
    }

    if (channel.peersByPeerId.size >= this.maxPeersPerChannel) {
      return { ok: false, reason: "channel-full" };
    }

    const displayName = identity.displayName?.trim() || identity.tag;
    const peer: PeerInfo = {
      publicKeyHex: identity.publicKeyHex,
      displayName,
      tavernId,
      channelId,
      isSpeaking: false,
      tag: identity.tag
    };

    const existingPeers = Array.from(channel.peersByPeerId.values());
    channel.peersByPeerId.set(peerId, peer);
    this.peerLocations.set(peerId, { tavernId, channelId });

    return {
      ok: true,
      previousLocation: currentLocation,
      existingPeers,
      joinedPeer: peer
    };
  }

  public leaveChannel(peerId: string, tavernId: string, channelId: string): PeerInfo | null {
    const tavern = this.taverns.get(tavernId);
    if (!tavern) {
      return null;
    }

    const channel = tavern.channels.get(channelId);
    if (!channel) {
      return null;
    }

    const peer = channel.peersByPeerId.get(peerId);
    if (!peer) {
      return null;
    }

    channel.peersByPeerId.delete(peerId);
    this.peerLocations.delete(peerId);
    return peer;
  }

  public leaveCurrentChannel(peerId: string): { location: PeerLocation; peer: PeerInfo } | null {
    const location = this.peerLocations.get(peerId);
    if (!location) {
      return null;
    }

    const peer = this.leaveChannel(peerId, location.tavernId, location.channelId);
    if (!peer) {
      return null;
    }

    return { location, peer };
  }

  public getPeerLocation(peerId: string): PeerLocation | null {
    return this.peerLocations.get(peerId) ?? null;
  }

  public getPeerInfo(peerId: string): PeerInfo | null {
    const location = this.peerLocations.get(peerId);
    if (!location) {
      return null;
    }

    const tavern = this.taverns.get(location.tavernId);
    const channel = tavern?.channels.get(location.channelId);
    return channel?.peersByPeerId.get(peerId) ?? null;
  }

  public resolvePeerIdByPublicKey(
    tavernId: string,
    channelId: string,
    publicKeyHex: string
  ): string | null {
    const tavern = this.taverns.get(tavernId);
    const channel = tavern?.channels.get(channelId);

    if (!channel) {
      return null;
    }

    for (const [peerId, peer] of channel.peersByPeerId.entries()) {
      if (peer.publicKeyHex === publicKeyHex) {
        return peerId;
      }
    }

    return null;
  }

  public listPeerIdsInChannel(tavernId: string, channelId: string): string[] {
    const tavern = this.taverns.get(tavernId);
    const channel = tavern?.channels.get(channelId);

    if (!channel) {
      return [];
    }

    return Array.from(channel.peersByPeerId.keys());
  }

  public updatePeerIdentity(peerId: string, identity: PeerIdentity): PeerInfo | null {
    const location = this.peerLocations.get(peerId);
    if (!location) {
      return null;
    }

    const tavern = this.taverns.get(location.tavernId);
    const channel = tavern?.channels.get(location.channelId);
    const existing = channel?.peersByPeerId.get(peerId);

    if (!channel || !existing) {
      return null;
    }

    const updated: PeerInfo = {
      ...existing,
      publicKeyHex: identity.publicKeyHex,
      displayName: identity.displayName?.trim() || identity.tag,
      tag: identity.tag
    };

    channel.peersByPeerId.set(peerId, updated);
    return updated;
  }

  private toChannel(channel: ChannelState): Channel {
    return {
      id: channel.id,
      name: channel.name,
      peers: Array.from(channel.peersByPeerId.values())
    };
  }

  private toTavern(tavern: TavernState): Tavern {
    return {
      id: tavern.id,
      name: tavern.name,
      icon: tavern.icon,
      channels: Array.from(tavern.channels.values()).map((channel) => this.toChannel(channel)),
      createdBy: tavern.createdBy,
      createdAt: tavern.createdAt
    };
  }
}
