// WebSocket signaling server entry point for room-based WebRTC coordination.

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import type WebSocket from "ws";
import { WebSocketServer } from "ws";
import pino from "pino";

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
  type ServerSessionReplacedMessage,
  type ServerShutdownMessage,
  type ServerTavernCreatedMessage,
  type ServerTavernInfoMessage
} from "./types.js";

import { MemoryStore } from "./memory-store.js";
import { SqliteStore } from "./sqlite-store.js";
import type { TavernStore } from "./store.js";

// ── Pino logger ──
const logLevel = process.env.TAVERN_LOG_LEVEL ?? "info";
const logger = pino({ level: logLevel });

const DEFAULT_PORT = 3001;
const MAX_PEERS_PER_ROOM = 8;

// ── Heartbeat configuration (configurable via env for testing) ──
const HEARTBEAT_INTERVAL_MS = Number(process.env.TAVERN_HEARTBEAT_INTERVAL ?? 10_000);
const HEARTBEAT_TIMEOUT_MS  = Number(process.env.TAVERN_HEARTBEAT_TIMEOUT  ?? 5_000);

// ── Rate-limit configuration ──
const RATE_CREATE_TAVERN_PER_MIN = Number(process.env.TAVERN_RATE_CREATE ?? 10);
const RATE_MESSAGES_PER_SEC      = Number(process.env.TAVERN_RATE_MSG_SEC ?? 30);
const RATE_VIOLATION_LIMIT       = 3;

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

// ── Per-connection state tracking ──
interface PeerState {
  isAlive: boolean;
  publicKeyHex: string | null;       // set on first join-channel
  ip: string;
  msgTimestamps: number[];            // rolling window for msgs/sec
  createTavernTimestamps: number[];   // rolling window for create-tavern/min
  violations: number;
}

const peerState = new Map<string, PeerState>();

// Map publicKeyHex → peerId for duplicate connection detection
const identityToPeerId = new Map<string, string>();

// Per-IP state for rate limiting create-tavern
const ipCreateTavernTimestamps = new Map<string, number[]>();

// HTTP server for health check, metrics, + WebSocket upgrade.
const httpServer = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    const body = JSON.stringify({ status: "ok", taverns: tavernRooms.tavernCount() });
    res.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
    res.end(body);
    return;
  }

  if (req.method === "GET" && req.url === "/metrics") {
    const body = JSON.stringify(getMetrics());
    res.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
    res.end(body);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

const wss = new WebSocketServer({ noServer: true });
const peerSockets = new Map<string, WebSocket>();

// ── Metrics tracking ──
const serverStartTime = Date.now();
const messageTimestamps: number[] = []; // rolling 60s window for msgs/sec

const recordMessage = (): void => {
  const now = Date.now();
  messageTimestamps.push(now);
  // Trim older than 60s
  const cutoff = now - 60_000;
  while (messageTimestamps.length > 0 && messageTimestamps[0] < cutoff) {
    messageTimestamps.shift();
  }
};

const getMetrics = () => ({
  connectedPeers: peerSockets.size,
  activeTaverns: tavernRooms.activeTavernCount(),
  totalTaverns: tavernRooms.tavernCount(),
  uptime: Math.floor((Date.now() - serverStartTime) / 1_000),
  messagesPerSecond: messageTimestamps.length > 0
    ? +(messageTimestamps.length / 60).toFixed(2)
    : 0
});

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

// ── Rate-limit helpers ──
const checkMessageRate = (state: PeerState): boolean => {
  const now = Date.now();
  state.msgTimestamps.push(now);
  // Keep only last 1 second
  const cutoff = now - 1_000;
  while (state.msgTimestamps.length > 0 && state.msgTimestamps[0] < cutoff) {
    state.msgTimestamps.shift();
  }
  return state.msgTimestamps.length <= RATE_MESSAGES_PER_SEC;
};

const checkCreateTavernRate = (ip: string): boolean => {
  const now = Date.now();
  let timestamps = ipCreateTavernTimestamps.get(ip);
  if (!timestamps) {
    timestamps = [];
    ipCreateTavernTimestamps.set(ip, timestamps);
  }
  timestamps.push(now);
  // Keep only last 60 seconds
  const cutoff = now - 60_000;
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }
  return timestamps.length <= RATE_CREATE_TAVERN_PER_MIN;
};

