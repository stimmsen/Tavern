// WebSocket signaling server entry point for room-based WebRTC coordination.

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import type WebSocket from "ws";
import { WebSocketServer } from "ws";

import { TavernRooms } from "./rooms.js";
import { RoomManager } from "./room-manager.js";
import {
  parseClientMessage,
  type ServerChannelCreatedMessage,
  type ServerChannelJoinedMessage,
  type ServerErrorMessage,
  type ServerPeerIdentityUpdatedMessage,
  type ServerPeerJoinedChannelMessage,
  type ServerPeerJoinedMessage,
  type ServerPeerLeftChannelMessage,
  type ServerPeerLeftMessage,
  type ServerPeerListMessage,
  type ServerRelayMessage,
  type ServerTavernCreatedMessage,
  type ServerTavernInfoMessage
} from "./types.js";

import { MemoryStore } from "./memory-store.js";
import { SqliteStore } from "./sqlite-store.js";
import type { TavernStore } from "./store.js";

const DEFAULT_PORT = 3001;
const MAX_PEERS_PER_ROOM = 8;

const rawPort = process.env.PORT;
const parsedPort = rawPort ? Number.parseInt(rawPort, 10) : Number.NaN;
const port = Number.isFinite(parsedPort) ? parsedPort : DEFAULT_PORT;

const roomManager = new RoomManager(MAX_PEERS_PER_ROOM);

const storeBackend = process.env.TAVERN_STORE ?? "memory";
let store: TavernStore;
if (storeBackend === "memory") {
  store = new MemoryStore();
} else if (storeBackend === "sqlite") {
  const dbPath = process.env.TAVERN_DB_PATH ?? "./data/tavern.db";
  store = new SqliteStore(dbPath);
} else {
  throw new Error(`Unknown TAVERN_STORE value: "${storeBackend}". Supported: memory, sqlite.`);
}

const tavernRooms = new TavernRooms(MAX_PEERS_PER_ROOM, store);
await tavernRooms.init();

// HTTP server for health check + WebSocket upgrade.
const httpServer = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    const body = JSON.stringify({ status: "ok", taverns: tavernRooms.tavernCount() });
    res.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
    res.end(body);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

const wss = new WebSocketServer({ noServer: true });
const peerSockets = new Map<string, WebSocket>();

const writeLog = (event: string, data: Record<string, unknown>): void => {
  process.stdout.write(
    `${JSON.stringify({ timestamp: new Date().toISOString(), event, ...data })}\n`
  );
};

const sendJson = (socket: { send: (payload: string) => void }, payload: unknown): void => {
  socket.send(JSON.stringify(payload));
};

const sendError = (socket: { send: (payload: string) => void }, message: string): void => {
  const errorMessage: ServerErrorMessage = { type: "error", message };
  sendJson(socket, errorMessage);
};

const sendToPeerId = (peerId: string, payload: unknown): boolean => {
  const socket = peerSockets.get(peerId);

  if (!socket || socket.readyState !== 1) {
    return false;
  }

  sendJson(socket, payload);
  return true;
};

const broadcastChannel = (tavernId: string, channelId: string, payload: unknown, exceptPeerId?: string): void => {
  for (const targetPeerId of tavernRooms.listPeerIdsInChannel(tavernId, channelId)) {
    if (exceptPeerId && targetPeerId === exceptPeerId) {
      continue;
    }

    sendToPeerId(targetPeerId, payload);
  }
};

httpServer.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

