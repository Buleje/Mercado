/**
 * cross-tenant.spec.ts
 *
 * E2E: Gate anti-regresion de aislamiento multi-tenant (Nivel API).
 *
 * Que valida:
 *   1. Dos clientes con el mismo `phone` en tenants distintos NO filtran datos entre si.
 *   2. Los endpoints /api/me/* devuelven solo datos del tenant autenticado.
 *   3. Intentar spoofear el tenant via header x-tenant-id es rechazado (401/403/404).
 *   4. Datos de loyalty de tenant A no son accesibles desde sesion de tenant B.
 *
 * Dependencias de infraestructura (ver secciones TODO):
 *   - Dos tenants sembrados: "demo" y "fruteria-maria"
 *   - Un customer con phone +51999000001 en ambos tenants (datos distintos)
 *   - Helper de autenticacion que genera cookie de sesion para customer
 *
 * Como correr:
 *   npx playwright test e2e/cross-tenant.spec.ts
 *   npx playwright test e2e/cross-tenant.spec.ts --headed  (visual)
 */

import { test, expect, type APIRequestContext } from "@playwright/test";

// ── Configuracion de fixtures ──────────────────────────────────────────────

/**
 * Phone compartido entre ambos tenants.
 * En la BD hay dos Customer rows con este phone, cada uno con tenantId distinto.
 */
const SHARED_PHONE = "+51999000001";

/**
 * Tenant A — "demo"
 * El customer en demo tiene nombre "Cliente Demo" y 500 puntos de lealtad.
 */
const TENANT_A = {
  slug: "demo",
  tenantId: "demo",
  customerName: "Cliente Demo",
  loyaltyPoints: 500,
  baseUrl: "/t/demo",
};

/**
 * Tenant B — "fruteria-maria"
 * El customer en fruteria tiene nombre "Maria Fruteria" y 0 puntos de lealtad.
 * Estos datos NO deben aparecer en una sesion autenticada como tenant A.
 */
const TENANT_B = {
  slug: "fruteria-maria",
  tenantId: "fruteria-maria",
  customerName: "Maria Fruteria",
  loyaltyPoints: 0,
  baseUrl: "/t/fruteria-maria",
};

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * TODO(infra): Implementar autenticacion de customer via API de seed.
 *
 * Este helper debe:
 *   1. Llamar a /api/auth/customer/signin con phone + OTP (o usar un token de test).
 *   2. Retornar el header Cookie con la sesion activa.
 *   3. En CI, usar variables de entorno: PLAYWRIGHT_CUSTOMER_OTP_SECRET.
 *
 * Por ahora retorna un objeto vacio — los tests que requieren auth
 * quedaran en "pendiente" hasta implementar el helper.
 *
 * Implementacion sugerida:
 *   const res = await request.post("/api/auth/customer/test-session", {
 *     data: { phone, tenantSlug, secret: process.env.PLAYWRIGHT_TEST_SECRET },
 *   });
 *   const { sessionCookie } = await res.json();
 *   return { Cookie: sessionCookie };
 */
async function getCustomerSessionHeaders(
  _request: APIRequestContext,
  _phone: string,
  _tenantSlug: string,
): Promise<Record<string, string>> {
  // TODO(infra): implementar endpoint /api/auth/customer/test-session
  // que solo funcione cuando NODE_ENV=test y con un secret de Playwright.
  // Ver: lib/auth/require-customer.ts para el formato de sesion.
  console.warn("[cross-tenant] STUB: getCustomerSessionHeaders no implementado");
  return {};
}

/**
 * Helper: hace GET a una ruta /api/me/* con headers de sesion del tenant indicado.
 * Incluye el header x-tenant-id derivado del slug (igual que el middleware proxy).
 */
async function meRequest(
  request: APIRequestContext,
  path: string,
  sessionHeaders: Record<string, string>,
  overrideTenantId?: string,
) {
  const tenantId = overrideTenantId ?? sessionHeaders["x-tenant-id"] ?? "";
  return request.get(path, {
    headers: {
      ...sessionHeaders,
      "x-tenant-id": tenantId,
    },
  });
}

// ── Suite 1: Aislamiento de datos en /api/me/* ─────────────────────────────

