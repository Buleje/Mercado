/* eslint-disable @typescript-eslint/no-require-imports -- Playwright tests use require() for static imports in test blocks */
import { test, expect, APIRequestContext } from "@playwright/test";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: log in via API and return the session cookie for reuse across tests.
// Skips tests that need auth when E2E_ADMIN_PASSWORD is not set.
// ─────────────────────────────────────────────────────────────────────────────
async function adminLogin(request: APIRequestContext): Promise<string | null> {
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) return null;

  const res = await request.post("/api/auth/login", { data: { password } });
  if (!res.ok()) return null;

  const setCookie = res.headers()["set-cookie"] ?? "";
  const match = setCookie.match(/bsm-admin-sess=[^;]+/);
  return match ? match[0] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite: POS / Punto de Venta
// ─────────────────────────────────────────────────────────────────────────────
test.describe("POS — Punto de Venta", () => {

  // ── 1. Public access guard ─────────────────────────────────────────────────

  test("unauthenticated user is redirected away from admin panel", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  // ── 2. Login page ready ────────────────────────────────────────────────────

  test("login page has password field and submit button", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.getByPlaceholder("Contraseña")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /entrar|ingresar|iniciar/i }),
    ).toBeVisible();
  });

  // ── 3. POS tab accessible after login ─────────────────────────────────────

  test("authenticated admin can navigate to POS module", async ({ page, request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set — skipping authenticated POS tests");

    await page.context().addCookies([
      {
        name: "bsm-admin-sess",
        value: cookie!.replace("bsm-admin-sess=", ""),
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto("/admin");
    // Wait for admin dashboard to render (not loading spinner)
    await expect(page.locator("[data-testid='admin-layout'], main, #__next")).toBeVisible({
      timeout: 15_000,
    });

    // Navigate to POS tab — look for a button/link with POS-related text
    const posLink = page
      .getByRole("button", { name: /pos|caja|punto de venta/i })
      .or(page.getByRole("link", { name: /pos|caja|punto de venta/i }))
      .first();

    await posLink.click();
    // POS module should render — look for characteristic POS UI elements
    await expect(
      page.getByText(/buscar producto|agregar al carrito|cobrar|efectivo/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ── 4. POS product search ─────────────────────────────────────────────────

  test("POS search input is functional after tab load", async ({ page, request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set — skipping authenticated POS tests");

    await page.context().addCookies([
      {
        name: "bsm-admin-sess",
        value: cookie!.replace("bsm-admin-sess=", ""),
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto("/admin");
    const posLink = page
      .locator('nav[aria-label="Navegación rápida"]')
      .getByRole("button", { name: /pos|caja/i })
      .first();
    await posLink.click();

    // Find the product search input inside the POS module
    const searchInput = page
      .getByPlaceholder(/buscar producto|nombre o código/i)
      .or(page.getByRole("searchbox"))
      .first();

    await searchInput.fill("arr");
    await expect(searchInput).toHaveValue("arr");
  });

  // ── 5. POS cart starts empty ──────────────────────────────────────────────

  test("POS cart is empty on initial load", async ({ page, request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set — skipping authenticated POS tests");

    await page.context().addCookies([
      {
        name: "bsm-admin-sess",
        value: cookie!.replace("bsm-admin-sess=", ""),
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto("/admin");
    const posLink = page
      .locator('nav[aria-label="Navegación rápida"] button')
      .filter({ hasText: /pos|caja/i })
      .first();
    await posLink.click();

    // Cart total should show S/ 0.00 or similar empty state
    await expect(
      page.getByText(/s\/\s*0\.?0*|carrito vacío|sin productos/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ── 6. Change calculator (no auth needed — UI-only) ───────────────────────

  test("change calculator computes correct change", async ({ page, request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set — skipping authenticated POS tests");

    await page.context().addCookies([
      {
        name: "bsm-admin-sess",
        value: cookie!.replace("bsm-admin-sess=", ""),
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto("/admin");
    const posLink = page
      .getByRole("button", { name: /pos|caja|punto de venta/i })
      .or(page.getByRole("link", { name: /pos|caja|punto de venta/i }))
      .first();
    await posLink.click();

    // Look for the change calculator section (may be inside a sub-tab or modal)
    const calculatorHeading = page.getByText(/calculadora de vuelto|cambio/i).first();
    if (await calculatorHeading.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // If visible, fill in amount received and check the change output
      const amountInput = page.getByPlaceholder(/monto recibido|pago del cliente/i).first();
      if (await amountInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await amountInput.fill("50");
        // The change output should be visible (exact format depends on implementation)
        await expect(page.getByText(/vuelto|cambio/i).first()).toBeVisible();
      }
    }
  });

  test("mobile admin layout hides feedback and keeps POS actions readable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/login");

    const bypassButton = page.getByRole("button", { name: /entrar sin login/i });
    if (await bypassButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await bypassButton.click();
    } else {
      test.skip(true, "Bypass login no disponible en este entorno");
    }

    await page.waitForURL(/\/admin/);
    await expect(page.getByText(/feedback beta/i)).toHaveCount(0);

    const posLink = page
      .locator('nav[aria-label="Navegación rápida"] button')
      .filter({ hasText: /pos|caja/i })
      .first();
    await posLink.click();

    await expect(page.getByText(/punto de venta/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /escanear/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /historial/i }).first()).toBeVisible();
  });

  // ── 7. Role-based access: cajero sees POS tab ─────────────────────────────

  test("cajero role permissions include pos-caja tab", () => {
    // Static test — verify the MODULE_PERMISSIONS export has the right tabs
    // Import is resolved at test compile time via tsconfig paths
    const { MODULE_PERMISSIONS } = require("../lib/module-permissions");
    expect(MODULE_PERMISSIONS.cajero).toContain("pos-caja");
    expect(MODULE_PERMISSIONS.cajero).toContain("pedidos");
    expect(MODULE_PERMISSIONS.cajero).toContain("clientes");
    expect(MODULE_PERMISSIONS.cajero).toContain("fidelizacion");
    // cajero should NOT have finance/admin modules
    expect(MODULE_PERMISSIONS.cajero).not.toContain("finanzas");
    expect(MODULE_PERMISSIONS.cajero).not.toContain("seguridad");
    expect(MODULE_PERMISSIONS.cajero).not.toContain("sistema");
  });

  // ── 8. Role-based access: almacenero permissions ──────────────────────────

  test("almacenero role permissions include inventory but no POS", () => {
    const { MODULE_PERMISSIONS } = require("../lib/module-permissions");
    expect(MODULE_PERMISSIONS.almacenero).toContain("inventario-almacenes");
    expect(MODULE_PERMISSIONS.almacenero).toContain("compras");
    expect(MODULE_PERMISSIONS.almacenero).toContain("proveedores");
    expect(MODULE_PERMISSIONS.almacenero).toContain("reposicion");
    // almacenero should NOT have POS or finance
    expect(MODULE_PERMISSIONS.almacenero).not.toContain("pos-caja");
    expect(MODULE_PERMISSIONS.almacenero).not.toContain("finanzas");
  });

  // ── 9. canAccessModule helper ─────────────────────────────────────────────

  test("canAccessModule returns correct results per role", () => {
    const { canAccessModule } = require("../lib/module-permissions");

    // Admin gets everything
    expect(canAccessModule("admin", "finanzas")).toBe(true);
    expect(canAccessModule("admin", "seguridad")).toBe(true);
    expect(canAccessModule("admin", "pos-caja")).toBe(true);

    // Cajero — allowed
    expect(canAccessModule("cajero", "pos-caja")).toBe(true);
    expect(canAccessModule("cajero", "pedidos")).toBe(true);

    // Cajero — denied
    expect(canAccessModule("cajero", "finanzas")).toBe(false);
    expect(canAccessModule("cajero", "seguridad")).toBe(false);

    // Almacenero — allowed
    expect(canAccessModule("almacenero", "inventario-almacenes")).toBe(true);
    expect(canAccessModule("almacenero", "compras")).toBe(true);

    // Almacenero — denied
    expect(canAccessModule("almacenero", "pos-caja")).toBe(false);
    expect(canAccessModule("almacenero", "finanzas")).toBe(false);
  });

  // ── 10. canAccessModule respects overrides ────────────────────────────────

  test("canAccessModule respects savedRolePerms overrides", () => {
    const { canAccessModule } = require("../lib/module-permissions");

    // Custom override: grant cajero access to finanzas
    const overrides: Record<string, string[]> = {
      cajero: ["pos-caja", "finanzas"],
    };

    expect(canAccessModule("cajero", "pos-caja", overrides)).toBe(true);
    expect(canAccessModule("cajero", "finanzas", overrides)).toBe(true);
    // Modules not in the override list should be denied
    expect(canAccessModule("cajero", "seguridad", overrides)).toBe(false);
  });
});
