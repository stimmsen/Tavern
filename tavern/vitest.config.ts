import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["packages/*/tests/unit/**/*.test.ts"],
          environment: "node"
        }
      },
      {
        test: {
          name: "integration",
          include: ["packages/*/tests/integration/**/*.test.ts"],
          environment: "node",
          testTimeout: 15_000,
          hookTimeout: 10_000
        }
      }
    ]
  }
});