wss.on("connection", (socket, request) => {
  const peerId = randomUUID();
  peerSockets.set(peerId, socket);

  writeLog("peer.connected", {
    peerId,
    remoteAddress: request.socket.remoteAddress ?? null
  });

  socket.on("message", async (rawPayload) => {
    const payloadText = typeof rawPayload === "string" ? rawPayload : rawPayload.toString("utf8");
    const message = parseClientMessage(payloadText);

    if (!message) {
      writeLog("message.ignored", { peerId, reason: "malformed" });
      return;
    }

    if (message.type === "create-tavern") {
      const created = await tavernRooms.createTavern(
        message.name.trim(),
        typeof message.icon === "string" && message.icon.trim().length > 0 ? message.icon.trim() : undefined,
        "unknown"
      );

      const response: ServerTavernCreatedMessage = { type: "tavern-created", tavern: created };
      sendJson(socket, response);
      return;
    }

    if (message.type === "get-tavern-info") {
      const tavern = tavernRooms.getTavernInfo(message.tavernId);
      if (!tavern) {
        sendError(socket, "Tavern not found");
        return;
      }

      const response: ServerTavernInfoMessage = { type: "tavern-info", tavern };
      sendJson(socket, response);
      return;
    }

    if (message.type === "create-channel") {
      const channel = await tavernRooms.createChannel(message.tavernId, message.name.trim());
      if (!channel) {
        sendError(socket, "Tavern not found");
        return;
      }

      const response: ServerChannelCreatedMessage = {
        type: "channel-created",
        tavernId: message.tavernId,
        channel
      };
      sendJson(socket, response);
      return;
    }

    if (message.type === "join-channel") {
      const joinResult = tavernRooms.joinChannel(
        peerId,
        message.tavernId,
        message.channelId,
        message.identity
      );

      if (!joinResult.ok) {
        if (joinResult.reason === "channel-full") {
          sendError(socket, "Channel full");
          return;
        }

        sendError(socket, joinResult.reason === "tavern-not-found" ? "Tavern not found" : "Channel not found");
        return;
      }

      if (joinResult.previousLocation) {
        const leaveMessage: ServerPeerLeftChannelMessage = {
          type: "peer-left-channel",
          tavernId: joinResult.previousLocation.tavernId,
          channelId: joinResult.previousLocation.channelId,
          publicKeyHex: joinResult.joinedPeer.publicKeyHex
        };
        broadcastChannel(
          joinResult.previousLocation.tavernId,
          joinResult.previousLocation.channelId,
          leaveMessage,
          peerId
        );
      }

      const joinedMessage: ServerChannelJoinedMessage = {
        type: "channel-joined",
        tavernId: message.tavernId,
        channelId: message.channelId,
        peers: joinResult.existingPeers
      };
      sendJson(socket, joinedMessage);

      const peerJoinedMessage: ServerPeerJoinedChannelMessage = {
        type: "peer-joined-channel",
        tavernId: message.tavernId,
        channelId: message.channelId,
        peer: joinResult.joinedPeer
      };
      broadcastChannel(message.tavernId, message.channelId, peerJoinedMessage, peerId);
      return;
    }

    if (message.type === "leave-channel") {
      const peer = tavernRooms.leaveChannel(peerId, message.tavernId, message.channelId);
      if (!peer) {
        return;
      }

      const leaveMessage: ServerPeerLeftChannelMessage = {
        type: "peer-left-channel",
        tavernId: message.tavernId,
        channelId: message.channelId,
        publicKeyHex: peer.publicKeyHex
      };
      broadcastChannel(message.tavernId, message.channelId, leaveMessage, peerId);
      return;
    }

    // Backward-compatible legacy room signaling flow.
    if (message.type === "join") {
      const roomId = message.room.trim();
      const joinResult = roomManager.joinRoom(roomId, peerId, socket);

      if (!joinResult.ok) {
        if (joinResult.reason === "room-full") {
          sendError(socket, "Room full");
        }
        return;
      }

      const peerListMessage: ServerPeerListMessage = {
        type: "peer-list",
        peers: roomManager
          .listPeerIds(roomId)
          .filter((id) => id !== peerId)
          .map((id) => ({ peerId: id }))
      };
      sendJson(socket, peerListMessage);

      const joinedMessage: ServerPeerJoinedMessage = {
        type: "peer-joined",
        peerId,
        identity: message.identity
      };
      roomManager.broadcastToRoom(roomId, JSON.stringify(joinedMessage), peerId);
      return;
    }

    if (message.type === "update-identity") {
      const location = tavernRooms.getPeerLocation(peerId);

      if (location) {
        const updatedPeer = tavernRooms.updatePeerIdentity(peerId, message.identity);
        if (!updatedPeer) {
          return;
        }

        const updatedMessage: ServerPeerIdentityUpdatedMessage = {
          type: "peer-identity-updated",
          peerId,
          identity: message.identity
        };
        broadcastChannel(location.tavernId, location.channelId, updatedMessage, peerId);
        return;
      }

      const roomId = roomManager.getRoomForPeer(peerId);
      if (!roomId) {
        return;
      }

      const legacyUpdatedMessage: ServerPeerIdentityUpdatedMessage = {
        type: "peer-identity-updated",
        peerId,
        identity: message.identity
      };

      roomManager.broadcastToRoom(roomId, JSON.stringify(legacyUpdatedMessage), peerId);
      return;
    }

    if (message.type === "offer" || message.type === "answer" || message.type === "ice-candidate") {
      const sourcePeer = tavernRooms.getPeerInfo(peerId);
      const relayMessage: ServerRelayMessage = {
        type: message.type,
        from: sourcePeer?.publicKeyHex ?? peerId,
        tavernId: message.tavernId,
        channelId: message.channelId,
        sdp: "sdp" in message ? message.sdp : undefined,
        candidate: "candidate" in message ? message.candidate : undefined
      };

      if (message.tavernId && message.channelId) {
        if (message.target) {
          const targetPeerId = tavernRooms.resolvePeerIdByPublicKey(
            message.tavernId,
            message.channelId,
            message.target
          );

          if (!targetPeerId) {
            sendError(socket, "Target peer not found in channel");
            return;
          }

          sendToPeerId(targetPeerId, relayMessage);
        } else {
          broadcastChannel(message.tavernId, message.channelId, relayMessage, peerId);
        }
        return;
      }

      const roomId = roomManager.getRoomForPeer(peerId);
      if (!roomId) {
        sendError(socket, "Join a room before signaling");
        return;
      }

      if (message.target) {
        roomManager.sendToPeer(roomId, message.target, JSON.stringify(relayMessage));
      } else {
        roomManager.broadcastToRoom(roomId, JSON.stringify(relayMessage), peerId);
      }
    }
  });

  socket.on("close", () => {
    const current = tavernRooms.leaveCurrentChannel(peerId);

    if (current) {
      const leaveMessage: ServerPeerLeftChannelMessage = {
        type: "peer-left-channel",
        tavernId: current.location.tavernId,
        channelId: current.location.channelId,
        publicKeyHex: current.peer.publicKeyHex
      };
      broadcastChannel(current.location.tavernId, current.location.channelId, leaveMessage, peerId);
    }

    const leaveResult = roomManager.leaveRoom(peerId);
    if (leaveResult) {
      const peerLeftMessage: ServerPeerLeftMessage = {
        type: "peer-left",
        peerId
      };

      roomManager.broadcastToRoom(leaveResult.roomId, JSON.stringify(peerLeftMessage), peerId);
    }

    peerSockets.delete(peerId);

    writeLog("peer.disconnected", {
      peerId,
      roomId: leaveResult?.roomId ?? null
    });
  });

  socket.on("error", (error) => {
    writeLog("peer.error", {
      peerId,
      message: error.message
    });
  });
});

httpServer.listen(port, "0.0.0.0", () => {
  writeLog("server.started", { port, store: storeBackend, taverns: tavernRooms.tavernCount() });
});
