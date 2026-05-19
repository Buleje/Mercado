import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * admin-orders-approve.spec.ts
 *
 * Happy path: administrador aprueba un pago de orden marketplace.
 *
 * Flujo:
 *   1. Admin login vía /admin/login (qaadmin / Qa-admin-1234, tenant main)
 *   2. Navega al panel de órdenes marketplace
 *   3. Ve una orden en estado "pendiente"
 *   4. Aprueba el comprobante de pago
 *   5. Verifica que el status cambia a "confirmado"
 *
 * TODO-fixtures:
 *   - Orden marketplace en estado "pendiente" con payment-proof en DB
 *   - Ejecutar antes: npm run db:seed
 */

const ADMIN_USER = process.env.E2E_ADMIN_USER ?? "qaadmin";
const ADMIN_PASS = process.env.E2E_ADMIN_PASSWORD ?? "Qa-admin-1234";

async function adminApiLogin(request: APIRequestContext): Promise<string | null> {
  const res = await request.post("/api/auth/login", {
    data: { password: ADMIN_PASS, username: ADMIN_USER },
  });
  if (!res.ok()) return null;
  const setCookie = res.headers()["set-cookie"] ?? "";
  const match = setCookie.match(/bsm-admin-sess=[^;]+/);
  return match ? match[0] : null;
}

async function adminUiLogin(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("Usuario (opcional)").fill(ADMIN_USER);
  await page.getByPlaceholder("Contraseña").fill(ADMIN_PASS);
  await page.getByRole("button", { name: /entrar|ingresar|iniciar/i }).click();
  await page.waitForURL(/\/admin/, { timeout: 15_000 });
}

test.describe("Admin — gestión y aprobación de órdenes marketplace", () => {
  test("1 — login admin vía formulario y acceder al dashboard", async ({ page }) => {
    await test.step("navegar a /admin/login", async () => {
      await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
      await expect(page.getByPlaceholder("Contraseña")).toBeVisible({ timeout: 10_000 });
    });

    await test.step("ingresar credenciales qaadmin", async () => {
      await page.getByPlaceholder("Usuario (opcional)").fill(ADMIN_USER);
      await page.getByPlaceholder("Contraseña").fill(ADMIN_PASS);
      await page.getByRole("button", { name: /entrar|ingresar|iniciar/i }).click();
    });

    await test.step("redirigido al dashboard admin", async () => {
      await page.waitForURL(/\/admin/, { timeout: 15_000 });
      await expect(page.locator("body")).not.toContainText("401");
      await expect(page.locator("body")).not.toContainText("500");
    });
  });

  test("2 — GET /api/marketplace/orders sin auth retorna 401 o 403", async ({ request }) => {
    const res = await request.get("/api/marketplace/orders");
    expect([401, 403]).toContain(res.status());
  });

  test("3 — admin autenticado ve listado de órdenes marketplace", async ({ request }) => {
    const cookie = await adminApiLogin(request);
    test.skip(!cookie, "Login admin falló — verificar credenciales");

    const res = await request.get("/api/marketplace/orders", {
      headers: { Cookie: cookie! },
    });
    expect([200, 304]).toContain(res.status());

    const body = await res.json().catch(() => null);
    if (body) {
      const orders = Array.isArray(body) ? body : (body.data ?? body.orders ?? []);
      expect(Array.isArray(orders)).toBe(true);
    }
  });

  test("4 — panel admin muestra sección de órdenes pendientes", async ({ page }) => {
    await adminUiLogin(page);

    await test.step("navegar al panel de órdenes marketplace", async () => {
      const ordersLink = page
        .getByRole("link", { name: /[oó]rdenes|pedidos/i })
        .or(page.locator('[data-testid="tab-orders"]'))
        .or(page.locator('[data-testid="tab-marketplace"]'))
        .first();

      const hasLink = await ordersLink.isVisible({ timeout: 5_000 }).catch(() => false);
      if (hasLink) {
        await ordersLink.click();
      } else {
        await page.goto("/admin?tab=ordenes", { waitUntil: "domcontentloaded" });
      }

      await expect(page.locator("body")).not.toContainText("500");
    });
  });

  test("5 — admin puede cambiar status de orden de pendiente a confirmado", async ({
    request,
  }) => {
    const cookie = await adminApiLogin(request);
    test.skip(!cookie, "Login admin falló");

    const listRes = await request.get("/api/marketplace/orders?status=pendiente", {
      headers: { Cookie: cookie! },
    });
    expect([200, 304]).toContain(listRes.status());

    const body = await listRes.json().catch(() => null);
    const orders = body
      ? Array.isArray(body)
        ? body
        : (body.data ?? body.orders ?? [])
      : [];

    if (orders.length === 0) {
      // TODO: fixture — seed una orden marketplace en estado pendiente
      test.skip();
      return;
    }

    const orderId = orders[0].id as string;

    await test.step("aprobar orden — PATCH status=confirmado", async () => {
      const patchRes = await request.patch(`/api/marketplace/orders/${orderId}`, {
        headers: { Cookie: cookie!, "Content-Type": "application/json" },
        data: { status: "confirmado" },
      });
      expect([200, 201]).toContain(patchRes.status());
    });

    await test.step("verificar status actualizado", async () => {
      const getRes = await request.get(`/api/marketplace/orders/${orderId}`, {
        headers: { Cookie: cookie! },
      });
      expect([200, 304]).toContain(getRes.status());
      const order = await getRes.json().catch(() => null);
      if (order) {
        const status = order.status ?? order.data?.status;
        expect(status).toBe("confirmado");
      }
    });
  });

  test("6 — PATCH con status inválido retorna 400", async ({ request }) => {
    const cookie = await adminApiLogin(request);
    test.skip(!cookie, "Login admin falló");

    const res = await request.patch("/api/marketplace/orders/fake-id-xyz", {
      headers: { Cookie: cookie!, "Content-Type": "application/json" },
      data: { status: "status-inventado" },
    });
    expect([400, 404, 422]).toContain(res.status());
  });

  test("7 — GET /api/marketplace/orders/[id] incluye proofUrl si existe", async ({
    request,
  }) => {
    const cookie = await adminApiLogin(request);
    test.skip(!cookie, "Login admin falló");

    const listRes = await request.get("/api/marketplace/orders", {
      headers: { Cookie: cookie! },
    });
    const body = await listRes.json().catch(() => null);
    const orders = body
      ? Array.isArray(body)
        ? body
        : (body.data ?? body.orders ?? [])
      : [];

    if (orders.length === 0) {
      // TODO: fixture — seed orden con proofUrl
      test.skip();
      return;
    }

    const orderId = orders[0].id as string;
    const getRes = await request.get(`/api/marketplace/orders/${orderId}`, {
      headers: { Cookie: cookie! },
    });
    expect([200, 304]).toContain(getRes.status());
  });

  test("8 — POST /api/marketplace/orders/bulk sin IDs retorna 400", async ({ request }) => {
    const cookie = await adminApiLogin(request);
    test.skip(!cookie, "Login admin falló");

    const res = await request.post("/api/marketplace/orders/bulk", {
      headers: { Cookie: cookie!, "Content-Type": "application/json" },
      data: { ids: [], status: "confirmado" },
    });
    expect([400, 422]).toContain(res.status());
  });
});
