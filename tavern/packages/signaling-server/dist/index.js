// WebSocket signaling server entry point for room-based WebRTC coordination.
import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";
import { RoomManager } from "./room-manager.js";
import { parseClientMessage } from "./types.js";
const DEFAULT_PORT = 8080;
const MAX_PEERS_PER_ROOM = 8;
const rawPort = process.env.PORT;
const parsedPort = rawPort ? Number.parseInt(rawPort, 10) : Number.NaN;
const port = Number.isFinite(parsedPort) ? parsedPort : DEFAULT_PORT;
const roomManager = new RoomManager(MAX_PEERS_PER_ROOM);
const peerIdentityById = new Map();
const server = new WebSocketServer({ port, host: "0.0.0.0" });
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
server.on("connection", (socket, request) => {
    const peerId = randomUUID();
    writeLog("peer.connected", {
        peerId,
        remoteAddress: request.socket.remoteAddress ?? null
    });
    socket.on("message", (rawPayload) => {
        const payloadText = typeof rawPayload === "string" ? rawPayload : rawPayload.toString("utf8");
        const message = parseClientMessage(payloadText);
        if (!message) {
            writeLog("message.ignored", { peerId, reason: "malformed" });
            return;
        }
        if (message.type === "join") {
            const roomId = message.room.trim();
            const joinResult = roomManager.joinRoom(roomId, peerId, socket);
            if (!joinResult.ok) {
                if (joinResult.reason === "room-full") {
                    sendError(socket, "Room full");
                }
                writeLog("room.join.rejected", {
                    peerId,
                    roomId,
                    reason: joinResult.reason
                });
                return;
            }
            if (message.identity) {
                peerIdentityById.set(peerId, message.identity);
            }
            else {
                peerIdentityById.delete(peerId);
            }
            const peerListMessage = {
                type: "peer-list",
                peers: roomManager
                    .listPeerIds(roomId)
                    .filter((id) => id !== peerId)
                    .map((id) => ({
                    peerId: id,
                    identity: peerIdentityById.get(id)
                }))
            };
            sendJson(socket, peerListMessage);
            const joinedMessage = {
                type: "peer-joined",
                peerId,
                identity: peerIdentityById.get(peerId)
            };
            roomManager.broadcastToRoom(roomId, JSON.stringify(joinedMessage), peerId);
            writeLog("room.joined", {
                peerId,
                roomId
            });
            return;
        }
        const roomId = roomManager.getRoomForPeer(peerId);
        if (!roomId) {
            sendError(socket, "Join a room before signaling");
            writeLog("message.rejected", { peerId, reason: "not-in-room", type: message.type });
            return;
        }
        if (message.type === "update-identity") {
            peerIdentityById.set(peerId, message.identity);
            const updatedMessage = {
                type: "peer-identity-updated",
                peerId,
                identity: message.identity
            };
            roomManager.broadcastToRoom(roomId, JSON.stringify(updatedMessage), peerId);
            return;
        }
        if (message.type === "offer") {
            const relayMessage = {
                type: "offer",
                from: peerId,
                identity: peerIdentityById.get(peerId),
                sdp: message.sdp
            };
            if (message.target) {
                roomManager.sendToPeer(roomId, message.target, JSON.stringify(relayMessage));
            }
            else {
                roomManager.broadcastToRoom(roomId, JSON.stringify(relayMessage), peerId);
            }
            return;
        }
        if (message.type === "answer") {
            const relayMessage = {
                type: "answer",
                from: peerId,
                identity: peerIdentityById.get(peerId),
                sdp: message.sdp
            };
            roomManager.sendToPeer(roomId, message.target, JSON.stringify(relayMessage));
            return;
        }
        const relayMessage = {
            type: "ice-candidate",
            from: peerId,
            identity: peerIdentityById.get(peerId),
            candidate: message.candidate
        };
        roomManager.sendToPeer(roomId, message.target, JSON.stringify(relayMessage));
    });
    socket.on("close", () => {
        const identity = peerIdentityById.get(peerId);
        peerIdentityById.delete(peerId);
        const leaveResult = roomManager.leaveRoom(peerId);
        if (leaveResult) {
            const peerLeftMessage = {
                type: "peer-left",
                peerId,
                identity
            };
            roomManager.broadcastToRoom(leaveResult.roomId, JSON.stringify(peerLeftMessage), peerId);
            writeLog("peer.disconnected", {
                peerId,
                roomId: leaveResult.roomId
            });
            return;
        }
        writeLog("peer.disconnected", {
            peerId,
            roomId: null
        });
    });
    socket.on("error", (error) => {
        writeLog("peer.error", {
            peerId,
            message: error.message
        });
    });
});
writeLog("server.started", { port });