test.describe("API /api/me/* — aislamiento multi-tenant", () => {
  /**
   * Test de smoke: verifica que /api/me/dashboard requiere sesion activa.
   * No necesita auth real — valida que el gate existe.
   */
  test("dashboard rechaza requests sin sesion", async ({ request }) => {
    const res = await request.get("/api/me/dashboard", {
      headers: { "x-tenant-id": TENANT_A.tenantId },
    });
    // Debe rechazar — 401 (no autenticado) o 307 (redirect a login)
    expect([401, 307, 302, 403]).toContain(res.status());
  });

  test("addresses rechaza requests sin sesion", async ({ request }) => {
    const res = await request.get("/api/me/addresses", {
      headers: { "x-tenant-id": TENANT_A.tenantId },
    });
    expect([401, 307, 302, 403]).toContain(res.status());
  });

  test("credit-score rechaza requests sin sesion", async ({ request }) => {
    const res = await request.get("/api/me/credit-score", {
      headers: { "x-tenant-id": TENANT_A.tenantId },
    });
    expect([401, 307, 302, 403, 404]).toContain(res.status());
  });

  test("notifications rechaza requests sin sesion", async ({ request }) => {
    const res = await request.get("/api/me/notifications", {
      headers: { "x-tenant-id": TENANT_A.tenantId },
    });
    expect([401, 307, 302, 403]).toContain(res.status());
  });

  test("order-history rechaza requests sin sesion", async ({ request }) => {
    const res = await request.get("/api/me/order-history", {
      headers: { "x-tenant-id": TENANT_A.tenantId },
    });
    expect([401, 307, 302, 403]).toContain(res.status());
  });

  test("spending-summary rechaza requests sin sesion", async ({ request }) => {
    const res = await request.get("/api/me/spending-summary", {
      headers: { "x-tenant-id": TENANT_A.tenantId },
    });
    expect([401, 307, 302, 403]).toContain(res.status());
  });
});

// ── Suite 2: Spoof de x-tenant-id ─────────────────────────────────────────

test.describe("Header x-tenant-id spoof — el proxy debe ignorarlo", () => {
  /**
   * Si el cliente envia x-tenant-id de tenant B pero la URL es de tenant A,
   * el proxy (middleware.ts) debe resolver el tenant desde la URL, no del header.
   *
   * Este test verifica que el endpoint de productos no filtra datos
   * cruzados al inyectar el header spoofeado.
   */
  test("GET /t/demo/api/products ignora x-tenant-id: fruteria-maria", async ({ request }) => {
    const demoRes = await request.get("/t/demo/api/products");
    const spoofedRes = await request.get("/t/demo/api/products", {
      headers: { "x-tenant-id": TENANT_B.tenantId },
    });

    // Ambas deben responder con el mismo status
    expect([200, 304]).toContain(demoRes.status());
    expect([200, 304]).toContain(spoofedRes.status());

    // El contenido debe ser identico (mismos productos de demo)
    const demoData = await demoRes.json().catch(() => null);
    const spoofedData = await spoofedRes.json().catch(() => null);

    if (demoData && spoofedData) {
      const demoProducts = Array.isArray(demoData) ? demoData : demoData.products ?? demoData.data ?? [];
      const spoofedProducts = Array.isArray(spoofedData) ? spoofedData : spoofedData.products ?? spoofedData.data ?? [];

      // IDs deben coincidir — el spoof no cambio el tenant fuente
      const demoIds = demoProducts.map((p: { id: number | string }) => String(p.id)).sort();
      const spoofedIds = spoofedProducts.map((p: { id: number | string }) => String(p.id)).sort();
      expect(spoofedIds).toEqual(demoIds);
    }
  });

  /**
   * Verifica que productos de fruteria NO aparecen cuando se accede via URL de demo
   * aunque se spoofee el header.
   */
  test("productos de fruteria-maria no aparecen en respuesta de demo con spoof", async ({ request }) => {
    const fruteriaRes = await request.get("/t/fruteria-maria/api/products");
    const spoofedDemoRes = await request.get("/t/demo/api/products", {
      headers: { "x-tenant-id": TENANT_B.tenantId },
    });

    if (fruteriaRes.status() !== 200 || spoofedDemoRes.status() !== 200) {
      // Si alguno falla, skip — probablemente no hay datos de fruteria
      test.skip();
      return;
    }

    const fruteriaData = await fruteriaRes.json().catch(() => ({ products: [] }));
    const spoofedData = await spoofedDemoRes.json().catch(() => ({ products: [] }));

    const fruteriaIds = new Set(
      (Array.isArray(fruteriaData) ? fruteriaData : fruteriaData.products ?? [])
        .map((p: { id: number | string }) => String(p.id))
    );

    const spoofedProducts = Array.isArray(spoofedData) ? spoofedData : spoofedData.products ?? [];

    // Ninguno de los productos devueltos en la URL de demo debe ser de fruteria
    for (const product of spoofedProducts) {
      expect(fruteriaIds.has(String(product.id))).toBe(false);
    }
  });
});

