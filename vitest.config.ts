import { defaultExclude, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
import path from "path";

// Tests de regresión visual (Vitest 4 Browser Mode + toMatchScreenshot).
// Corren SOLO vía `npm run test:vrt` — baselines locales en __tests__/vrt/__screenshots__.
// OJO: baselines son sensibles al entorno (fonts/GPU); no compararlas contra CI.
const vrtPattern = "__tests__/vrt/**/*.vrt.test.{ts,tsx}";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
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
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: ["__tests__/**/*.test.{ts,tsx}"],
          exclude: [vrtPattern, ...defaultExclude],
        },
      },
      {
        extends: true,
        test: {
          name: "vrt",
          include: [vrtPattern],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium", viewport: { width: 900, height: 700 } }],
          },
        },
      },
    ],
  },
  // Force the development builds of react / react-dom to be used in tests.
  // Without this, esbuild pre-bundles react with process.env.NODE_ENV=production
  // which produces react.production.js — a build that doesn't export `act`,
  // causing @testing-library/react to throw "React.act is not a function".
  define: {
    "process.env.NODE_ENV": JSON.stringify("test"),
  },
  resolve: {
    /* UNA sola copia de React en el bundle del navegador. Sin esto, cualquier
       componente con Radix (todo `AdminModal`) muere en el proyecto `vrt` con
       «Cannot read properties of null (reading 'useRef')»: Radix resuelve a la
       copia que trae vitest-browser-react y se queda sin dispatcher. */
    dedupe: ["react", "react-dom"],
    conditions: ["development", "browser"],
    alias: {
      "@": path.resolve(__dirname),
      "server-only": path.resolve(__dirname, "__mocks__/server-only.ts"),
    },
  },
});
