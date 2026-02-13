// In-memory room membership and peer routing utilities for signaling.

import type WebSocket from "ws";

export type JoinResult =
  | {
      ok: true;
      roomId: string;
    }
  | {
      ok: false;
      reason: "room-full" | "already-joined";
    };

type RoomPeers = Map<string, WebSocket>;

export class RoomManager {
  private readonly maxPeersPerRoom: number;
  private readonly rooms = new Map<string, RoomPeers>();
  private readonly peerToRoom = new Map<string, string>();

  public constructor(maxPeersPerRoom: number) {
    this.maxPeersPerRoom = maxPeersPerRoom;
  }

  public joinRoom(roomId: string, peerId: string, socket: WebSocket): JoinResult {
    if (this.peerToRoom.has(peerId)) {
      return { ok: false, reason: "already-joined" };
    }

    const room = this.rooms.get(roomId) ?? new Map<string, WebSocket>();

    if (room.size >= this.maxPeersPerRoom) {
      return { ok: false, reason: "room-full" };
    }

    room.set(peerId, socket);
    this.rooms.set(roomId, room);
    this.peerToRoom.set(peerId, roomId);

    return { ok: true, roomId };
  }

  public leaveRoom(peerId: string): { roomId: string; remainingPeerIds: string[] } | null {
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

  public getRoomForPeer(peerId: string): string | null {
    return this.peerToRoom.get(peerId) ?? null;
  }

  public listPeerIds(roomId: string): string[] {
    const room = this.rooms.get(roomId);

    if (!room) {
      return [];
    }

    return Array.from(room.keys());
  }

  public sendToPeer(roomId: string, targetPeerId: string, payload: string): boolean {
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

  public broadcastToRoom(roomId: string, payload: string, exceptPeerId?: string): number {
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
