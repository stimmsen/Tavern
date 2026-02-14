// WebSocket signaling server entry point for room-based WebRTC coordination.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import { TavernRooms } from "./rooms.js";
import { RoomManager } from "./room-manager.js";
import { parseClientMessage } from "./types.js";
import { MemoryStore } from "./memory-store.js";
import { SqliteStore } from "./sqlite-store.js";
const DEFAULT_PORT = 3001;
const MAX_PEERS_PER_ROOM = 8;
const rawPort = process.env.PORT;
const parsedPort = rawPort ? Number.parseInt(rawPort, 10) : Number.NaN;
const port = Number.isFinite(parsedPort) ? parsedPort : DEFAULT_PORT;
const roomManager = new RoomManager(MAX_PEERS_PER_ROOM);
const storeBackend = process.env.TAVERN_STORE ?? "memory";
let store;
if (storeBackend === "memory") {
    store = new MemoryStore();
}
else if (storeBackend === "sqlite") {
    const dbPath = process.env.TAVERN_DB_PATH ?? "./data/tavern.db";
    store = new SqliteStore(dbPath);
}
else {
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
const peerSockets = new Map();
const writeLog = (event, data) => {
    process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), event, ...data })}\n`);
};
const sendJson = (socket, payload) => {
    socket.send(JSON.stringify(payload));
};
const sendError = (socket, message) => {
    const errorMessage = { type: "error", message };
    sendJson(socket, errorMessage);
};
const sendToPeerId = (peerId, payload) => {
    const socket = peerSockets.get(peerId);
    if (!socket || socket.readyState !== 1) {
        return false;
    }
    sendJson(socket, payload);
    return true;
};
const broadcastChannel = (tavernId, channelId, payload, exceptPeerId) => {
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
            const created = await tavernRooms.createTavern(message.name.trim(), typeof message.icon === "string" && message.icon.trim().length > 0 ? message.icon.trim() : undefined, "unknown");
            const response = { type: "tavern-created", tavern: created };
            sendJson(socket, response);
            return;
        }
        if (message.type === "get-tavern-info") {
            const tavern = tavernRooms.getTavernInfo(message.tavernId);
            if (!tavern) {
                sendError(socket, "Tavern not found");
                return;
            }
            const response = { type: "tavern-info", tavern };
            sendJson(socket, response);
            return;
        }
        if (message.type === "create-channel") {
            const channel = await tavernRooms.createChannel(message.tavernId, message.name.trim());
            if (!channel) {
                sendError(socket, "Tavern not found");
                return;
            }
            const response = {
                type: "channel-created",
                tavernId: message.tavernId,
                channel
            };
            sendJson(socket, response);
            return;
        }
        if (message.type === "join-channel") {
            const joinResult = tavernRooms.joinChannel(peerId, message.tavernId, message.channelId, message.identity);
            if (!joinResult.ok) {
                if (joinResult.reason === "channel-full") {
                    sendError(socket, "Channel full");
                    return;
                }
                sendError(socket, joinResult.reason === "tavern-not-found" ? "Tavern not found" : "Channel not found");
                return;
            }
            if (joinResult.previousLocation) {
                const leaveMessage = {
                    type: "peer-left-channel",
                    tavernId: joinResult.previousLocation.tavernId,
                    channelId: joinResult.previousLocation.channelId,
                    publicKeyHex: joinResult.joinedPeer.publicKeyHex
                };
                broadcastChannel(joinResult.previousLocation.tavernId, joinResult.previousLocation.channelId, leaveMessage, peerId);
            }
            const joinedMessage = {
                type: "channel-joined",
                tavernId: message.tavernId,
                channelId: message.channelId,
                peers: joinResult.existingPeers
            };
            sendJson(socket, joinedMessage);
            const peerJoinedMessage = {
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
            const leaveMessage = {
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
            const peerListMessage = {
                type: "peer-list",
                peers: roomManager
                    .listPeerIds(roomId)
                    .filter((id) => id !== peerId)
                    .map((id) => ({ peerId: id }))
            };
            sendJson(socket, peerListMessage);
            const joinedMessage = {
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
                const updatedMessage = {
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
            const legacyUpdatedMessage = {
                type: "peer-identity-updated",
                peerId,
                identity: message.identity
            };
            roomManager.broadcastToRoom(roomId, JSON.stringify(legacyUpdatedMessage), peerId);
            return;
        }
        if (message.type === "offer" || message.type === "answer" || message.type === "ice-candidate") {
            const sourcePeer = tavernRooms.getPeerInfo(peerId);
            const relayMessage = {
                type: message.type,
                from: sourcePeer?.publicKeyHex ?? peerId,
                tavernId: message.tavernId,
                channelId: message.channelId,
                sdp: "sdp" in message ? message.sdp : undefined,
                candidate: "candidate" in message ? message.candidate : undefined
            };
            if (message.tavernId && message.channelId) {
                if (message.target) {
                    const targetPeerId = tavernRooms.resolvePeerIdByPublicKey(message.tavernId, message.channelId, message.target);
                    if (!targetPeerId) {
                        sendError(socket, "Target peer not found in channel");
                        return;
                    }
                    sendToPeerId(targetPeerId, relayMessage);
                }
                else {
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
            }
            else {
                roomManager.broadcastToRoom(roomId, JSON.stringify(relayMessage), peerId);
            }
        }
    });
    socket.on("close", () => {
        const current = tavernRooms.leaveCurrentChannel(peerId);
        if (current) {
            const leaveMessage = {
                type: "peer-left-channel",
                tavernId: current.location.tavernId,
                channelId: current.location.channelId,
                publicKeyHex: current.peer.publicKeyHex
            };
            broadcastChannel(current.location.tavernId, current.location.channelId, leaveMessage, peerId);
        }
        const leaveResult = roomManager.leaveRoom(peerId);
        if (leaveResult) {
            const peerLeftMessage = {
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
