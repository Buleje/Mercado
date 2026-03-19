import { test, expect, APIRequestContext } from "@playwright/test";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: login via API and return session cookie. Skips if no password set.
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
// CASH REGISTERS / SHIFT CONTROL
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Cash Register API", () => {
  test("GET /api/cash-registers requires auth", async ({ request }) => {
    const res = await request.get("/api/cash-registers");
    expect([401, 403]).toContain(res.status());
  });

  test("POST /api/cash-registers requires auth", async ({ request }) => {
    const res = await request.post("/api/cash-registers", {
      data: { action: "open", openingAmount: 100, notes: "Test cashier" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("full shift cycle: open → list → close", async ({ request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set, skipping authenticated tests");

    const headers = { Cookie: cookie! };

    // 1. Open a shift
    const openRes = await request.post("/api/cash-registers", {
      headers,
      data: { action: "open", openingAmount: 500, notes: "E2E Cajero (Cajero)" },
    });
    expect(openRes.status()).toBe(201);
    const opened = await openRes.json();
    expect(opened).toHaveProperty("id");
    expect(opened.status).toBe("abierta");
    expect(opened.openingAmount).toBe(500);
    const registerId = opened.id as string;

    // 2. List registers and confirm the newly opened one appears
    const listRes = await request.get("/api/cash-registers", { headers });
    expect(listRes.ok()).toBe(true);
    const list = await listRes.json();
    expect(Array.isArray(list)).toBe(true);
    const found = (list as Array<{ id: string }>).find(r => r.id === registerId);
    expect(found).toBeTruthy();

    // 3. Close the shift
    const closeRes = await request.patch(`/api/cash-registers/${registerId}`, {
      headers,
      data: { action: "close", closingAmount: 520, notes: "cierre E2E" },
    });
    expect(closeRes.ok()).toBe(true);
    const closed = await closeRes.json();
    expect(closed.status).toBe("cerrada");
    expect(closed).toHaveProperty("closedAt");
    expect(closed).toHaveProperty("expectedAmount");
    expect(typeof closed.difference).toBe("number");
  });

  test("PATCH /api/cash-registers/[id] requires auth", async ({ request }) => {
    const res = await request.patch("/api/cash-registers/nonexistent-id", {
      data: { action: "close", closingAmount: 0 },
    });
    expect([401, 403]).toContain(res.status());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY MOVEMENTS / WAREHOUSE
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Inventory Movements API", () => {
  test("POST /api/inventory-movements requires auth", async ({ request }) => {
    const res = await request.post("/api/inventory-movements", {
      data: { productId: "any", type: "entrada", quantity: 1 },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("stock adjustment creates a movement record", async ({ request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set, skipping authenticated tests");

    const headers = { Cookie: cookie! };

    // Grab a real product id first
    const dashRes = await request.get("/api/admin/dashboard", { headers });
    expect(dashRes.ok()).toBe(true);
    const dash = await dashRes.json();
    const products = dash?.products as Array<{ id: string }> | undefined;
    test.skip(!products?.length, "No products in DB, skipping inventory test");

    const productId = products![0].id;

    const adjRes = await request.post("/api/inventory-movements", {
      headers,
      data: { action: "adjust", productId, newStock: 99 },
    });
    expect(adjRes.status()).toBe(201);
    const movement = await adjRes.json();
    expect(movement).toHaveProperty("id");
  });

  test("transfer movement creates a movement record", async ({ request }) => {
    const cookie = await adminLogin(request);
    test.skip(!cookie, "E2E_ADMIN_PASSWORD not set, skipping authenticated tests");

    const headers = { Cookie: cookie! };

    const dashRes = await request.get("/api/admin/dashboard", { headers });
    const dash = await dashRes.json();
    const products = dash?.products as Array<{ id: string }> | undefined;
    test.skip(!products?.length, "No products in DB, skipping transfer test");

    const productId = products![0].id;

    const transRes = await request.post("/api/inventory-movements", {
      headers,
      data: { productId, type: "transferencia", quantity: 5, notes: "E2E transfer" },
    });
    expect(transRes.status()).toBe(201);
    const movement = await transRes.json();
    expect(movement).toHaveProperty("id");
  });
});