// ── Heartbeat ──
const heartbeatInterval = setInterval(() => {
  for (const [peerId, ws] of peerSockets) {
    const state = peerState.get(peerId);
    if (!state) continue;

    if (!state.isAlive) {
      // No pong received since last check — terminate
      logger.warn({ event: "peer.heartbeat-timeout", peerId });
      ws.terminate();
      continue;
    }

    state.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_INTERVAL_MS);

// ── Graceful shutdown ──
let isShuttingDown = false;

const gracefulShutdown = async (): Promise<void> => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ event: "server.shutting-down" });

  // Broadcast server-shutdown to all connected clients
  const shutdownMessage: ServerShutdownMessage = { type: "server-shutdown" };
  for (const [, ws] of peerSockets) {
    try {
      sendJson(ws, shutdownMessage);
      ws.close(1001, "Server shutting down");
    } catch { /* ignore errors during shutdown */ }
  }

  // Stop heartbeat
  clearInterval(heartbeatInterval);

  // Close WebSocket server
  wss.close();

  // Close HTTP server
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));

  // Flush SQLite if applicable
  if (store instanceof SqliteStore) {
    try { store.close(); } catch { /* ignore */ }
  }

  logger.info({ event: "server.stopped" });
  process.exit(0);
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

httpServer.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

wss.on("connection", (socket, request) => {
  if (isShuttingDown) {
    socket.close(1001, "Server shutting down");
    return;
  }

  const peerId = randomUUID();
  const remoteIp = request.socket.remoteAddress ?? "unknown";
  peerSockets.set(peerId, socket);
  peerState.set(peerId, {
    isAlive: true,
    publicKeyHex: null,
    ip: remoteIp,
    msgTimestamps: [],
    createTavernTimestamps: [],
    violations: 0
  });

  logger.info({ event: "peer.connected", peerId, remoteAddress: remoteIp });

  // Heartbeat pong handler
  socket.on("pong", () => {
    const state = peerState.get(peerId);
    if (state) state.isAlive = true;
  });

  socket.on("message", async (rawPayload) => {
    const state = peerState.get(peerId);
    if (!state) return;

    // ── Per-message rate limit ──
    if (!checkMessageRate(state)) {
      state.violations++;
      logger.warn({ event: "rate-limit.messages", peerId, violations: state.violations });
      sendError(socket, "rate-limited");
      if (state.violations >= RATE_VIOLATION_LIMIT) {
        logger.warn({ event: "rate-limit.disconnect", peerId, reason: "too-many-violations" });
        socket.close(1008, "Rate limited");
        return;
      }
      return;
    }

    const payloadText = typeof rawPayload === "string" ? rawPayload : rawPayload.toString("utf8");
    const message = parseClientMessage(payloadText);

    if (!message) {
      logger.debug({ event: "message.ignored", peerId, reason: "malformed" });
      return;
    }

    // Track for /metrics
    recordMessage();

    if (message.type === "create-tavern") {
      // ── Per-IP create-tavern rate limit ──
      const state = peerState.get(peerId);
      if (state && !checkCreateTavernRate(state.ip)) {
        state.violations++;
        logger.warn({ event: "rate-limit.create-tavern", peerId, ip: state.ip, violations: state.violations });
        sendError(socket, "rate-limited");
        if (state.violations >= RATE_VIOLATION_LIMIT) {
          socket.close(1008, "Rate limited");
        }
        return;
      }

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
      // ── Duplicate connection guard ──
      const joiningPublicKey = message.identity.publicKeyHex;
      const existingPeerId = identityToPeerId.get(joiningPublicKey);
      if (existingPeerId && existingPeerId !== peerId) {
        const existingSocket = peerSockets.get(existingPeerId);
        if (existingSocket && existingSocket.readyState === 1) {
          const replacedMsg: ServerSessionReplacedMessage = { type: "session-replaced" };
          sendJson(existingSocket, replacedMsg);
          logger.info({ event: "peer.session-replaced", oldPeerId: existingPeerId, newPeerId: peerId, publicKeyHex: joiningPublicKey });
          existingSocket.close(1000, "Session replaced");
        }
        identityToPeerId.delete(joiningPublicKey);
      }
      identityToPeerId.set(joiningPublicKey, peerId);

      // Track identity on peer state
      const currentState = peerState.get(peerId);
      if (currentState) currentState.publicKeyHex = joiningPublicKey;

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

    // Clean up identity tracking
    const state = peerState.get(peerId);
    if (state?.publicKeyHex) {
      const currentMapping = identityToPeerId.get(state.publicKeyHex);
      // Only delete if it still points to this peerId (not already replaced)
      if (currentMapping === peerId) {
        identityToPeerId.delete(state.publicKeyHex);
      }
    }

    peerSockets.delete(peerId);
    peerState.delete(peerId);

    logger.info({ event: "peer.disconnected", peerId, roomId: leaveResult?.roomId ?? null });
  });

  socket.on("error", (error) => {
    logger.error({ event: "peer.error", peerId, message: error.message });
  });
});

httpServer.listen(port, "0.0.0.0", () => {
  logger.info({ event: "server.started", port, store: storeBackend, logLevel, taverns: tavernRooms.tavernCount() });
});
