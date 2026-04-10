import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["evals/**/*.eval.ts"],
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("test"),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".."),
      "server-only": path.resolve(__dirname, "../__mocks__/server-only.ts"),
    },
  },
});
