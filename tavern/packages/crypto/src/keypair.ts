const STORAGE_KEY = "tavern-keypair";

export interface TavernKeypair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface ExportedKeypair {
  publicKeyHex: string;
  privateKeyHex: string;
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToArrayBuffer(hex: string): ArrayBuffer {
  if (hex.length % 2 !== 0) {
    throw new Error("Hex string length must be even");
  }

  const bytes = new Uint8Array(hex.length / 2);

  for (let index = 0; index < hex.length; index += 2) {
    const pair = hex.slice(index, index + 2);
    const value = Number.parseInt(pair, 16);

    if (Number.isNaN(value)) {
      throw new Error("Invalid hex string");
    }

    bytes[index / 2] = value;
  }

  return bytes.buffer;
}

export async function generateKeypair(): Promise<TavernKeypair> {
  const keyPair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);

  if (!("publicKey" in keyPair) || !("privateKey" in keyPair)) {
    throw new Error("Failed to generate Ed25519 keypair");
  }

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey
  };
}

export async function exportKeypair(keypair: TavernKeypair): Promise<ExportedKeypair> {
  const [rawPublicKey, pkcs8PrivateKey] = await Promise.all([
    crypto.subtle.exportKey("raw", keypair.publicKey),
    crypto.subtle.exportKey("pkcs8", keypair.privateKey)
  ]);

  return {
    publicKeyHex: arrayBufferToHex(rawPublicKey),
    privateKeyHex: arrayBufferToHex(pkcs8PrivateKey)
  };
}

export async function importKeypair(exported: ExportedKeypair): Promise<TavernKeypair> {
  const [publicKeyData, privateKeyData] = [
    hexToArrayBuffer(exported.publicKeyHex),
    hexToArrayBuffer(exported.privateKeyHex)
  ];

  const [publicKey, privateKey] = await Promise.all([
    crypto.subtle.importKey("raw", publicKeyData, "Ed25519", true, ["verify"]),
    crypto.subtle.importKey("pkcs8", privateKeyData, "Ed25519", true, ["sign"])
  ]);

  return { publicKey, privateKey };
}

function isExportedKeypair(value: unknown): value is ExportedKeypair {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.publicKeyHex === "string" && typeof candidate.privateKeyHex === "string";
}

export async function saveKeypair(keypair: TavernKeypair): Promise<void> {
  const exported = await exportKeypair(keypair);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(exported));
}

export async function loadKeypair(): Promise<TavernKeypair | null> {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isExportedKeypair(parsed)) {
    return null;
  }

  try {
    return await importKeypair(parsed);
  } catch {
    return null;
  }
}

export async function getOrCreateKeypair(): Promise<TavernKeypair> {
  const existing = await loadKeypair();

  if (existing) {
    console.log("[identity] Loaded existing keypair");
    return existing;
  }

  const generated = await generateKeypair();
  await saveKeypair(generated);
  console.log("[identity] Generated new keypair");
  return generated;
}

export async function getPublicKeyHex(keypair: TavernKeypair): Promise<string> {
  const rawPublicKey = await crypto.subtle.exportKey("raw", keypair.publicKey);
  return arrayBufferToHex(rawPublicKey);
}
