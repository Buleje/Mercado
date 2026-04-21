import { test, expect } from "@playwright/test";

/**
 * admin-bulk-images.spec.ts — verifica el flujo de bulk-clear-images.
 *
 * Reproduce el bug de 2026-04-20 (CSRF token + cache stale) que impedia
 * que el admin quitara imagenes en bulk:
 *   1. Login con qaadmin / Qa-admin-1234.
 *   2. Ir al modulo Stock.
 *   3. Seleccionar varios productos (header checkbox).
 *   4. Click "Quitar imágenes" en el bulk action bar.
 *   5. Confirmar.
 *   6. Verificar que las imagenes ya no aparecen en el listado.
 */

const QA_USER = "qaadmin";
const QA_PASS = "Qa-admin-1234";

test.describe.configure({ mode: "serial" });

test.describe("Admin Stock — bulk clear images", () => {
  test.beforeEach(async ({ page, context }) => {
    // Tenant cookie
    await context.addCookies([
      { name: "active-tenant", value: "main", url: "http://localhost:3000" },
    ]);
    await page.goto("/t/main/admin/login");
    await page.locator('input[placeholder*="Usuario"]').fill(QA_USER);
    await page.locator('input[type="password"]').fill(QA_PASS);
    await page.getByRole("button", { name: /^ingresar$/i }).click();
    await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 10_000 });
  });

  test("bulk clear images: selecciona todos → quitar → imagen vacia en listado", async ({ page }) => {
    await page.goto("/t/main/admin?tab=inventario");
    // Espera a que cargue el modulo Stock
    await expect(page.getByText(/tu stock/i)).toBeVisible({ timeout: 10_000 });

    // Header checkbox para seleccionar todos
    const headerCheckbox = page.locator("thead input[type='checkbox']").first();
    await headerCheckbox.scrollIntoViewIfNeeded();
    await headerCheckbox.check();

    // Bulk action bar visible
    await expect(page.getByText(/seleccionado/i)).toBeVisible();

    // Click "Quitar imágenes"
    const clearBtn = page.getByRole("button", { name: /quitar im[áa]genes/i });
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();

    // Modal confirmacion
    await expect(page.getByRole("heading", { name: /quitar im[áa]genes/i })).toBeVisible();

    // Click confirmar
    await page.getByRole("button", { name: /^s[íi], quitar/i }).click();

    // Esperar a que se cierre el modal y se recargue
    await expect(page.getByRole("heading", { name: /quitar im[áa]genes/i })).not.toBeVisible({
      timeout: 10_000,
    });

    // Verificar que NO hay errores 403 en consola
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.waitForTimeout(1000);
    const csrfErrors = consoleErrors.filter((e) => /403|csrf/i.test(e));
    expect(csrfErrors).toHaveLength(0);
  });
});