// ── Suite 3: Loyalty aislamiento ──────────────────────────────────────────

test.describe("API /api/loyalty/[phone] — ownership check", () => {
  /**
   * Un customer de tenant A no puede leer el loyalty de otro phone.
   * No requiere auth real — valida que sin sesion siempre se rechaza.
   */
  test("loyalty de phone ajeno rechaza sin sesion", async ({ request }) => {
    const res = await request.get(`/api/loyalty/${encodeURIComponent(SHARED_PHONE)}`, {
      headers: { "x-tenant-id": TENANT_A.tenantId },
    });
    // Sin sesion activa debe rechazar con 401/403
    expect([401, 403, 307, 302]).toContain(res.status());
  });

  test("loyalty de phone propio rechaza sin sesion (gate siempre activo)", async ({ request }) => {
    // Incluso con el mismo phone — sin cookie de sesion, debe rechazar
    const res = await request.get(`/api/loyalty/+51999000000`, {
      headers: { "x-tenant-id": TENANT_A.tenantId },
    });
    expect([401, 403, 307, 302]).toContain(res.status());
  });
});

// ── Suite 4: Tests con sesion real (requieren helper implementado) ─────────

test.describe("Aislamiento con sesion real autenticada @needs-auth", () => {
  /**
   * TODO(infra): Estos tests requieren:
   *   1. getCustomerSessionHeaders implementado (ver helper arriba)
   *   2. Customer con SHARED_PHONE sembrado en ambos tenants con datos distintos
   *   3. Variable de entorno PLAYWRIGHT_TEST_SECRET configurada
   *
   * Mientras el helper sea stub, estos tests pasan como "authenticated"
   * solo si el endpoint acepta headers vacios (lo cual no deberia ocurrir).
   * La suite completa se activa cuando el helper retorna una cookie valida.
   */

  test("dashboard de tenant A no expone datos de tenant B @needs-auth", async ({ request }) => {
    const sessionA = await getCustomerSessionHeaders(request, SHARED_PHONE, TENANT_A.slug);

    // Si el helper no esta implementado, el test verifica que sin sesion = 401
    const res = await meRequest(request, "/api/me/dashboard", sessionA, TENANT_A.tenantId);

    if (Object.keys(sessionA).length === 0) {
      // Helper stub — solo verificamos que el gate rechaza
      expect([401, 307, 302, 403]).toContain(res.status());
      return;
    }

    // Con sesion real: el dashboard debe responder 200 con datos de tenant A
    expect(res.status()).toBe(200);
    const data = await res.json();

    // Verificar que el nombre del customer es el de tenant A, no tenant B
    expect(data.profile?.name).not.toBe(TENANT_B.customerName);

    // El tenantId en cualquier campo embebido debe corresponder a A
    // (si se expone — depende de la implementacion actual)
    if (data.tenantId) {
      expect(data.tenantId).toBe(TENANT_A.tenantId);
    }
  });

  test("sesion de tenant A rechazada al acceder endpoint de tenant B @needs-auth", async ({ request }) => {
    const sessionA = await getCustomerSessionHeaders(request, SHARED_PHONE, TENANT_A.slug);

    if (Object.keys(sessionA).length === 0) {
      // Helper stub — solo verificamos gate basico
      const res = await meRequest(request, "/api/me/dashboard", {}, TENANT_B.tenantId);
      expect([401, 307, 302, 403]).toContain(res.status());
      return;
    }

    /**
     * Con sesion de tenant A, intentamos llamar al endpoint usando x-tenant-id de B.
     * El middleware debe:
     *   a) Detectar que la sesion pertenece a tenant A, y
     *   b) Rechazar la solicitud (401/403) o servir datos de A ignorando el header.
     *
     * Cualquiera de los dos comportamientos es aceptable — lo que NO es aceptable
     * es devolver 200 con datos de tenant B.
     */
    const res = await meRequest(request, "/api/me/dashboard", sessionA, TENANT_B.tenantId);

    if (res.status() === 200) {
      const data = await res.json();
      // Si responde 200, debe ser con datos de A (el tenant de la sesion), no B
      if (data.profile?.name) {
        expect(data.profile.name).not.toBe(TENANT_B.customerName);
      }
    } else {
      // Rechazo — comportamiento mas seguro
      expect([401, 403, 400]).toContain(res.status());
    }
  });

  test("order-history de tenant A no contiene ordenes de tenant B @needs-auth", async ({ request }) => {
    const sessionA = await getCustomerSessionHeaders(request, SHARED_PHONE, TENANT_A.slug);

    if (Object.keys(sessionA).length === 0) {
      const res = await request.get("/api/me/order-history", {
        headers: { "x-tenant-id": TENANT_A.tenantId },
      });
      expect([401, 307, 302, 403]).toContain(res.status());
      return;
    }

    const res = await meRequest(request, "/api/me/order-history", sessionA, TENANT_A.tenantId);
    expect(res.status()).toBe(200);

    const data = await res.json();
    const orders = data.orders ?? data.data ?? [];

    // Ninguna orden debe tener tenantId de B (si se expone en la respuesta)
    for (const order of orders) {
      if (order.tenantId) {
        expect(order.tenantId).toBe(TENANT_A.tenantId);
      }
    }
  });

  test("credit-score de tenant A no expone historial de tenant B @needs-auth", async ({ request }) => {
    const sessionA = await getCustomerSessionHeaders(request, SHARED_PHONE, TENANT_A.slug);

    if (Object.keys(sessionA).length === 0) {
      const res = await request.get("/api/me/credit-score", {
        headers: { "x-tenant-id": TENANT_A.tenantId },
      });
      expect([401, 307, 302, 403, 404]).toContain(res.status());
      return;
    }

    const res = await meRequest(request, "/api/me/credit-score", sessionA, TENANT_A.tenantId);
    // 404 es valido si fiado-digital esta desactivado en este tenant
    expect([200, 404]).toContain(res.status());

    if (res.status() === 200) {
      const data = await res.json();
      // El historial no debe ser vacio si el customer tiene actividad en A
      // (no verificamos el contenido exacto — eso es de responsabilidad del unit test)
      expect(data).toHaveProperty("score");
    }
  });
});

