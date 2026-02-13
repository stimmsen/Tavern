// In-memory room membership and peer routing utilities for signaling.
export class RoomManager {
    maxPeersPerRoom;
    rooms = new Map();
    peerToRoom = new Map();
    constructor(maxPeersPerRoom) {
        this.maxPeersPerRoom = maxPeersPerRoom;
    }
    joinRoom(roomId, peerId, socket) {
        if (this.peerToRoom.has(peerId)) {
            return { ok: false, reason: "already-joined" };
        }
        const room = this.rooms.get(roomId) ?? new Map();
        if (room.size >= this.maxPeersPerRoom) {
            return { ok: false, reason: "room-full" };
        }
        room.set(peerId, socket);
        this.rooms.set(roomId, room);
        this.peerToRoom.set(peerId, roomId);
        return { ok: true, roomId };
    }
    leaveRoom(peerId) {
        const roomId = this.peerToRoom.get(peerId);
        if (!roomId) {
            return null;
        }
        const room = this.rooms.get(roomId);
        if (!room) {
            this.peerToRoom.delete(peerId);
            return null;
        }
        room.delete(peerId);
        this.peerToRoom.delete(peerId);
        const remainingPeerIds = Array.from(room.keys());
        if (room.size === 0) {
            this.rooms.delete(roomId);
        }
        return { roomId, remainingPeerIds };
    }
    getRoomForPeer(peerId) {
        return this.peerToRoom.get(peerId) ?? null;
    }
    listPeerIds(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return [];
        }
        return Array.from(room.keys());
    }
    sendToPeer(roomId, targetPeerId, payload) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return false;
        }
        const targetSocket = room.get(targetPeerId);
        if (!targetSocket || targetSocket.readyState !== targetSocket.OPEN) {
            return false;
        }
        targetSocket.send(payload);
        return true;
    }
    broadcastToRoom(roomId, payload, exceptPeerId) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return 0;
        }
        let delivered = 0;
        for (const [peerId, socket] of room.entries()) {
            if (exceptPeerId && peerId === exceptPeerId) {
                continue;
            }
            if (socket.readyState !== socket.OPEN) {
                continue;
            }
            socket.send(payload);
            delivered += 1;
        }
        return delivered;
    }
}
