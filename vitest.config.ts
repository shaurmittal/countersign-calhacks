import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["shared/**/*.test.ts", "scenarios/**/*.test.ts", "convex/**/*.test.ts"],
    // convex/*.test.ts files opt into edge-runtime with a file comment; convex-test must be inlined.
    server: { deps: { inline: ["convex-test"] } },
  },
});
