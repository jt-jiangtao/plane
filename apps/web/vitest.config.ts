import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  css: {
    // Avoid loading Plane's ESM postcss.config.js under Node CJS.
    postcss: { plugins: [] },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["core/components/flow-desk/**/*.test.tsx", "core/services/flow-desk/**/*.test.ts"],
    css: false,
  },
  resolve: {
    alias: {
      "@/": `${path.resolve(__dirname)}/`,
    },
  },
});
