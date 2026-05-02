import { test, expect } from "@playwright/test";

/**
 * onboarding-wizard.spec.ts — flujo completo del modal de onboarding admin.
 *
 * Reglas (recogidas del rediseño de 2026-05-02):
 *   - Modal aparece en /admin si no existe `onboarding-completed-${slug}` en localStorage.
 *   - Tiene aria-modal y role="dialog".
 *   - Escape lo cierra y persiste el flag.
 *   - El botón "Saltar" lo cierra y persiste el flag.
 *   - Click fuera del panel (en backdrop) lo cierra.
 *   - Width visible <= 500px (compacto).
 */

const QA_USER = "qaadmin";
const QA_PASS = "Qa-admin-1234";

test.describe.configure({ mode: "serial" });

test.describe("Onboarding Wizard — modal admin", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addCookies([
      { name: "active-tenant", value: "main", url: "http://localhost:3000" },
    ]);

    // Auth via page.request — usa el cookie jar del contexto del page
    const res = await page.request.post("/api/auth/login", {
      headers: { "content-type": "application/json", "x-tenant-id": "main" },
      data: { username: QA_USER, password: QA_PASS },
    });
    if (!res.ok()) throw new Error(`auth failed: ${res.status()}`);

    // Inicializar origin
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      localStorage.removeItem("onboarding-completed-main");
      localStorage.removeItem("superadmin-impersonate-tenant");
      localStorage.setItem("active-tenant-slug", "main");
    });
  });

  test("aparece el modal con role=dialog y aria-labelledby", async ({ page }) => {
    await page.reload();

    const dialog = page.getByRole("dialog", { name: /Configura tu bodega|Tu bodega está lista/i });
    await expect(dialog).toBeVisible({ timeout: 8_000 });

    // aria-modal
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    // aria-labelledby debe apuntar a un id existente
    const labelledBy = await dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    const title = page.locator(`#${labelledBy}`);
    await expect(title).toBeVisible();
  });

  test("modal tiene ancho compacto (<=500px) y no se desborda", async ({ page }) => {
    await page.reload();
    const dialog = page.getByRole("dialog", { name: /Configura tu bodega|Tu bodega está lista/i });
    await expect(dialog).toBeVisible({ timeout: 8_000 });

    const panel = dialog.locator("> div").first();
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(500);
    expect(box!.width).toBeGreaterThanOrEqual(360);
  });

  test("Escape cierra el modal y persiste el flag", async ({ page }) => {
    await page.reload();
    const dialog = page.getByRole("dialog", { name: /Configura tu bodega|Tu bodega está lista/i });
    await expect(dialog).toBeVisible({ timeout: 8_000 });

    await page.keyboard.press("Escape");

    await expect(dialog).not.toBeVisible({ timeout: 3_000 });

    const flag = await page.evaluate(() => localStorage.getItem("onboarding-completed-main"));
    expect(flag).toBe("1");
  });

  test('botón "Saltar" cierra y persiste', async ({ page }) => {
    await page.reload();
    const dialog = page.getByRole("dialog", { name: /Configura tu bodega|Tu bodega está lista/i });
    await expect(dialog).toBeVisible({ timeout: 8_000 });

    // El "Saltar" solo aparece si NO está allDone — si en este tenant todo está completo,
    // se vé "¡Empezar a vender!" en lugar de "Saltar"+"Continuar". En ambos casos el botón
    // primario cierra el modal.
    const skip = page.getByRole("button", { name: /^saltar$/i });
    const finish = page.getByRole("button", { name: /Empezar a vender/i });

    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
    } else {
      await finish.click();
    }

    await expect(dialog).not.toBeVisible({ timeout: 3_000 });
    const flag = await page.evaluate(() => localStorage.getItem("onboarding-completed-main"));
    expect(flag).toBe("1");
  });

  test("body scroll bloqueado mientras el modal está abierto", async ({ page }) => {
    await page.reload();
    const dialog = page.getByRole("dialog", { name: /Configura tu bodega|Tu bodega está lista/i });
    await expect(dialog).toBeVisible({ timeout: 8_000 });

    const overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow).toBe("hidden");

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 3_000 });

    const overflowAfter = await page.evaluate(() => document.body.style.overflow);
    expect(overflowAfter).not.toBe("hidden");
  });

  test("no aparece si ya fue cerrado previamente", async ({ page }) => {
    // Setear flag ANTES de navegar
    await page.evaluate(() => {
      localStorage.setItem("onboarding-completed-main", "1");
    });
    await page.reload();

    // Esperar el delay de 1.2s + margen
    await page.waitForTimeout(1500);

    const dialog = page.getByRole("dialog", { name: /Configura tu bodega|Tu bodega está lista/i });
    await expect(dialog).not.toBeVisible();
  });
});
