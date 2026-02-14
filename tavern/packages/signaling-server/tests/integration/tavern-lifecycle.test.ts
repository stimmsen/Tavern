import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startServer, connectClient, type TestServer, type TestClient } from "./helpers.js";

describe("tavern lifecycle", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer({ store: "memory" });
  });

  afterAll(async () => {
    await server.stop();
  });

  it("should create a tavern and return tavern-created", async () => {
    const client = await connectClient(server.url);
    try {
      client.send({ type: "create-tavern", name: "Test Tavern" });
      const msg: any = await client.waitForMessage("tavern-created");

      expect(msg.type).toBe("tavern-created");
      expect(msg.tavern).toBeDefined();
      expect(msg.tavern.name).toBe("Test Tavern");
      expect(msg.tavern.id).toBeTruthy();
      // Taverns auto-create a "General" channel
      expect(msg.tavern.channels).toHaveLength(1);
      expect(msg.tavern.channels[0].name).toBe("General");
    } finally {
      await client.close();
    }
  });

  it("should create a tavern with icon", async () => {
    const client = await connectClient(server.url);
    try {
      client.send({ type: "create-tavern", name: "Icon Tavern", icon: "🍺" });
      const msg: any = await client.waitForMessage("tavern-created");

      expect(msg.tavern.name).toBe("Icon Tavern");
      expect(msg.tavern.icon).toBe("🍺");
    } finally {
      await client.close();
    }
  });

  it("should get tavern info for an existing tavern", async () => {
    const client = await connectClient(server.url);
    try {
      client.send({ type: "create-tavern", name: "Info Tavern" });
      const created: any = await client.waitForMessage("tavern-created");
      const tavernId = created.tavern.id;

      client.send({ type: "get-tavern-info", tavernId });
      const info: any = await client.waitForMessage("tavern-info");

      expect(info.type).toBe("tavern-info");
      expect(info.tavern.name).toBe("Info Tavern");
      expect(info.tavern.id).toBe(tavernId);
    } finally {
      await client.close();
    }
  });

  it("should return error for non-existent tavern", async () => {
    const client = await connectClient(server.url);
    try {
      client.send({ type: "get-tavern-info", tavernId: "nonexistent-id" });
      const msg: any = await client.waitForMessage("error");

      expect(msg.type).toBe("error");
      expect(msg.message).toMatch(/not found/i);
    } finally {
      await client.close();
    }
  });
});
