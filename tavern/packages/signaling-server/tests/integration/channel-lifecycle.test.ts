import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startServer, connectClient, type TestServer, type TestClient } from "./helpers.js";

describe("channel lifecycle", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer({ store: "memory" });
  });

  afterAll(async () => {
    await server.stop();
  });

  it("should create a channel in a tavern", async () => {
    const client = await connectClient(server.url);
    try {
      // Create tavern first
      client.send({ type: "create-tavern", name: "Channel Test Tavern" });
      const created: any = await client.waitForMessage("tavern-created");
      const tavernId = created.tavern.id;

      // Create channel
      client.send({ type: "create-channel", tavernId, name: "General" });
      const channelMsg: any = await client.waitForMessage("channel-created");

      expect(channelMsg.type).toBe("channel-created");
      expect(channelMsg.tavernId).toBe(tavernId);
      expect(channelMsg.channel.name).toBe("General");
      expect(channelMsg.channel.id).toBeTruthy();
    } finally {
      await client.close();
    }
  });

  it("should join a channel and receive channel-joined with peer list", async () => {
    const client = await connectClient(server.url);
    try {
      // Create tavern + channel
      client.send({ type: "create-tavern", name: "Join Tavern" });
      const created: any = await client.waitForMessage("tavern-created");
      const tavernId = created.tavern.id;

      client.send({ type: "create-channel", tavernId, name: "Voice" });
      const channelMsg: any = await client.waitForMessage("channel-created");
      const channelId = channelMsg.channel.id;

      // Join channel
      client.send({
        type: "join-channel",
        tavernId,
        channelId,
        identity: { publicKeyHex: "aabb", displayName: "Alice", tag: "TVN-1234-5678" }
      });

      const joinedMsg: any = await client.waitForMessage("channel-joined");
      expect(joinedMsg.type).toBe("channel-joined");
      expect(joinedMsg.tavernId).toBe(tavernId);
      expect(joinedMsg.channelId).toBe(channelId);
      expect(Array.isArray(joinedMsg.peers)).toBe(true);
      // First joiner gets empty peer list
      expect(joinedMsg.peers).toHaveLength(0);
    } finally {
      await client.close();
    }
  });

  it("should broadcast peer-joined-channel to existing peers", async () => {
    const alice = await connectClient(server.url);
    const bob = await connectClient(server.url);
    try {
      // Alice creates tavern + channel, joins
      alice.send({ type: "create-tavern", name: "Broadcast Tavern" });
      const created: any = await alice.waitForMessage("tavern-created");
      const tavernId = created.tavern.id;

      alice.send({ type: "create-channel", tavernId, name: "Lobby" });
      const channelMsg: any = await alice.waitForMessage("channel-created");
      const channelId = channelMsg.channel.id;

      alice.send({
        type: "join-channel",
        tavernId,
        channelId,
        identity: { publicKeyHex: "aa11", displayName: "Alice", tag: "TVN-0001-0001" }
      });
      await alice.waitForMessage("channel-joined");

      // Bob joins
      bob.send({
        type: "join-channel",
        tavernId,
        channelId,
        identity: { publicKeyHex: "bb22", displayName: "Bob", tag: "TVN-0002-0002" }
      });

      // Bob gets channel-joined with Alice in peer list
      const bobJoined: any = await bob.waitForMessage("channel-joined");
      expect(bobJoined.peers).toHaveLength(1);
      expect(bobJoined.peers[0].publicKeyHex).toBe("aa11");
      expect(bobJoined.peers[0].displayName).toBe("Alice");

      // Alice gets peer-joined-channel for Bob
      const peerJoined: any = await alice.waitForMessage("peer-joined-channel");
      expect(peerJoined.type).toBe("peer-joined-channel");
      expect(peerJoined.peer.publicKeyHex).toBe("bb22");
      expect(peerJoined.peer.displayName).toBe("Bob");
    } finally {
      await alice.close();
      await bob.close();
    }
  });

  it("should leave channel and broadcast peer-left-channel", async () => {
    const alice = await connectClient(server.url);
    const bob = await connectClient(server.url);
    try {
      alice.send({ type: "create-tavern", name: "Leave Tavern" });
      const created: any = await alice.waitForMessage("tavern-created");
      const tavernId = created.tavern.id;

      alice.send({ type: "create-channel", tavernId, name: "Room" });
      const channelMsg: any = await alice.waitForMessage("channel-created");
      const channelId = channelMsg.channel.id;

      // Both join
      alice.send({
        type: "join-channel", tavernId, channelId,
        identity: { publicKeyHex: "cc33", displayName: "Alice", tag: "TVN-0003-0003" }
      });
      await alice.waitForMessage("channel-joined");

      bob.send({
        type: "join-channel", tavernId, channelId,
        identity: { publicKeyHex: "dd44", displayName: "Bob", tag: "TVN-0004-0004" }
      });
      await bob.waitForMessage("channel-joined");
      // Drain alice's peer-joined-channel
      await alice.waitForMessage("peer-joined-channel");

      // Bob leaves
      bob.send({ type: "leave-channel", tavernId, channelId });

      // Alice sees peer-left-channel
      const leftMsg: any = await alice.waitForMessage("peer-left-channel");
      expect(leftMsg.type).toBe("peer-left-channel");
      expect(leftMsg.publicKeyHex).toBe("dd44");
    } finally {
      await alice.close();
      await bob.close();
    }
  });

  it("should error when creating channel in non-existent tavern", async () => {
    const client = await connectClient(server.url);
    try {
      client.send({ type: "create-channel", tavernId: "fake-id", name: "Oops" });
      const msg: any = await client.waitForMessage("error");

      expect(msg.type).toBe("error");
      expect(msg.message).toMatch(/not found/i);
    } finally {
      await client.close();
    }
  });

  it("should error when joining non-existent channel", async () => {
    const client = await connectClient(server.url);
    try {
      client.send({ type: "create-tavern", name: "T" });
      const created: any = await client.waitForMessage("tavern-created");

      client.send({
        type: "join-channel",
        tavernId: created.tavern.id,
        channelId: "fake-channel",
        identity: { publicKeyHex: "ee55", displayName: "X", tag: "TVN-0005-0005" }
      });

      const msg: any = await client.waitForMessage("error");
      expect(msg.type).toBe("error");
      expect(msg.message).toMatch(/not found/i);
    } finally {
      await client.close();
    }
  });
});
