// Test helper: starts the signaling server in a child process and provides WebSocket client utilities.

import { fork, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import WebSocket from "ws";

const SERVER_ENTRY = join(import.meta.dirname, "..", "..", "dist", "index.js");
const SERVER_SRC_ENTRY = join(import.meta.dirname, "..", "..", "src", "index.ts");

export interface TestServer {
  port: number;
  url: string;
  tmpDir: string;
  stop: () => Promise<void>;
}

/**
 * Start the signaling server on a random available port.
 * Uses tsx to run TypeScript directly for integration tests.
 */
export async function startServer(options?: {
  store?: "memory" | "sqlite";
}): Promise<TestServer> {
  const storeType = options?.store ?? "memory";
  const tmpDir = mkdtempSync(join(tmpdir(), "tavern-integ-"));
  const dbPath = join(tmpDir, "test.db");

  // Find a free port by binding to 0
  const { createServer } = await import("node:net");
  const port = await new Promise<number>((resolve) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const p = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(p));
    });
  });

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    PORT: String(port),
    TAVERN_STORE: storeType,
    TAVERN_DB_PATH: dbPath
  };

  // Use tsx to run the TypeScript source directly
  const child: ChildProcess = fork(SERVER_SRC_ENTRY, [], {
    env,
    execArgv: ["--import", "tsx"],
    stdio: "pipe"
  });

  // Wait for server to be ready by polling /health
  const url = `http://127.0.0.1:${port}`;
  const wsUrl = `ws://127.0.0.1:${port}`;

  await waitForHealth(url, 5_000);

  return {
    port,
    url: wsUrl,
    tmpDir,
    stop: async () => {
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        child.on("exit", () => resolve());
        setTimeout(resolve, 3_000);
      });
      if (existsSync(tmpDir)) {
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore cleanup errors on windows */ }
      }
    }
  };
}

async function waitForHealth(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch {
      // server not ready yet
    }
    await sleep(100);
  }

  throw new Error(`Server did not become healthy within ${timeoutMs}ms`);
}

/**
 * Create a WebSocket client connected to the test server.
 * All incoming messages are always buffered so none are lost between waitForMessage calls.
 */
export function connectClient(serverUrl: string): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(serverUrl);
    const buffer: unknown[] = [];
    const waiters: Array<{ type?: string; resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }> = [];

    // Permanent message handler — buffers everything, resolves waiters as matches arrive.
    ws.on("message", (data: WebSocket.RawData) => {
      const parsed = JSON.parse(data.toString());

      // Check if any waiter wants this message
      for (let i = 0; i < waiters.length; i++) {
        const w = waiters[i];
        if (!w.type || (parsed as any).type === w.type) {
          waiters.splice(i, 1);
          clearTimeout(w.timer);
          w.resolve(parsed);
          return;
        }
      }

      // No waiter matched — buffer it
      buffer.push(parsed);
    });

    ws.on("open", () => {
      resolve({
        ws,
        messages: buffer,
        send(payload: unknown) {
          ws.send(JSON.stringify(payload));
        },
        waitForMessage(type?: string, timeoutMs = 3_000): Promise<unknown> {
          // Check buffer first
          const idx = type
            ? buffer.findIndex((m: any) => m.type === type)
            : buffer.length > 0 ? 0 : -1;

          if (idx >= 0) {
            return Promise.resolve(buffer.splice(idx, 1)[0]);
          }

          // Register a waiter
          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              const i = waiters.findIndex(w => w.resolve === res);
              if (i >= 0) waiters.splice(i, 1);
              rej(new Error(`Timeout waiting for message${type ? ` of type "${type}"` : ""}`));
            }, timeoutMs);

            waiters.push({ type, resolve: res, reject: rej, timer });
          });
        },
        close(): Promise<void> {
          return new Promise((resolve) => {
            if (ws.readyState === WebSocket.CLOSED) {
              resolve();
              return;
            }
            ws.on("close", () => resolve());
            ws.close();
          });
        }
      });
    });

    ws.on("error", reject);
  });
}

export interface TestClient {
  ws: WebSocket;
  messages: unknown[];
  send(payload: unknown): void;
  waitForMessage(type?: string, timeoutMs?: number): Promise<unknown>;
  close(): Promise<void>;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
