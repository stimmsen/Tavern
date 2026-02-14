import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startServer, connectClient, type TestServer } from "./helpers.js";

describe("identity update", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer({ store: "memory" });
  });

  afterAll(async () => {
    await server.stop();
  });

  it("should broadcast peer-identity-updated to channel peers", async () => {
    const alice = await connectClient(server.url);
    const bob = await connectClient(server.url);

    try {
      alice.send({ type: "create-tavern", name: "Identity Tavern" });
      const created: any = await alice.waitForMessage("tavern-created");
      const tavernId = created.tavern.id;

      alice.send({ type: "create-channel", tavernId, name: "Chat" });
      const channelMsg: any = await alice.waitForMessage("channel-created");
      const channelId = channelMsg.channel.id;

      alice.send({
        type: "join-channel", tavernId, channelId,
        identity: { publicKeyHex: "alice_hex", displayName: "Alice", tag: "TVN-AAAA-AAAA" }
      });
      await alice.waitForMessage("channel-joined");

      bob.send({
        type: "join-channel", tavernId, channelId,
        identity: { publicKeyHex: "bob_hex", displayName: "Bob", tag: "TVN-BBBB-BBBB" }
      });
      await bob.waitForMessage("channel-joined");
      await alice.waitForMessage("peer-joined-channel");

      // Alice updates identity
      alice.send({
        type: "update-identity",
        identity: { publicKeyHex: "alice_hex", displayName: "Alice 2.0", tag: "TVN-AAAA-AAAA" }
      });

      const updateMsg: any = await bob.waitForMessage("peer-identity-updated");
      expect(updateMsg.type).toBe("peer-identity-updated");
      expect(updateMsg.identity.displayName).toBe("Alice 2.0");
    } finally {
      await alice.close();
      await bob.close();
    }
  });
});
