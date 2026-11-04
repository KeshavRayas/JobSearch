import { defineConfig } from "vitest/config";
import path from "path";

// Unit suite: pure functions and mocked providers only. Anything that touches
// Postgres lives in src/__tests__/db and runs via vitest.integration.config.ts
// against a real DATABASE_URL (remote Neon is slow; 5s defaults flaked).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    exclude: ["src/__tests__/db/**", "node_modules/**"],
    testTimeout: 10_000,
  },
});
