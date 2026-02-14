import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startServer, connectClient, type TestServer } from "./helpers.js";

describe("sqlite persistence", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer({ store: "sqlite" });
  });

  afterAll(async () => {
    await server.stop();
  });

  it("should persist taverns and channels across gets", async () => {
    const client = await connectClient(server.url);
    try {
      // Create a tavern with a channel
      client.send({ type: "create-tavern", name: "Persistent Tavern" });
      const created: any = await client.waitForMessage("tavern-created");
      const tavernId = created.tavern.id;

      client.send({ type: "create-channel", tavernId, name: "Saved Channel" });
      const channelMsg: any = await client.waitForMessage("channel-created");
      const channelId = channelMsg.channel.id;

      // Verify via get-tavern-info
      client.send({ type: "get-tavern-info", tavernId });
      const info: any = await client.waitForMessage("tavern-info");

      expect(info.tavern.name).toBe("Persistent Tavern");
      // Default "General" channel + created "Saved Channel"
      expect(info.tavern.channels).toHaveLength(2);
      const savedChannel = info.tavern.channels.find((c: any) => c.name === "Saved Channel");
      expect(savedChannel).toBeDefined();
      expect(savedChannel.id).toBe(channelId);
    } finally {
      await client.close();
    }
  });

  it("should handle tavern + channel creation with sqlite store", async () => {
    const a = await connectClient(server.url);
    const b = await connectClient(server.url);
    try {
      // A creates tavern
      a.send({ type: "create-tavern", name: "SQLite Tavern" });
      const created: any = await a.waitForMessage("tavern-created");
      const tavernId = created.tavern.id;

      // A creates channel
      a.send({ type: "create-channel", tavernId, name: "DB Channel" });
      const channelMsg: any = await a.waitForMessage("channel-created");
      const channelId = channelMsg.channel.id;

      // B queries the tavern — should see the channel too
      b.send({ type: "get-tavern-info", tavernId });
      const info: any = await b.waitForMessage("tavern-info");

      // Default "General" + created "DB Channel"
      expect(info.tavern.channels).toHaveLength(2);
      const dbChannel = info.tavern.channels.find((c: any) => c.name === "DB Channel");
      expect(dbChannel).toBeDefined();
      expect(dbChannel.id).toBe(channelId);

      // Both join and communicate
      a.send({
        type: "join-channel", tavernId, channelId,
        identity: { publicKeyHex: "aaa_sql", displayName: "A", tag: "TVN-A000-A000" }
      });
      await a.waitForMessage("channel-joined");

      b.send({
        type: "join-channel", tavernId, channelId,
        identity: { publicKeyHex: "bbb_sql", displayName: "B", tag: "TVN-B000-B000" }
      });
      const bJoined: any = await b.waitForMessage("channel-joined");
      expect(bJoined.peers).toHaveLength(1);
      expect(bJoined.peers[0].publicKeyHex).toBe("aaa_sql");
    } finally {
      await a.close();
      await b.close();
    }
  });
});
