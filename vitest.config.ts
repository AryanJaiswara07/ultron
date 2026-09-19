import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Filesystem-heavy suites (sandbox, migrate, devices) use real tmp dirs;
    // keep them isolated from the parallel workers' shared state.
    pool: "forks",
    testTimeout: 15000,
  },
});
