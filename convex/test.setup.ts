/// <reference types="vite/client" />
// Module map for convex-test. Convex skips files with more than one dot, so this never deploys.
export const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.d.ts", "!./**/*.test.ts", "!./**/*.setup.ts"]);
