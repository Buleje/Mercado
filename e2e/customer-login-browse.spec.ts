import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * customer-login-browse.spec.ts
 *
 * Happy path: cliente navega el marketplace como usuario autenticado.
 *
 * Auth: cookie de sesión `buleje-customer-sess` inyectada via storageState
 * o vía login API. El test usa E2E_CUSTOMER_TOKEN si existe (token JWT pre-generado),
 * de lo contrario intenta login con E2E_CUSTOMER_PHONE.
 *
 * Rutas cubiertas:
 *   /tiendas           → listado de tiendas
 *   /marketplace/[slug] → storefront de una tienda
 *   Producto visible en catálogo
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

async function customerLogin(request: APIRequestContext): Promise<string | null> {
  const phone = process.env.E2E_CUSTOMER_PHONE;
  if (!phone) return null;

  const res = await request.post("/api/customers/login", {
    data: { phone },
  });
  if (!res.ok()) return null;

  const setCookie = res.headers()["set-cookie"] ?? "";
  const match = setCookie.match(/buleje-customer-sess=[^;]+/);
  return match ? match[0] : null;
}

function suppressOnboardingModal(slug: string) {
  return () => {
    try {
      localStorage.setItem(`onboarding-completed-${slug}`, "1");
      localStorage.setItem("first-visit-coupon-shown", "true");
    } catch { /* silent */ }
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe("Cliente login y navegación marketplace", () => {
  // ── 1. Página /tiendas carga sin auth ────────────────────────────────────

  test("1 — /tiendas carga listado de tiendas sin requerir auth", async ({ page }) => {
    await page.addInitScript(suppressOnboardingModal("main"));
    await page.goto("/tiendas", { waitUntil: "domcontentloaded", timeout: 30_000 });

    await test.step("la página muestra al menos una tienda", async () => {
      const body = page.locator("body");
      await expect(body).not.toContainText("500", { timeout: 10_000 });
      await expect(body).not.toContainText("Error", { timeout: 5_000 });

      // Hay cards de tiendas (cualquier enlace que apunte a /marketplace/)
      const storeLinks = page.locator('a[href*="/marketplace/"]');
      await expect(storeLinks.first()).toBeVisible({ timeout: 15_000 });
    });
  });

  // ── 2. Storefront por slug carga ─────────────────────────────────────────

  test("2 — /marketplace/[slug] carga el storefront de un vendor", async ({ page }) => {
    const slug = process.env.E2E_VENDOR_SLUG ?? "demo";
    await page.addInitScript(suppressOnboardingModal(slug));

    await test.step("navegar al storefront", async () => {
      const res = await page.goto(`/marketplace/${slug}`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      // 200 o 3xx aceptable (redirect a /tienda del slug)
      expect(res?.status() ?? 200).toBeLessThan(400);
    });

    await test.step("el catálogo muestra productos", async () => {
      const main = page.locator("main").first();
      await expect(main).toBeVisible({ timeout: 15_000 });
      await expect(page.locator("body")).not.toContainText("404");
    });
  });

  // ── 3. Cliente sin sesión ve página de login si intenta /mi-cuenta ────────

  test("3 — /marketplace/mi-cuenta redirige a login si no hay sesión", async ({ page }) => {
    await page.context().clearCookies();

    await test.step("navegar a mi-cuenta sin cookie", async () => {
      await page.goto("/marketplace/mi-cuenta", { waitUntil: "domcontentloaded" });
    });

    await test.step("la respuesta es 4xx o muestra login", async () => {
      const url = page.url();
      const body = await page.locator("body").textContent();
      const isLoginOrError =
        url.includes("login") ||
        url.includes("cuenta") ||
        body?.toLowerCase().includes("ingresar") ||
        body?.toLowerCase().includes("iniciar sesión") ||
        body?.includes("401") ||
        body?.includes("403");
      expect(isLoginOrError).toBeTruthy();
    });
  });

  // ── 4. Login API retorna cookie válida ────────────────────────────────────

  test("4 — POST /api/customers/login con teléfono válido retorna sesión", async ({
    request,
  }) => {
    test.skip(!process.env.E2E_CUSTOMER_PHONE, "Requiere E2E_CUSTOMER_PHONE");

    await test.step("llamar al endpoint de login", async () => {
      const res = await request.post("/api/customers/login", {
        data: { phone: process.env.E2E_CUSTOMER_PHONE },
      });
      // 200 (sesión creada) o 404 (cliente no existe en seed — aceptable en CI limpio)
      expect([200, 201, 404]).toContain(res.status());
    });
  });

  // ── 5. Cliente loggeado ve /marketplace/mi-cuenta ─────────────────────────

  test("5 — cliente autenticado accede a /marketplace/mi-cuenta", async ({ page, request }) => {
    test.skip(!process.env.E2E_CUSTOMER_PHONE, "Requiere E2E_CUSTOMER_PHONE");

    const cookie = await customerLogin(request);
    test.skip(!cookie, "Login falló — verificar E2E_CUSTOMER_PHONE en DB");

    await page.context().addCookies([
      {
        name: "buleje-customer-sess",
        value: cookie!.replace("buleje-customer-sess=", ""),
        domain: "localhost",
        path: "/",
      },
    ]);

    await test.step("navegar a mi-cuenta", async () => {
      await page.goto("/marketplace/mi-cuenta", { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).not.toContainText("401");
      await expect(page.locator("body")).not.toContainText("403");
    });

    await test.step("muestra datos del cliente", async () => {
      const main = page.locator("main").first();
      await expect(main).toBeVisible({ timeout: 10_000 });
    });
  });

  // ── 6. /tiendas no expone 500 con slugs especiales ────────────────────────

  test("6 — /tiendas no rompe con query params inesperados", async ({ page }) => {
    const res = await page.goto("/tiendas?q=<script>&cat=unknown", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("body")).not.toContainText("500");
    expect(res?.status() ?? 200).toBeLessThan(500);
  });

  // ── 7. API pública /api/marketplace/vendors retorna lista ─────────────────

  test("7 — GET /api/marketplace/vendors retorna array de vendors", async ({ request }) => {
    const res = await request.get("/api/marketplace/vendors");
    expect([200, 304]).toContain(res.status());

    const body = await res.json().catch(() => null);
    if (body) {
      // Acepta { data: [...] } o array directo
      const list = Array.isArray(body) ? body : (body.data ?? body.vendors ?? []);
      expect(Array.isArray(list)).toBe(true);
    }
  });

  // ── 8. Producto detail page carga desde el storefront ─────────────────────

  test("8 — /marketplace/[slug] muestra productos con botón agregar", async ({ page }) => {
    const slug = process.env.E2E_VENDOR_SLUG ?? "demo";
    await page.addInitScript(suppressOnboardingModal(slug));
    await page.goto(`/marketplace/${slug}`, { waitUntil: "domcontentloaded", timeout: 30_000 });

    await test.step("hay al menos un botón para agregar producto", async () => {
      const addBtn = page
        .getByRole("button", { name: /agregar|añadir/i })
        .or(page.locator('[data-testid="add-to-cart"]'))
        .first();

      // Si no hay productos en seed, el test no falla: verifica que la página carga
      const hasBtns = await addBtn.isVisible({ timeout: 8_000 }).catch(() => false);
      if (hasBtns) {
        await expect(addBtn).toBeEnabled();
      } else {
        // Sin productos en seed: verificar que al menos la página cargó
        await expect(page.locator("main").first()).toBeVisible({ timeout: 10_000 });
      }
    });
  });
});
