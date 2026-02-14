import { describe, it, expect } from "vitest";
import { generateKeypair, exportKeypair, importKeypair } from "../../src/keypair.js";

describe("export to .tavern-key format", () => {
  it("produces a valid key file payload with all required fields", async () => {
    const keypair = await generateKeypair();
    const exported = await exportKeypair(keypair);

    const payload = {
      version: 1,
      type: "tavern-keypair-export" as const,
      publicKeyHex: exported.publicKeyHex,
      privateKeyHex: exported.privateKeyHex,
      exportedAt: new Date().toISOString()
    };

    expect(payload.version).toBe(1);
    expect(payload.type).toBe("tavern-keypair-export");
    expect(typeof payload.publicKeyHex).toBe("string");
    expect(typeof payload.privateKeyHex).toBe("string");
    expect(typeof payload.exportedAt).toBe("string");
    // Verify ISO date format
    expect(new Date(payload.exportedAt).toISOString()).toBe(payload.exportedAt);
  });

  it("exported hex strings are valid hex", async () => {
    const keypair = await generateKeypair();
    const exported = await exportKeypair(keypair);

    expect(exported.publicKeyHex).toMatch(/^[0-9a-f]+$/);
    expect(exported.privateKeyHex).toMatch(/^[0-9a-f]+$/);
  });
});

describe("import from .tavern-key format", () => {
  it("imports a keypair from valid exported hex", async () => {
    const original = await generateKeypair();
    const exported = await exportKeypair(original);

    const imported = await importKeypair({
      publicKeyHex: exported.publicKeyHex,
      privateKeyHex: exported.privateKeyHex
    });

    expect(imported.publicKey).toBeDefined();
    expect(imported.privateKey).toBeDefined();
  });

  it("imported keypair matches original public key", async () => {
    const original = await generateKeypair();
    const exported = await exportKeypair(original);
    const imported = await importKeypair(exported);

    const originalRaw = await crypto.subtle.exportKey("raw", original.publicKey);
    const importedRaw = await crypto.subtle.exportKey("raw", imported.publicKey);

    expect(new Uint8Array(importedRaw)).toEqual(new Uint8Array(originalRaw));
  });

  it("rejects malformed public key hex", async () => {
    await expect(
      importKeypair({ publicKeyHex: "not-valid-hex", privateKeyHex: "0".repeat(128) })
    ).rejects.toThrow();
  });

  it("rejects empty strings", async () => {
    await expect(
      importKeypair({ publicKeyHex: "", privateKeyHex: "" })
    ).rejects.toThrow();
  });
});
