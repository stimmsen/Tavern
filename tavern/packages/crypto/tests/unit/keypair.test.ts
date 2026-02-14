import { describe, it, expect } from "vitest";
import { generateKeypair, exportKeypair, importKeypair, getPublicKeyHex } from "../../src/keypair.js";
import { deriveIdentityTag } from "../../src/identity.js";

describe("generateKeypair", () => {
  it("generates an Ed25519 keypair with public and private keys", async () => {
    const keypair = await generateKeypair();
    expect(keypair.publicKey).toBeDefined();
    expect(keypair.privateKey).toBeDefined();
    expect(keypair.publicKey.type).toBe("public");
    expect(keypair.privateKey.type).toBe("private");
  });

  it("generates distinct keypairs on each call", async () => {
    const a = await generateKeypair();
    const b = await generateKeypair();
    const hexA = await getPublicKeyHex(a);
    const hexB = await getPublicKeyHex(b);
    expect(hexA).not.toBe(hexB);
  });
});

describe("exportKeypair / importKeypair", () => {
  it("exports a keypair to hex strings", async () => {
    const keypair = await generateKeypair();
    const exported = await exportKeypair(keypair);

    expect(typeof exported.publicKeyHex).toBe("string");
    expect(typeof exported.privateKeyHex).toBe("string");
    expect(exported.publicKeyHex.length).toBeGreaterThan(0);
    expect(exported.privateKeyHex.length).toBeGreaterThan(0);
    // Ed25519 raw public key is 32 bytes = 64 hex chars
    expect(exported.publicKeyHex.length).toBe(64);
  });

  it("round-trips through export → import", async () => {
    const original = await generateKeypair();
    const exported = await exportKeypair(original);
    const imported = await importKeypair(exported);

    const originalHex = await getPublicKeyHex(original);
    const importedHex = await getPublicKeyHex(imported);
    expect(importedHex).toBe(originalHex);
  });

  it("imported keypair can sign and verify", async () => {
    const original = await generateKeypair();
    const exported = await exportKeypair(original);
    const imported = await importKeypair(exported);

    const data = new TextEncoder().encode("hello tavern");
    const signature = await crypto.subtle.sign("Ed25519", imported.privateKey, data);
    const valid = await crypto.subtle.verify("Ed25519", imported.publicKey, signature, data);
    expect(valid).toBe(true);
  });
});

describe("getPublicKeyHex", () => {
  it("returns a 64-character hex string", async () => {
    const keypair = await generateKeypair();
    const hex = await getPublicKeyHex(keypair);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("deriveIdentityTag", () => {
  it("derives TVN-XXXX-XXXX format from public key hex", () => {
    const tag = deriveIdentityTag("a1b2c3d4e5f6a7b8");
    expect(tag).toBe("TVN-a1b2-c3d4");
  });

  it("pads short keys with zeros", () => {
    const tag = deriveIdentityTag("ab");
    expect(tag).toBe("TVN-ab00-0000");
  });

  it("uses only the first 8 hex chars", () => {
    const tag = deriveIdentityTag("1234567890abcdef");
    expect(tag).toBe("TVN-1234-5678");
  });
});
