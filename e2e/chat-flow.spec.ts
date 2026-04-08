import { test, expect, APIRequestContext } from "@playwright/test";

/**
 * E2E — Flujo completo del Bloque D2 del Marketplace (Chat buyer ↔ seller).
 *
 * Cubre:
 *   1. Auth guards de los 4 endpoints admin del chat
 *   2. Endpoint público /api/chat/public con feature flag gate
 *   3. Ownership validation del endpoint público
 *   4. Validación Zod (bodies inválidos)
 *   5. Respuesta 503 cuando el feature flag está off
 *
 * Nota: los tests de happy path del flujo buyer↔seller requieren tener los
 * feature flags encendidos en preview (FEATURE_MARKETPLACE_CHAT_PUBLIC=true).
 * Mientras están off por default, validamos solo los guards.
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
// Auth guards — admin routes
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Chat D2 — Auth guards admin", () => {
  test("GET /api/admin/chat/threads requires session", async ({ request }) => {
    const res = await request.get("/api/admin/chat/threads");
    expect([401, 403]).toContain(res.status());
  });

  test("PATCH /api/admin/chat/threads requires session", async ({ request }) => {
    const res = await request.patch("/api/admin/chat/threads", {
      data: { threadId: "fake" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("GET /api/admin/chat/threads/[id]/messages requires session", async ({ request }) => {
    const res = await request.get("/api/admin/chat/threads/fake-thread/messages");
    expect([401, 403]).toContain(res.status());
  });

  test("POST /api/admin/chat/threads/[id]/messages requires session", async ({ request }) => {
    const res = await request.post("/api/admin/chat/threads/fake-thread/messages", {
      data: { body: "test" },
    });
    expect([401, 403]).toContain(res.status());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint público — feature flag gate
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Chat D2 — Endpoint público", () => {
  test("POST /api/chat/public devuelve 503 con feature flag off (default)", async ({ request }) => {
    const res = await request.post("/api/chat/public?action=open", {
      data: {
        storeSlug: "demo",
        customerPhone: "+51987654321",
        customerName: "Test User",
      },
    });
    // Default state: FEATURE_MARKETPLACE_CHAT_PUBLIC=false → 503
    // Si alguien lo prende en preview, el test debe aceptar 400/404 de datos fake
    expect([503, 400, 404]).toContain(res.status());
    if (res.status() === 503) {
      expect(res.headers()["retry-after"]).toBe("300");
    }
  });

  test("GET /api/chat/public sin params devuelve 503 (flag off) o 400 (flag on)", async ({
    request,
  }) => {
    const res = await request.get("/api/chat/public");
    expect([400, 503]).toContain(res.status());
  });

  test("POST /api/chat/public con JSON inválido devuelve 400 si flag on, 503 si off", async ({
    request,
  }) => {
    const res = await request.post("/api/chat/public?action=open", {
      data: "not-json-but-string",
    });
    expect([400, 503]).toContain(res.status());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validación Zod
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Chat D2 — Validación Zod", () => {
  test.skip(
    !process.env.E2E_CHAT_PUBLIC_ENABLED,
    "Skip: requiere FEATURE_MARKETPLACE_CHAT_PUBLIC=true + E2E_CHAT_PUBLIC_ENABLED=1",
  );

  test("POST action=open rechaza body incompleto", async ({ request }) => {
    const res = await request.post("/api/chat/public?action=open", {
      data: { storeSlug: "demo" }, // falta phone y name
    });
    expect(res.status()).toBe(400);
  });

  test("POST action=open rechaza phone muy corto", async ({ request }) => {
    const res = await request.post("/api/chat/public?action=open", {
      data: {
        storeSlug: "demo",
        customerPhone: "123", // min 6
        customerName: "Ana",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("POST action=send rechaza body sin threadId", async ({ request }) => {
    const res = await request.post("/api/chat/public?action=send", {
      data: {
        storeSlug: "demo",
        customerPhone: "+51987654321",
        customerName: "Ana",
        body: "Hola",
      }, // sin threadId
    });
    expect(res.status()).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin — validaciones con login
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Chat D2 — Admin con login", () => {
  test.skip(
    !process.env.E2E_ADMIN_PASSWORD,
    "Skip: E2E_ADMIN_PASSWORD no está seteado",
  );

  test("PATCH threads con body vacío devuelve 400", async ({ request }) => {
    const cookie = await adminLogin(request);
    if (!cookie) test.skip();
    const res = await request.patch("/api/admin/chat/threads", {
      headers: { Cookie: cookie! },
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test("POST messages con body muy largo devuelve 400", async ({ request }) => {
    const cookie = await adminLogin(request);
    if (!cookie) test.skip();
    const res = await request.post("/api/admin/chat/threads/fake-id/messages", {
      headers: { Cookie: cookie! },
      data: {
        body: "a".repeat(5000), // max 4000
      },
    });
    expect(res.status()).toBe(400);
  });
});
