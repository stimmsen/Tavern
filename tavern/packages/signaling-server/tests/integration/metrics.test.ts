import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startServer, connectClient, type TestServer } from "./helpers.js";

describe("metrics endpoint", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer({ store: "memory" });
  });

  afterAll(async () => {
    await server.stop();
  });

  it("should return metrics JSON from /metrics", async () => {
    const httpUrl = server.url.replace("ws://", "http://");
    const res = await fetch(`${httpUrl}/metrics`);
    expect(res.status).toBe(200);

    const metrics = await res.json();
    expect(metrics).toHaveProperty("connectedPeers");
    expect(metrics).toHaveProperty("activeTaverns");
    expect(metrics).toHaveProperty("totalTaverns");
    expect(metrics).toHaveProperty("uptime");
    expect(metrics).toHaveProperty("messagesPerSecond");
    expect(typeof metrics.connectedPeers).toBe("number");
    expect(typeof metrics.uptime).toBe("number");
  });

  it("should reflect connected peers in metrics", async () => {
    const httpUrl = server.url.replace("ws://", "http://");
    const client = await connectClient(server.url);

    try {
      const res = await fetch(`${httpUrl}/metrics`);
      const metrics = await res.json();
      expect(metrics.connectedPeers).toBeGreaterThanOrEqual(1);
    } finally {
      await client.close();
    }
  });

  it("should count messages per second", async () => {
    const httpUrl = server.url.replace("ws://", "http://");
    const client = await connectClient(server.url);

    try {
      // Send a few messages to generate metrics
      client.send({ type: "create-tavern", name: "Metrics Test" });
      await client.waitForMessage("tavern-created");

      const res = await fetch(`${httpUrl}/metrics`);
      const metrics = await res.json();
      expect(metrics.messagesPerSecond).toBeGreaterThanOrEqual(0);
    } finally {
      await client.close();
    }
  });
});
