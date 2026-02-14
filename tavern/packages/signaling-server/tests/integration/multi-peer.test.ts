import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startServer, connectClient, sleep, type TestServer } from "./helpers.js";

describe("multi-peer scenarios", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer({ store: "memory" });
  });

  afterAll(async () => {
    await server.stop();
  });

  it("should handle 4 peers joining the same channel", async () => {
    const clients = await Promise.all(
      Array.from({ length: 4 }, () => connectClient(server.url))
    );

    try {
      const [host, ...others] = clients;

      // Host creates tavern + channel
      host.send({ type: "create-tavern", name: "Multi Tavern" });
      const created: any = await host.waitForMessage("tavern-created");
      const tavernId = created.tavern.id;

      host.send({ type: "create-channel", tavernId, name: "Main" });
      const channelMsg: any = await host.waitForMessage("channel-created");
      const channelId = channelMsg.channel.id;

      // Host joins
      host.send({
        type: "join-channel",
        tavernId,
        channelId,
        identity: { publicKeyHex: "p0", displayName: "Peer0", tag: "TVN-0000-0000" }
      });
      const hostJoined: any = await host.waitForMessage("channel-joined");
      expect(hostJoined.peers).toHaveLength(0);

      // Other 3 join sequentially
      for (let i = 0; i < others.length; i++) {
        others[i].send({
          type: "join-channel",
          tavernId,
          channelId,
          identity: { publicKeyHex: `p${i + 1}`, displayName: `Peer${i + 1}`, tag: `TVN-000${i + 1}-000${i + 1}` }
        });

        const joined: any = await others[i].waitForMessage("channel-joined");
        // Should see i+1 existing peers (all previously joined)
        expect(joined.peers).toHaveLength(i + 1);
      }

      // Host should have received 3 peer-joined-channel messages
      for (let i = 0; i < 3; i++) {
        const pjMsg: any = await host.waitForMessage("peer-joined-channel");
        expect(pjMsg.type).toBe("peer-joined-channel");
      }
    } finally {
      await Promise.all(clients.map(c => c.close()));
    }
  });

  it("should broadcast peer-left-channel on disconnect", async () => {
    const alice = await connectClient(server.url);
    const bob = await connectClient(server.url);

    try {
      alice.send({ type: "create-tavern", name: "DC Tavern" });
      const created: any = await alice.waitForMessage("tavern-created");
      const tavernId = created.tavern.id;

      alice.send({ type: "create-channel", tavernId, name: "Voice" });
      const channelMsg: any = await alice.waitForMessage("channel-created");
      const channelId = channelMsg.channel.id;

      // Both join
      alice.send({
        type: "join-channel", tavernId, channelId,
        identity: { publicKeyHex: "aaa", displayName: "Alice", tag: "TVN-AAAA-AAAA" }
      });
      await alice.waitForMessage("channel-joined");

      bob.send({
        type: "join-channel", tavernId, channelId,
        identity: { publicKeyHex: "bbb", displayName: "Bob", tag: "TVN-BBBB-BBBB" }
      });
      await bob.waitForMessage("channel-joined");
      await alice.waitForMessage("peer-joined-channel");

      // Bob disconnects abruptly
      await bob.close();

      // Alice should see peer-left-channel
      const leftMsg: any = await alice.waitForMessage("peer-left-channel");
      expect(leftMsg.type).toBe("peer-left-channel");
      expect(leftMsg.publicKeyHex).toBe("bbb");
    } finally {
      await alice.close();
    }
  });

  it("should relay offer/answer/ice-candidate between peers", async () => {
    const alice = await connectClient(server.url);
    const bob = await connectClient(server.url);

    try {
      alice.send({ type: "create-tavern", name: "Signal Tavern" });
      const created: any = await alice.waitForMessage("tavern-created");
      const tavernId = created.tavern.id;

      alice.send({ type: "create-channel", tavernId, name: "Signal" });
      const channelMsg: any = await alice.waitForMessage("channel-created");
      const channelId = channelMsg.channel.id;

      alice.send({
        type: "join-channel", tavernId, channelId,
        identity: { publicKeyHex: "alice_pk", displayName: "Alice", tag: "TVN-AAAA-AAAA" }
      });
      await alice.waitForMessage("channel-joined");

      bob.send({
        type: "join-channel", tavernId, channelId,
        identity: { publicKeyHex: "bob_pk", displayName: "Bob", tag: "TVN-BBBB-BBBB" }
      });
      await bob.waitForMessage("channel-joined");
      await alice.waitForMessage("peer-joined-channel");

      // Alice sends offer to Bob
      alice.send({
        type: "offer",
        sdp: "v=0\r\ntest-sdp",
        target: "bob_pk",
        tavernId,
        channelId
      });

      const offer: any = await bob.waitForMessage("offer");
      expect(offer.type).toBe("offer");
      expect(offer.sdp).toBe("v=0\r\ntest-sdp");
      expect(offer.from).toBe("alice_pk");

      // Bob sends answer back to Alice
      bob.send({
        type: "answer",
        sdp: "v=0\r\nanswer-sdp",
        target: "alice_pk",
        tavernId,
        channelId
      });

      const answer: any = await alice.waitForMessage("answer");
      expect(answer.type).toBe("answer");
      expect(answer.sdp).toBe("v=0\r\nanswer-sdp");
      expect(answer.from).toBe("bob_pk");

      // ICE candidate relay
      alice.send({
        type: "ice-candidate",
        candidate: "candidate:123",
        target: "bob_pk",
        tavernId,
        channelId
      });

      const ice: any = await bob.waitForMessage("ice-candidate");
      expect(ice.type).toBe("ice-candidate");
      expect(ice.candidate).toBe("candidate:123");
      expect(ice.from).toBe("alice_pk");
    } finally {
      await alice.close();
      await bob.close();
    }
  });
});
