import { defineConfig, devices } from "@playwright/test";

// E2E_BASE_URL permite apuntar a un server dedicado (ej. build prod en :3100
// con ALLOW_E2E_TEST_AUTH=1). Si está seteado, Playwright NO levanta su propio
// server — usa el externo (evita contención con el dev server del usuario).
const EXTERNAL_BASE = process.env.E2E_BASE_URL;
const BASE_URL = EXTERNAL_BASE ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Cuando E2E_BASE_URL apunta a un server externo ya levantado, no gestionamos
  // server propio. Si no, levantamos `npm run dev` en :3000 (modo local).
  webServer: EXTERNAL_BASE
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
