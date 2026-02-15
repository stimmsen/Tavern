// Shared ICE server configuration for WebRTC peer connections.
// TURN credentials use coturn's time-limited HMAC scheme (use-auth-secret).

const TURN_HOST = "159.203.140.89";
const TURN_SECRET = "tavern-dev-secret";

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

export const getIceServers = async (): Promise<RTCIceServer[]> => {
  const turn = await generateTurnCredentials();

  return [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: [`turn:${TURN_HOST}:3478`, `turn:${TURN_HOST}:3478?transport=tcp`],
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
