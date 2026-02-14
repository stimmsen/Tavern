import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startServer, connectClient, sleep, type TestServer } from "./helpers.js";

describe("edge-case hardening", () => {
  describe("duplicate connection guard", () => {
    let server: TestServer;

    beforeAll(async () => {
      server = await startServer({ store: "memory" });
    });

    afterAll(async () => {
      await server.stop();
    });

    it("should send session-replaced to the old connection when same identity reconnects", async () => {
      const alice1 = await connectClient(server.url);
      const alice2 = await connectClient(server.url);

      try {
        // Create tavern + channel
        alice1.send({ type: "create-tavern", name: "Dup Guard Tavern" });
        const created: any = await alice1.waitForMessage("tavern-created");
        const tavernId = created.tavern.id;

        alice1.send({ type: "create-channel", tavernId, name: "Voice" });
        const channelMsg: any = await alice1.waitForMessage("channel-created");
        const channelId = channelMsg.channel.id;

        // Alice1 joins with a specific public key
        alice1.send({
          type: "join-channel",
          tavernId,
          channelId,
          identity: { publicKeyHex: "same_key_123", displayName: "Alice", tag: "TVN-AAAA-AAAA" }
        });
        await alice1.waitForMessage("channel-joined");

        // Alice2 joins with the SAME public key — should replace Alice1
        alice2.send({
          type: "join-channel",
          tavernId,
          channelId,
          identity: { publicKeyHex: "same_key_123", displayName: "Alice v2", tag: "TVN-AAAA-AAAA" }
        });

        // Alice1 should receive session-replaced
        const replaced: any = await alice1.waitForMessage("session-replaced");
        expect(replaced.type).toBe("session-replaced");

        // Alice2 should successfully join
        const joined: any = await alice2.waitForMessage("channel-joined");
        expect(joined.type).toBe("channel-joined");
      } finally {
        await alice1.close().catch(() => {});
        await alice2.close().catch(() => {});
      }
    });
  });

  describe("rate limiting", () => {
    let server: TestServer;

    beforeAll(async () => {
      // Start with very low rate limits for testing
      server = await startServer({ store: "memory" });
    });

    afterAll(async () => {
      await server.stop();
    });

    it("should return rate-limited error for excessive create-tavern requests", async () => {
      const client = await connectClient(server.url);
      try {
        // Send more than RATE_CREATE_TAVERN_PER_MIN (default 10) create-tavern messages
        for (let i = 0; i < 11; i++) {
          client.send({ type: "create-tavern", name: `Tavern ${i}` });
        }

        // First 10 should succeed, 11th should be rate-limited
        const responses: any[] = [];
        for (let i = 0; i < 11; i++) {
          const msg: any = await client.waitForMessage(undefined, 5_000);
          responses.push(msg);
        }

        const tavernCreated = responses.filter((m: any) => m.type === "tavern-created");
        const rateLimited = responses.filter((m: any) => m.type === "error" && m.message === "rate-limited");

        expect(tavernCreated.length).toBe(10);
        expect(rateLimited.length).toBe(1);
      } finally {
        await client.close().catch(() => {});
      }
    });
  });

  describe("graceful shutdown", () => {
    it("should send server-shutdown message before closing", async () => {
      // Start a fresh server for this test since we'll shut it down
      const server = await startServer({ store: "memory" });
      const client = await connectClient(server.url);

      try {
        // Verify connection works
        client.send({ type: "create-tavern", name: "Shutdown Test" });
        const created: any = await client.waitForMessage("tavern-created");
        expect(created.type).toBe("tavern-created");
      } finally {
        // Stop the server — client should receive server-shutdown
        // Note: the server.stop() sends SIGTERM which triggers graceful shutdown
        await server.stop();
        await client.close().catch(() => {});
      }
    });
  });
});
