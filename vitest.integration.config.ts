import { defineConfig } from "vitest/config";
import path from "path";

// DB-backed suite. Requires a reachable DATABASE_URL with all migrations
// applied; it writes and deletes its own rows in afterAll hooks. Kept out of
// the default run so `bun run test` stays fast, offline, and non-destructive.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/db/**/*.test.ts"],
    // Neon cold starts and first-query TLS can exceed the Vitest 5s default.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Shared database fixtures must not race each other.
    fileParallelism: false,
  },
});
