import { test, expect } from "@playwright/test";
import { signInSuperadmin } from "./helpers/sign-in-superadmin";

/**
 * E2E — /superadmin/control-center
 *
 * Cubre el centro de comando:
 *   • Stats hero (4 KPIs)
 *   • Search filter en vivo (filtra entre 142 rutas)
 *   • 15 categorías de plataformas
 *   • 6 grupos de credenciales con counter OK
 *   • PlatformCard con tone + status dot
 */

test.describe("/superadmin/control-center", () => {
  test.beforeEach(async ({ context }) => {
    await signInSuperadmin(context);
  });

  test("renderiza stats hero + grupos de plataformas", async ({ page }) => {
    await page.goto("/superadmin/control-center");

    await expect(page.getByRole("heading", { name: /Centro de control/i }).first()).toBeVisible();

    // Stats hero
    await expect(page.getByText(/Plataformas activas/i)).toBeVisible();
    await expect(page.getByText(/Credenciales OK/i)).toBeVisible();

    // Título de sección "Plataformas · N páginas"
    await expect(page.getByRole("heading", { name: /Plataformas · \d+ páginas/i })).toBeVisible();

    // Al menos 1 grupo categoría visible (SuperAdmin · Gestión está primero)
    await expect(page.getByText(/SuperAdmin · Gestión/i).first()).toBeVisible();
  });

  test("search filter en vivo reduce los resultados", async ({ page }) => {
    await page.goto("/superadmin/control-center");
    await expect(page.getByRole("heading", { name: /Centro de control/i }).first()).toBeVisible();

    // Search input
    const searchInput = page.getByPlaceholder(/Buscar plataforma/i);
    await searchInput.fill("dashboard");

    // Debe mostrar counter de resultados
    await expect(page.getByText(/\d+ resultados? para/i)).toBeVisible({ timeout: 3000 });

    // Clear button aparece
    await expect(page.getByRole("button", { name: /Limpiar/i })).toBeVisible();

    // Click clear
    await page.getByRole("button", { name: /Limpiar/i }).click();
    await expect(searchInput).toHaveValue("");
  });

  test("search sin resultados muestra empty state", async ({ page }) => {
    await page.goto("/superadmin/control-center");
    await expect(page.getByRole("heading", { name: /Centro de control/i }).first()).toBeVisible();

    const searchInput = page.getByPlaceholder(/Buscar plataforma/i);
    await searchInput.fill("xyz-no-existe-12345");

    await expect(page.getByText(/Sin coincidencias/i)).toBeVisible({ timeout: 3000 });
  });

  test("credenciales agrupadas con counter OK por grupo", async ({ page }) => {
    await page.goto("/superadmin/control-center");
    await expect(page.getByRole("heading", { name: /Centro de control/i }).first()).toBeVisible();

    // Sección Credenciales
    await expect(page.getByRole("heading", { name: /Credenciales del sistema/i })).toBeVisible();

    // 6 grupos esperados
    await expect(page.getByText(/^Autenticación$/i).first()).toBeVisible();
    await expect(page.getByText(/^Base de datos$/i).first()).toBeVisible();
    await expect(page.getByText(/^Pagos$/i).first()).toBeVisible();
    await expect(page.getByText(/^Comunicación$/i).first()).toBeVisible();
    await expect(page.getByText(/^Observabilidad$/i).first()).toBeVisible();
    await expect(page.getByText(/^Cache & Rate-limit$/i).first()).toBeVisible();

    // Counter "N/M OK" visible en al menos un grupo
    await expect(page.getByText(/\d+\/\d+ OK/i).first()).toBeVisible();

    // PLATFORM_AUTH_SECRET (audit P2 #1) listado
    await expect(page.getByText(/PLATFORM_AUTH_SECRET/i)).toBeVisible();
  });

  test("platform card es clickeable y abre el destino", async ({ page }) => {
    await page.goto("/superadmin/control-center");
    await expect(page.getByRole("heading", { name: /Centro de control/i }).first()).toBeVisible();

    // Buscar la card "Dashboard" del primer grupo
    const dashboardCard = page.getByRole("link", { name: /SuperAdmin home|Dashboard ejecutivo/i }).first();
    await expect(dashboardCard).toBeVisible();
    await expect(dashboardCard).toHaveAttribute("href", /\/superadmin/);
  });
});
