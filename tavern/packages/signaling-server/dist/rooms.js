import { randomUUID } from "node:crypto";
const DEFAULT_CHANNEL_NAME = "General";
export class TavernRooms {
    maxPeersPerChannel;
    taverns = new Map();
    peerLocations = new Map();
    constructor(maxPeersPerChannel) {
        this.maxPeersPerChannel = maxPeersPerChannel;
    }
    createTavern(name, icon, createdBy) {
        const tavernId = randomUUID();
        const channelId = randomUUID();
        const createdAt = new Date().toISOString();
        const defaultChannel = {
            id: channelId,
            name: DEFAULT_CHANNEL_NAME,
            peersByPeerId: new Map()
        };
        const tavernState = {
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
    getTavernInfo(tavernId) {
        const tavern = this.taverns.get(tavernId);
        if (!tavern) {
            return null;
        }
        return this.toTavern(tavern);
    }
    createChannel(tavernId, name) {
        const tavern = this.taverns.get(tavernId);
        if (!tavern) {
            return null;
        }
        const channelId = randomUUID();
        const channel = {
            id: channelId,
            name,
            peersByPeerId: new Map()
        };
        tavern.channels.set(channelId, channel);
        return this.toChannel(channel);
    }
    joinChannel(peerId, tavernId, channelId, identity) {
        const tavern = this.taverns.get(tavernId);
        if (!tavern) {
            return { ok: false, reason: "tavern-not-found" };
        }
        const channel = tavern.channels.get(channelId);
        if (!channel) {
            return { ok: false, reason: "channel-not-found" };
        }
        const currentLocation = this.peerLocations.get(peerId) ?? null;
        if (currentLocation &&
            currentLocation.tavernId === tavernId &&
            currentLocation.channelId === channelId &&
            channel.peersByPeerId.has(peerId)) {
            const currentPeer = channel.peersByPeerId.get(peerId);
            if (!currentPeer) {
                return { ok: false, reason: "channel-not-found" };
            }
            return {
                ok: true,
                previousLocation: null,
                existingPeers: Array.from(channel.peersByPeerId.values()).filter((peer) => peer.publicKeyHex !== currentPeer.publicKeyHex),
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
        const peer = {
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
    leaveChannel(peerId, tavernId, channelId) {
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
    leaveCurrentChannel(peerId) {
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
    getPeerLocation(peerId) {
        return this.peerLocations.get(peerId) ?? null;
    }
    getPeerInfo(peerId) {
        const location = this.peerLocations.get(peerId);
        if (!location) {
            return null;
        }
        const tavern = this.taverns.get(location.tavernId);
        const channel = tavern?.channels.get(location.channelId);
        return channel?.peersByPeerId.get(peerId) ?? null;
    }
    resolvePeerIdByPublicKey(tavernId, channelId, publicKeyHex) {
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
    listPeerIdsInChannel(tavernId, channelId) {
        const tavern = this.taverns.get(tavernId);
        const channel = tavern?.channels.get(channelId);
        if (!channel) {
            return [];
        }
        return Array.from(channel.peersByPeerId.keys());
    }
    updatePeerIdentity(peerId, identity) {
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
        const updated = {
            ...existing,
            publicKeyHex: identity.publicKeyHex,
            displayName: identity.displayName?.trim() || identity.tag,
            tag: identity.tag
        };
        channel.peersByPeerId.set(peerId, updated);
        return updated;
    }
    toChannel(channel) {
        return {
            id: channel.id,
            name: channel.name,
            peers: Array.from(channel.peersByPeerId.values())
        };
    }
    toTavern(tavern) {
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
