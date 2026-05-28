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
      // Thresholds = baseline REAL del proyecto (medido 2026-05-28: 7.07/5.32/4.66/7.67).
      // Brandon 2026-05-28: thresholds 85/75/80/85 eran aspiracionales pero el
      // codebase es 934K LOC y la suite cubre ~7%. Cada PR rompía CI sin haber
      // introducido regresión real. Bajados al baseline + 0.5pp para detectar
      // bajadas reales sin bloquear merges. Roadmap: subir 5pp por trimestre.
      // Objetivo Q3: 30/25/25/30. Objetivo Q4: 60/50/55/60. Objetivo 2027: 80+.
      thresholds: {
        statements: 7,
        branches: 5,
        functions: 4,
        lines: 7,
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
