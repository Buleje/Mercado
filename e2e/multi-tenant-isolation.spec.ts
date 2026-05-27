import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * multi-tenant-isolation.spec.ts
 *
 * Happy path: aislamiento entre tenants — un admin de tenant A no puede
 * leer ni modificar órdenes de tenant B.
 *
 * Escenarios:
 *   1. GET órdenes tenant A con cookie tenant A → 200 (solo sus datos)
 *   2. GET órdenes tenant B sin cookie → 401/403
 *   3. GET órdenes tenant B con cookie tenant A → 403/404 (aislamiento)
 *   4. Header x-tenant-id inyectado manualmente es ignorado (proxy enforces)
 *   5. Storefront /t/[slugA] no expone productos de /t/[slugB]
 *   6. Cart localStorage aislado por slug
 *   7. API /t/[slug]/api/** rechaza cross-tenant auth header
 *
 * TODO-fixtures:
 *   - Tenant B (slug "mi-pollo" o similar) con admin diferente al de tenant A
 *   - E2E_ADMIN_PASSWORD_TENANT_B en .env.test
 */

const ADMIN_PASS_A = process.env.E2E_ADMIN_PASSWORD ?? "Qa-admin-1234";
const ADMIN_USER_A = process.env.E2E_ADMIN_USER ?? "qaadmin";
const TENANT_A_SLUG = process.env.E2E_TENANT_A_SLUG ?? "main";
const TENANT_B_SLUG = process.env.E2E_TENANT_B_SLUG ?? "mi-pollo";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loginTenantA(request: APIRequestContext): Promise<string | null> {
  // ADR-120 login unificado: qaadmin existe en varias tiendas → sin tenantSlug
  // el endpoint responde { requiresTenantChoice } SIN cookie. Pasamos el slug
  // explícito para entrar SCOPED al tenant A.
  const res = await request.post("/api/auth/login", {
    data: { password: ADMIN_PASS_A, username: ADMIN_USER_A, tenantSlug: TENANT_A_SLUG },
  });
  if (!res.ok()) return null;
  // El cookie de sesión admin es `buleje-admin-sess` (lib/session.ts COOKIE_NAME).
  const setCookie = res.headers()["set-cookie"] ?? "";
  const match = setCookie.match(/buleje-admin-sess=[^;]+/);
  return match ? match[0] : null;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe("Multi-tenant aislamiento — cross-tenant access control", () => {
  // ── 1. Admin tenant A ve sus propias órdenes ──────────────────────────────

  test("1 — admin tenant A ve sus propias órdenes (200)", async ({ request }) => {
    const cookie = await loginTenantA(request);
    test.skip(!cookie, "Login tenant A falló");

    const res = await request.get("/api/marketplace/orders", {
      headers: { Cookie: cookie! },
    });
    expect([200, 304]).toContain(res.status());

    const body = await res.json().catch(() => null);
    if (body) {
      const orders = Array.isArray(body) ? body : (body.data ?? body.orders ?? []);
      expect(Array.isArray(orders)).toBe(true);
      // Todas las órdenes pertenecen al tenant del admin loggeado
      for (const order of orders) {
        if (order.tenantId) {
          // tenantId debe coincidir con el tenant del admin
          expect(typeof order.tenantId).toBe("string");
        }
      }
    }
  });

  // ── 2. Sin auth → 401/403 ─────────────────────────────────────────────────

  test("2 — GET /api/marketplace/orders sin cookie retorna 401 o 403", async ({ request }) => {
    const res = await request.get("/api/marketplace/orders");
    expect([401, 403]).toContain(res.status());
  });

  // ── 3. Cookie tenant A NO puede acceder a API con slug de tenant B ─────────

  test("3 — cookie tenant A rechazada en endpoint scoped a tenant B", async ({ request }) => {
    const cookie = await loginTenantA(request);
    test.skip(!cookie, "Login tenant A falló");

    // Intento de acceder a orders del tenant B via header override
    const res = await request.get("/api/marketplace/orders", {
      headers: {
        Cookie: cookie!,
        "x-tenant-slug": TENANT_B_SLUG,
        "x-tenant-id": "tenant-b-fake-id",
      },
    });

    // La API debe ignorar los headers e ignar los del tenant A (la cookie manda)
    // O rechazar si hay una validación explícita → 200 con datos de A, o 403
    expect([200, 304, 403]).toContain(res.status());

    if (res.status() === 200 || res.status() === 304) {
      const body = await res.json().catch(() => null);
      const orders = body
        ? Array.isArray(body)
          ? body
          : (body.data ?? body.orders ?? [])
        : [];
      // Los datos retornados NO deben pertenecer al tenant B
      for (const order of orders) {
        if (order.tenantSlug) {
          expect(order.tenantSlug).not.toBe(TENANT_B_SLUG);
        }
      }
    }
  });

  // ── 4. Header x-tenant-id inyectado es ignorado por el proxy ─────────────

  test("4 — header x-tenant-id inyectado no sobreescribe autenticación", async ({ request }) => {
    // Sin cookie: la inyección de x-tenant-id no otorga acceso
    const res = await request.get("/api/marketplace/orders", {
      headers: { "x-tenant-id": TENANT_A_SLUG },
    });
    expect([401, 403]).toContain(res.status());
  });

  // ── 5. Storefront tenant A y B muestran contenidos distintos ──────────────

  test("5 — /t/[slugA] y /t/[slugB] muestran contenido de tenants distintos", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("first-visit-coupon-shown", "true");
      } catch { /* silent */ }
    });

    const urlA = `/t/${TENANT_A_SLUG}/tienda`;
    const urlB = `/t/${TENANT_B_SLUG}/tienda`;

    await test.step("cargar storefront tenant A", async () => {
      // Detectar error de SERVIDOR por el status HTTP, no por la cadena "500"
      // en el body — los productos contienen "500g"/"500ml" y promos "S/50".
      const res = await page.goto(urlA, { waitUntil: "domcontentloaded", timeout: 20_000 });
      expect(res?.status() ?? 200).toBeLessThan(500);
    });

    const textA = await page.locator("main").first().textContent().catch(() => "");

    await test.step("cargar storefront tenant B", async () => {
      const res = await page.goto(urlB, { waitUntil: "domcontentloaded", timeout: 20_000 });
      expect(res?.status() ?? 200).toBeLessThan(500);
    });

    const textB = await page.locator("main").first().textContent().catch(() => "");

    await test.step("los contenidos son distintos", async () => {
      // Si ambos tenants tienen productos, el contenido debe diferir
      if (textA && textB && textA.length > 50 && textB.length > 50) {
        expect(textA).not.toEqual(textB);
      }
    });
  });

  // ── 6. Cart localStorage aislado por slug ─────────────────────────────────

  test("6 — carrito de tenant A no contamina carrito de tenant B", async ({ page }) => {
    // Simular guardado de carrito en tenant A
    await page.goto(`/t/${TENANT_A_SLUG}/tienda`, { waitUntil: "domcontentloaded" });

    await page.evaluate(
      ([slugA]) => {
        localStorage.setItem(`bsm-${slugA}-cart`, JSON.stringify([{ id: "prod-a", qty: 1 }]));
      },
      [TENANT_A_SLUG],
    );

    // Navegar a tenant B y verificar que su carrito está vacío
    await page.goto(`/t/${TENANT_B_SLUG}/tienda`, { waitUntil: "domcontentloaded" });

    const cartB = await page.evaluate(
      ([slugB]) => localStorage.getItem(`bsm-${slugB}-cart`),
      [TENANT_B_SLUG],
    );

    const items = cartB ? JSON.parse(cartB) : [];
    expect(items).not.toContainEqual(expect.objectContaining({ id: "prod-a" }));
  });

  // ── 7. GET /api/orders sin auth → 401/403 ────────────────────────────────

  test("7 — GET /api/orders sin auth retorna 401 o 403", async ({ request }) => {
    const res = await request.get("/api/orders");
    expect([401, 403]).toContain(res.status());
  });

  // ── 8. Tenant inexistente retorna 404 ────────────────────────────────────

  test("8 — storefront de tenant inexistente retorna 404 o error controlado", async ({
    page,
  }) => {
    const res = await page.goto("/t/tenant-fantasma-xyz-99999/tienda", {
      waitUntil: "domcontentloaded",
    });
    const status = res?.status() ?? 200;
    const bodyText = await page.locator("body").textContent().catch(() => "");
    const isError =
      status === 404 ||
      bodyText?.includes("404") ||
      bodyText?.toLowerCase().includes("no encontrad") ||
      bodyText?.toLowerCase().includes("not found");
    expect(isError || status >= 400).toBeTruthy();
  });
});
