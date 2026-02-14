import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteStore } from "../../src/sqlite-store.js";
import type { TavernRecord, ChannelRecord } from "../../src/store.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const makeTavern = (id: string, name = "Test Tavern"): TavernRecord => ({
  id,
  name,
  icon: "",
  creatorPublicKey: "abc123",
  createdAt: new Date().toISOString(),
  signalingUrl: ""
});

const makeChannel = (id: string, tavernId: string, name = "General"): ChannelRecord => ({
  id,
  tavernId,
  name,
  createdAt: new Date().toISOString()
});

describe("SqliteStore", () => {
  let tmpDir: string;
  let dbPath: string;
  let store: SqliteStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "tavern-test-"));
    dbPath = join(tmpDir, "test.db");
    store = new SqliteStore(dbPath);
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("database initialization", () => {
    it("creates the database file on construction", async () => {
      const { existsSync } = await import("node:fs");
      expect(existsSync(dbPath)).toBe(true);
    });

    it("creates tables automatically", async () => {
      // Should not throw — tables exist
      const taverns = await store.listTaverns();
      expect(taverns).toEqual([]);
    });
  });

  describe("createTavern / getTavern", () => {
    it("creates and retrieves a tavern", async () => {
      const tavern = makeTavern("t1", "My Tavern");
      await store.createTavern(tavern);

      const result = await store.getTavern("t1");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("My Tavern");
      expect(result!.id).toBe("t1");
    });

    it("returns null for non-existent tavern", async () => {
      const result = await store.getTavern("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("listTaverns", () => {
    it("returns empty array when no taverns exist", async () => {
      const result = await store.listTaverns();
      expect(result).toEqual([]);
    });

    it("lists all created taverns", async () => {
      await store.createTavern(makeTavern("t1", "Tavern A"));
      await store.createTavern(makeTavern("t2", "Tavern B"));

      const result = await store.listTaverns();
      expect(result).toHaveLength(2);
    });
  });

  describe("updateTavern", () => {
    it("updates tavern fields", async () => {
      await store.createTavern(makeTavern("t1", "Old Name"));
      await store.updateTavern("t1", { name: "New Name" });

      const result = await store.getTavern("t1");
      expect(result!.name).toBe("New Name");
    });
  });

  describe("deleteTavern", () => {
    it("removes a tavern", async () => {
      await store.createTavern(makeTavern("t1"));
      await store.deleteTavern("t1");

      const result = await store.getTavern("t1");
      expect(result).toBeNull();
    });

    it("cascade deletes channels (via foreign key)", async () => {
      await store.createTavern(makeTavern("t1"));
      await store.createChannel("t1", makeChannel("c1", "t1", "General"));
      await store.createChannel("t1", makeChannel("c2", "t1", "Voice"));

      await store.deleteTavern("t1");

      const channels = await store.getChannels("t1");
      expect(channels).toEqual([]);
    });
  });

  describe("createChannel / getChannels", () => {
    it("creates and retrieves channels", async () => {
      await store.createTavern(makeTavern("t1"));
      await store.createChannel("t1", makeChannel("c1", "t1", "General"));
      await store.createChannel("t1", makeChannel("c2", "t1", "Gaming"));

      const channels = await store.getChannels("t1");
      expect(channels).toHaveLength(2);
    });

    it("returns empty array for tavern with no channels", async () => {
      await store.createTavern(makeTavern("t1"));
      const channels = await store.getChannels("t1");
      expect(channels).toEqual([]);
    });
  });

  describe("deleteChannel", () => {
    it("removes a specific channel", async () => {
      await store.createTavern(makeTavern("t1"));
      await store.createChannel("t1", makeChannel("c1", "t1", "General"));
      await store.createChannel("t1", makeChannel("c2", "t1", "Voice"));

      await store.deleteChannel("t1", "c1");

      const channels = await store.getChannels("t1");
      expect(channels).toHaveLength(1);
      expect(channels[0].name).toBe("Voice");
    });
  });

  describe("persistence across re-instantiation", () => {
    it("data survives store recreation (simulated restart)", async () => {
      await store.createTavern(makeTavern("t1", "Persistent Tavern"));
      await store.createChannel("t1", makeChannel("c1", "t1", "General"));

      // Close original, create a new store instance pointing to the same DB
      store.close();
      const store2 = new SqliteStore(dbPath);
      // Reassign so afterEach closes the right one
      store = store2;
      const tavern = await store2.getTavern("t1");
      expect(tavern).not.toBeNull();
      expect(tavern!.name).toBe("Persistent Tavern");

      const channels = await store2.getChannels("t1");
      expect(channels).toHaveLength(1);
      expect(channels[0].name).toBe("General");
    });
  });
});
