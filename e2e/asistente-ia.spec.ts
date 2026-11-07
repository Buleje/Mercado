import { test, expect, APIRequestContext } from "@playwright/test";

// Hub «Asistente IA» (10-10): tres vistas — Chat IA, Comandos IA y
// Automatizaciones. «Sugerencias IA» se fundió en Comandos: su `?vista=` y su
// tab viejo (`?tab=sugerencias-ia`) tienen que caer en Comandos, y el `?sub=`
// de Comandos no puede quedar pegado al volver al Chat.

async function adminLogin(request: APIRequestContext): Promise<string | null> {
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) return null;
  const res = await request.post("/api/auth/login", { data: { password } });
  if (!res.ok()) return null;
  const match = (res.headers()["set-cookie"] ?? "").match(/bsm-admin-sess=[^;]+/);
  return match ? match[0] : null;
}

/** Las pestañas del hub (no las internas de Comandos). */
const VISTAS = ["Chat IA", "Comandos IA", "Automatizaciones"];

test.describe("Asistente IA", () => {
  test.beforeEach(async ({ page, request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set");
    await page.context().addCookies([
      { name: "bsm-admin-sess", value: cookie!.split("=")[1], domain: "localhost", path: "/" },
    ]);
  });

  test("el hub tiene sus tres vistas y ya no Sugerencias IA", async ({ page }) => {
    await page.goto("/admin?tab=asistente-ia");
    for (const nombre of VISTAS) {
      await expect(page.getByRole("tab", { name: nombre })).toBeVisible({ timeout: 15000 });
    }
    await expect(page.getByRole("tab", { name: "Sugerencias IA" })).toHaveCount(0);
  });

  test("?vista=sugerencias y ?tab=sugerencias-ia abren Comandos IA", async ({ page }) => {
    for (const ruta of ["/admin?tab=asistente-ia&vista=sugerencias", "/admin?tab=sugerencias-ia"]) {
      await page.goto(ruta);
      await expect(page.getByRole("tab", { name: "Comandos IA" })).toHaveAttribute("aria-selected", "true", {
        timeout: 15000,
      });
    }
  });

  test("el ?sub= de Comandos no queda pegado en el Chat", async ({ page }) => {
    await page.goto("/admin?tab=asistente-ia&vista=comandos&sub=historial");
    await expect(page.getByRole("tab", { name: "Lo que hizo la IA" })).toHaveAttribute("aria-selected", "true", {
      timeout: 15000,
    });
    await page.getByRole("tab", { name: "Chat IA" }).click();
    await expect(page).toHaveURL(/vista=chat/);
    expect(new URL(page.url()).searchParams.get("sub")).toBeNull();
  });

  test("un link del Chat con ?sub= pegado lo suelta y Comandos abre su vista", async ({ page }) => {
    await page.goto("/admin?tab=asistente-ia&vista=chat&sub=historial");
    await expect(page.getByRole("tab", { name: "Chat IA" })).toHaveAttribute("aria-selected", "true", {
      timeout: 15000,
    });
    await expect.poll(() => new URL(page.url()).searchParams.get("sub")).toBeNull();
    await page.getByRole("tab", { name: "Comandos IA" }).click();
    await expect(page.getByRole("tab", { name: "Lee un papel" })).toHaveAttribute("aria-selected", "true", {
      timeout: 15000,
    });
  });
});