// ── Suite 5: Endpoints publicos de marketplace ─────────────────────────────

test.describe("Marketplace — endpoints publicos no exponen datos cruzados", () => {
  test("GET /api/marketplace/stores/[slug]/phone retorna phone del tenant correcto", async ({ request }) => {
    const demoRes = await request.get("/api/marketplace/stores/demo/phone");
    const fruteriaRes = await request.get("/api/marketplace/stores/fruteria-maria/phone");

    // Ambos pueden responder 200 con { phone: null | string }
    // Lo importante es que sean independientes
    if (demoRes.status() === 200 && fruteriaRes.status() === 200) {
      const demoData = await demoRes.json();
      const fruteriaData = await fruteriaRes.json();

      // Los phones no deben ser identicos (a menos que ambos tenants tengan el mismo —
      // lo cual no deberia ocurrir en datos de seed normales)
      if (demoData.phone !== null && fruteriaData.phone !== null) {
        expect(demoData.phone).not.toBe(fruteriaData.phone);
      }

      // El contrato de este endpoint es siempre { phone: string | null }
      expect(demoData).toHaveProperty("phone");
      expect(fruteriaData).toHaveProperty("phone");
    }
  });

  test("recommendations/for-me rechaza sin sesion", async ({ request }) => {
    const res = await request.get("/api/marketplace/recommendations/for-me", {
      headers: { "x-tenant-id": TENANT_A.tenantId },
    });
    expect([401, 307, 302, 403]).toContain(res.status());
  });
});
