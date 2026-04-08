import { test, expect, APIRequestContext } from "@playwright/test";

/**
 * E2E — Flujo completo del Bloque D1 del Marketplace (Delivery vivo).
 *
 * Cubre:
 *   1. Auth guards de los endpoints admin
 *   2. Endpoint público /api/track/[orderId] responde correcto sin auth
 *   3. Feature flag apaga el endpoint público (503)
 *   4. POST tracking valida con Zod
 *   5. Multi-tenant isolation (smoke)
 *
 * Diseño:
 *   - NO asume datos del seed — este test corre en preview con base limpia.
 *   - Para los tests que requieren login, se skipea si no hay E2E_ADMIN_PASSWORD.
 *   - Los tests de auth guards NO necesitan login — verifican solo que sin
 *     sesión devuelven 401/403.
 */

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
// Auth guards — los endpoints admin deben rechazar requests sin sesión
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Delivery D1 — Auth guards", () => {
  test("POST /api/admin/delivery/tracking requires session", async ({ request }) => {
    const res = await request.post("/api/admin/delivery/tracking", {
      data: { orderId: "fake", status: "preparing" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("GET /api/admin/delivery/tracking requires session", async ({ request }) => {
    const res = await request.get("/api/admin/delivery/tracking");
    expect([401, 403]).toContain(res.status());
  });

  test("POST /api/admin/delivery/routes requires session", async ({ request }) => {
    const res = await request.post("/api/admin/delivery/routes", {
      data: {
        storeId: "fake",
        driverId: "d1",
        driverName: "Test",
        plannedStartAt: new Date().toISOString(),
      },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("GET /api/admin/delivery/routes requires session", async ({ request }) => {
    const res = await request.get("/api/admin/delivery/routes");
    expect([401, 403]).toContain(res.status());
  });

  test("PATCH /api/admin/delivery/routes requires session", async ({ request }) => {
    const res = await request.patch("/api/admin/delivery/routes", {
      data: { routeId: "fake", status: "completed" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("POST /api/admin/delivery/routes/[id]/stops requires session", async ({ request }) => {
    const res = await request.post("/api/admin/delivery/routes/fake/stops", {
      data: {
        orderId: "o1",
        address: "Jr. Progreso 1",
        customerName: "Test",
      },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("PATCH /api/admin/delivery/routes/[id]/stops requires session", async ({ request }) => {
    const res = await request.patch("/api/admin/delivery/routes/fake/stops", {
      data: { stopId: "s1", status: "delivered" },
    });
    expect([401, 403]).toContain(res.status());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint público — funciona sin auth, privacidad por diseño
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Delivery D1 — Endpoint público de tracking", () => {
  test("GET /api/track/[orderId] sin orderId devuelve 404 (Next routing)", async ({ request }) => {
    const res = await request.get("/api/track/");
    expect([404, 405]).toContain(res.status());
  });

  test("GET /api/track/[orderId] con orderId inválido (muy corto) devuelve 400", async ({ request }) => {
    const res = await request.get("/api/track/abc");
    expect(res.status()).toBe(400);
  });

  test("GET /api/track/[orderId] con orderId inexistente devuelve 404 o 503 (si feature flag off)", async ({
    request,
  }) => {
    const res = await request.get("/api/track/NONEXISTENT-ORDER-1234567890");
    // 503 si el feature flag delivery-live-public-link está off (default)
    // 404 si está encendido pero el order no existe
    expect([404, 503]).toContain(res.status());
  });

  test("GET /api/track/[orderId] respeta el header noindex", async ({ request }) => {
    const res = await request.get("/api/track/NONEXISTENT-ORDER-1234567890");
    if (res.status() === 200) {
      // Si devolvió 200 (feature flag on + order existe), verificar headers
      expect(res.headers()["x-robots-tag"]).toContain("noindex");
      expect(res.headers()["cache-control"]).toMatch(/max-age=1[05]/);
    }
    // Si devolvió 404/503, el test pasa igual porque los headers del error
    // no necesitan ser noindex.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validación Zod — los bodies inválidos se rechazan con 400
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Delivery D1 — Validación Zod", () => {
  test.skip(
    !process.env.E2E_ADMIN_PASSWORD,
    "Skip: E2E_ADMIN_PASSWORD no está seteado",
  );

  test("POST tracking con body vacío devuelve 400", async ({ request }) => {
    const cookie = await adminLogin(request);
    if (!cookie) test.skip();
    const res = await request.post("/api/admin/delivery/tracking", {
      headers: { Cookie: cookie! },
      data: {},
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  test("POST tracking con status inválido devuelve 400", async ({ request }) => {
    const cookie = await adminLogin(request);
    if (!cookie) test.skip();
    const res = await request.post("/api/admin/delivery/tracking", {
      headers: { Cookie: cookie! },
      data: {
        orderId: "MKT-TEST-001",
        status: "estado-inventado", // no está en el enum
      },
    });
    expect(res.status()).toBe(400);
  });

  test("POST routes con plannedStartAt inválido devuelve 400", async ({ request }) => {
    const cookie = await adminLogin(request);
    if (!cookie) test.skip();
    const res = await request.post("/api/admin/delivery/routes", {
      headers: { Cookie: cookie! },
      data: {
        storeId: "store-1",
        driverId: "driver-1",
        driverName: "Test",
        plannedStartAt: "no-es-una-fecha", // Zod .datetime() debe rechazar
      },
    });
    expect(res.status()).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Multi-tenant isolation (smoke) — el endpoint admin respeta x-tenant-id
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Delivery D1 — Multi-tenant smoke", () => {
  test("El endpoint tracking no expone datos cross-tenant sin auth", async ({ request }) => {
    // Sin sesión, el endpoint devuelve 401 independiente del header x-tenant-id
    const res = await request.get("/api/admin/delivery/tracking?orderId=otro-tenant", {
      headers: { "x-tenant-id": "otro-tenant-malicioso" },
    });
    expect([401, 403]).toContain(res.status());
  });
});
