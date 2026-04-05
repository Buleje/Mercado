import { test, expect, APIRequestContext } from "@playwright/test";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: login via API and return the session cookie string.
// ─────────────────────────────────────────────────────────────────────────────
async function adminLogin(request: APIRequestContext): Promise<string | null> {
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) return null;

  const res = await request.post("/api/auth/login", {
    data: { password },
  });
  if (!res.ok()) return null;

  const setCookie = res.headers()["set-cookie"] ?? "";
  const match = setCookie.match(/bsm-admin-sess=[^;]+/);
  return match ? match[0] : null;
}

test.describe("Asistente IA Module", () => {
  test.beforeEach(async ({ page, request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set");

    await page.context().addCookies([{
      name: "bsm-admin-sess",
      value: cookie!.split("=")[1],
      domain: "localhost",
      path: "/",
    }]);
  });

  test("navigates to Asistente IA module", async ({ page }) => {
    await page.goto("/admin");

    // Click on Asistente IA in sidebar
    const sidebarItem = page.getByRole("button", { name: /asistente ia/i });
    await sidebarItem.click();

    // Should show the module with tab bar
    await expect(page.getByText("Mi negocio hoy")).toBeVisible({ timeout: 10000 });
  });

  test("all 6 tabs are visible", async ({ page }) => {
    await page.goto("/admin");

    const sidebarItem = page.getByRole("button", { name: /asistente ia/i });
    await sidebarItem.click();

    // Verify all 6 tabs exist
    const expectedTabs = [
      "Mi negocio hoy",
      "Centro de Comando",
      "Sugerencias",
      "Metas y Logros",
      "Chat",
      "Alertas",
    ];

    for (const tabName of expectedTabs) {
      await expect(page.getByRole("button", { name: tabName })).toBeVisible({ timeout: 10000 });
    }
  });

  test("switches between tabs", async ({ page }) => {
    await page.goto("/admin");

    const sidebarItem = page.getByRole("button", { name: /asistente ia/i });
    await sidebarItem.click();

    // Wait for initial tab to load
    await expect(page.getByText("Mi negocio hoy")).toBeVisible({ timeout: 10000 });

    // Click Centro de Comando tab
    await page.getByRole("button", { name: "Centro de Comando" }).click();

    // Click Sugerencias tab
    await page.getByRole("button", { name: "Sugerencias" }).click();

    // Click Metas y Logros tab
    await page.getByRole("button", { name: "Metas y Logros" }).click();

    // Click Chat tab
    await page.getByRole("button", { name: "Chat" }).click();

    // Click Alertas tab
    await page.getByRole("button", { name: "Alertas" }).click();
  });
});
