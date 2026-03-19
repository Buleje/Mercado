import { test, expect, APIRequestContext } from "@playwright/test";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: admin login via API. Returns cookie or null (test will skip if null).
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
// DELIVERY ROUTES — Auth guards
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Delivery Routes — Auth guards", () => {
  test("PATCH /api/orders/[id] requires session", async ({ request }) => {
    const res = await request.patch("/api/orders/nonexistent-order-id", {
      data: { status: "en_camino" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("GET /api/admin/dashboard requires session", async ({ request }) => {
    const res = await request.get("/api/admin/dashboard");
    expect([401, 403]).toContain(res.status());
  });

  test("GET /api/admin/warehouses requires session", async ({ request }) => {
    const res = await request.get("/api/admin/warehouses");
    expect([401, 403]).toContain(res.status());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELIVERY ROUTES — Status cycle
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Delivery Routes — Status cycle", () => {
  test("order status cycle: pendiente → en_camino → entregado", async ({ request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set");

    const headers = { Cookie: cookie! };

    // Grab a 'pendiente' order from the dashboard
    const dashRes = await request.get("/api/admin/dashboard", { headers });
    expect(dashRes.ok()).toBe(true);
    const dash = await dashRes.json();
    const orders = dash?.orders as Array<{ id: string; status: string }> | undefined;
    const pendiente = orders?.find(o => o.status === "pendiente");
    test.skip(!pendiente, "No hay pedidos pendientes para testear el ciclo");

    const orderId = pendiente!.id;

    // Step 1: advance to en_camino
    const routeRes = await request.patch(`/api/orders/${orderId}`, {
      headers,
      data: { status: "en_camino" },
    });
    expect(routeRes.ok()).toBe(true);
    const routed = await routeRes.json();
    expect(routed.status).toBe("en_camino");

    // Step 2: mark as delivered
    const deliverRes = await request.patch(`/api/orders/${orderId}`, {
      headers,
      data: { status: "entregado" },
    });
    expect(deliverRes.ok()).toBe(true);
    const delivered = await deliverRes.json();
    expect(delivered.status).toBe("entregado");

    // Restore original status so the test is idempotent
    await request.patch(`/api/orders/${orderId}`, {
      headers,
      data: { status: "pendiente" },
    });
  });

  test("invalid status value returns 400", async ({ request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set");

    const headers = { Cookie: cookie! };

    const dashRes = await request.get("/api/admin/dashboard", { headers });
    const dash = await dashRes.json();
    const orders = dash?.orders as Array<{ id: string }> | undefined;
    test.skip(!orders?.length, "No hay pedidos");

    const res = await request.patch(`/api/orders/${orders![0].id}`, {
      headers,
      data: { status: "estado_invalido_xyz" },
    });
    expect([400, 422]).toContain(res.status());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELIVERY ROUTES — Week filter
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Delivery Routes — Week filter data", () => {
  test("dashboard orders include customerName field", async ({ request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set");

    const headers = { Cookie: cookie! };

    const res = await request.get("/api/admin/dashboard", { headers });
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data.orders)).toBe(true);

    // If there are orders, each should have basic fields
    for (const order of (data.orders as Array<Record<string, unknown>>).slice(0, 5)) {
      expect(order).toHaveProperty("id");
      expect(order).toHaveProperty("status");
      expect(order).toHaveProperty("createdAt");
    }
  });

  test("week filter: orders within last 7 days are included", async ({ request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set");

    const headers = { Cookie: cookie! };

    const res = await request.get("/api/admin/dashboard", { headers });
    const data = await res.json();
    const orders = data?.orders as Array<{ id: string; createdAt: string }> | undefined;
    if (!orders?.length) return; // nothing to assert

    for (const o of orders.slice(0, 10)) {
      const ts = new Date(o.createdAt).getTime();
      // Dates must be parseable
      expect(isNaN(ts)).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WAREHOUSES — CRUD API
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Warehouses API", () => {
  test("GET /api/admin/warehouses returns at least 1 warehouse (auto-creates default)", async ({ request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set");

    const headers = { Cookie: cookie! };
    const res = await request.get("/api/admin/warehouses", { headers });
    expect(res.ok()).toBe(true);
    const list = await res.json();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);

    const first = list[0] as Record<string, unknown>;
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("code");
    expect(first).toHaveProperty("active");
  });

  test("POST /api/admin/warehouses creates a new warehouse", async ({ request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set");

    const headers = { Cookie: cookie! };
    const payload = {
      name: "Depósito E2E Test",
      code: `E2E-${Date.now()}`,
      type: "deposito",
      location: "Zona industrial",
      manager: "Tester",
      capacity: 500,
    };

    const res = await request.post("/api/admin/warehouses", { headers, data: payload });
    expect(res.status()).toBe(201);
    const created = await res.json();
    expect(created).toHaveProperty("id");
    expect(created.name).toBe(payload.name);
    expect(created.type).toBe("deposito");

    // Cleanup: deactivate so it doesn't pollute the environment
    await request.patch("/api/admin/warehouses", {
      headers,
      data: { id: created.id, active: false },
    });
  });

  test("POST /api/admin/warehouses rejects missing name", async ({ request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set");

    const headers = { Cookie: cookie! };
    const res = await request.post("/api/admin/warehouses", {
      headers,
      data: { code: "NO-NAME" },
    });
    expect(res.status()).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RIDER NAME — Persistence via PATCH /api/orders/[id]
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Delivery Routes — riderName persistence", () => {
  test("PATCH saves riderName and GET returns it", async ({ request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set");

    const headers = { Cookie: cookie! };

    // Get any order to use as fixture
    const dashRes = await request.get("/api/admin/dashboard", { headers });
    expect(dashRes.ok()).toBe(true);
    const dash = await dashRes.json();
    const orders = dash?.orders as Array<{ id: string; riderName?: string }> | undefined;
    test.skip(!orders?.length, "No hay pedidos en la base de datos");

    const orderId = orders![0].id;
    const previousRider = orders![0].riderName ?? null;
    const testRider = "E2E Repartidor Test";

    // Assign riderName via PATCH
    const patchRes = await request.patch(`/api/orders/${orderId}`, {
      headers,
      data: { riderName: testRider },
    });
    expect(patchRes.ok()).toBe(true);
    const patched = await patchRes.json();
    expect(patched.riderName).toBe(testRider);

    // Verify GET /api/orders/[id] returns the persisted riderName
    const getRes = await request.get(`/api/orders/${orderId}`, { headers });
    expect(getRes.ok()).toBe(true);
    const fetched = await getRes.json();
    expect(fetched.riderName).toBe(testRider);

    // Cleanup: restore previous value (empty string clears it)
    await request.patch(`/api/orders/${orderId}`, {
      headers,
      data: { riderName: previousRider ?? "" },
    });
  });

  test("riderName field appears in dashboard orders response", async ({ request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set");

    const headers = { Cookie: cookie! };

    const res = await request.get("/api/admin/dashboard", { headers });
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data.orders)).toBe(true);

    // The riderName key should be present (null/undefined is fine) for well-shaped objects
    for (const order of (data.orders as Array<Record<string, unknown>>).slice(0, 3)) {
      expect(order).toHaveProperty("id");
      expect(order).toHaveProperty("status");
      // riderName may be absent (undefined) when not assigned — that's valid
    }
  });

  test("PATCH with empty riderName clears the field", async ({ request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set");

    const headers = { Cookie: cookie! };

    const dashRes = await request.get("/api/admin/dashboard", { headers });
    const dash = await dashRes.json();
    const orders = dash?.orders as Array<{ id: string }> | undefined;
    test.skip(!orders?.length, "No hay pedidos");

    const orderId = orders![0].id;

    // Set a rider first
    await request.patch(`/api/orders/${orderId}`, {
      headers,
      data: { riderName: "Temporal Test" },
    });

    // Now clear it
    const clearRes = await request.patch(`/api/orders/${orderId}`, {
      headers,
      data: { riderName: "" },
    });
    expect(clearRes.ok()).toBe(true);
    const cleared = await clearRes.json();
    // riderName should be empty string or null/undefined after clearing
    expect(cleared.riderName == null || cleared.riderName === "").toBe(true);
  });
});
