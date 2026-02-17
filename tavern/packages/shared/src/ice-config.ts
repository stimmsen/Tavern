// Shared ICE server configuration for WebRTC peer connections.
// TURN credentials use coturn's time-limited HMAC scheme (use-auth-secret).

const DEFAULT_TURN_HOST = "159.203.140.89";
const TURN_SECRET = "tavern-dev-secret";

/**
 * Extract the hostname from a signaling WebSocket URL so the TURN server
 * automatically matches the signaling server.  Falls back to the default
 * host when the URL cannot be parsed.
 */
const turnHostFromSignalingUrl = (signalingUrl: string | undefined): string => {
  if (!signalingUrl) {
    return DEFAULT_TURN_HOST;
  }

  try {
    // Convert ws:// / wss:// to http(s):// so the URL constructor can parse it.
    const httpUrl = signalingUrl.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
    return new URL(httpUrl).hostname;
  } catch {
    return DEFAULT_TURN_HOST;
  }
};

/**
 * Generate temporary TURN credentials using coturn's TURN REST API
 * authentication (HMAC-SHA1 over the username with the shared secret).
 * Credentials are valid for 24 hours.
 */
const generateTurnCredentials = async (): Promise<{ username: string; credential: string }> => {
  const ttl = 86_400; // 24 hours
  const expiry = Math.floor(Date.now() / 1_000) + ttl;
  const username = `${expiry}:tavern`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(TURN_SECRET),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(username));
  const credential = btoa(String.fromCharCode(...new Uint8Array(signature)));

  return { username, credential };
};

/**
 * Build the ICE server list.  When a signaling URL is provided the TURN
 * host is derived from it so that changing the server in settings also
 * routes media through the matching TURN relay.
 */
export const getIceServers = async (signalingUrl?: string): Promise<RTCIceServer[]> => {
  const turn = await generateTurnCredentials();
  const host = turnHostFromSignalingUrl(signalingUrl);

  const isSecure = signalingUrl ? /^wss:/i.test(signalingUrl) : false;

  const turnUrls = isSecure
    ? [`turns:${host}:5349`, `turns:${host}:5349?transport=tcp`]
    : [`turn:${host}:3478`, `turn:${host}:3478?transport=tcp`];

  return [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: turnUrls,
      username: turn.username,
      credential: turn.credential
    }
  ];
};

/** @deprecated Use getIceServers() for TURN support */
export const iceServers: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
];
