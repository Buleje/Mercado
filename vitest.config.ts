import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["__tests__/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov", "html"],
      include: ["lib/**/*.ts", "app/**/*.ts", "app/**/*.tsx", "components/**/*.tsx", "hooks/**/*.ts"],
      exclude: [
        "lib/generated/**",
        "**/*.test.{ts,tsx}",
        "**/__tests__/**",
        "app/**/layout.tsx",
        "app/**/not-found.tsx",
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 75,
        lines: 80,
      },
    },
  },
  // Force the development builds of react / react-dom to be used in tests.
  // Without this, esbuild pre-bundles react with process.env.NODE_ENV=production
  // which produces react.production.js — a build that doesn't export `act`,
  // causing @testing-library/react to throw "React.act is not a function".
  define: {
    "process.env.NODE_ENV": JSON.stringify("test"),
  },
  resolve: {
    conditions: ["development", "browser"],
    alias: {
      "@": path.resolve(__dirname),
      "server-only": path.resolve(__dirname, "__mocks__/server-only.ts"),
    },
  },
});
