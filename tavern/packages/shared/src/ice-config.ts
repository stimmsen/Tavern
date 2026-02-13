// Shared ICE server configuration for WebRTC peer connections.
export const iceServers: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
  // TODO: Add TURN server configuration when coturn credentials are available.
];
