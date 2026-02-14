import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStore } from "../../src/memory-store.js";
import type { TavernRecord, ChannelRecord } from "../../src/store.js";

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

describe("MemoryStore", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
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
      expect(result.map((t) => t.name).sort()).toEqual(["Tavern A", "Tavern B"]);
    });
  });

  describe("updateTavern", () => {
    it("updates tavern fields", async () => {
      await store.createTavern(makeTavern("t1", "Old Name"));
      await store.updateTavern("t1", { name: "New Name" });

      const result = await store.getTavern("t1");
      expect(result!.name).toBe("New Name");
    });

    it("does nothing for non-existent tavern", async () => {
      await store.updateTavern("nonexistent", { name: "Nope" });
      const result = await store.getTavern("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("deleteTavern", () => {
    it("removes a tavern", async () => {
      await store.createTavern(makeTavern("t1"));
      await store.deleteTavern("t1");

      const result = await store.getTavern("t1");
      expect(result).toBeNull();
    });

    it("cascade deletes channels when tavern is deleted", async () => {
      await store.createTavern(makeTavern("t1"));
      await store.createChannel("t1", makeChannel("c1", "t1", "General"));
      await store.createChannel("t1", makeChannel("c2", "t1", "Voice"));

      await store.deleteTavern("t1");

      const channels = await store.getChannels("t1");
      expect(channels).toEqual([]);
    });
  });

  describe("createChannel / getChannels", () => {
    it("creates and retrieves channels for a tavern", async () => {
      await store.createTavern(makeTavern("t1"));
      await store.createChannel("t1", makeChannel("c1", "t1", "General"));
      await store.createChannel("t1", makeChannel("c2", "t1", "Gaming"));

      const channels = await store.getChannels("t1");
      expect(channels).toHaveLength(2);
      expect(channels.map((c) => c.name).sort()).toEqual(["Gaming", "General"]);
    });

    it("returns empty array for tavern with no channels", async () => {
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

    it("does nothing when channel does not exist", async () => {
      await store.createTavern(makeTavern("t1"));
      await store.createChannel("t1", makeChannel("c1", "t1", "General"));

      await store.deleteChannel("t1", "nonexistent");

      const channels = await store.getChannels("t1");
      expect(channels).toHaveLength(1);
    });
  });
});
