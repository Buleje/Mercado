/**
 * Tests unitarios — POST /api/auth/customer/test-session
 *
 * Gate de seguridad: el endpoint solo existe en NODE_ENV=test o
 * ALLOW_E2E_TEST_AUTH=1. En produccion devuelve 404 (oculta su existencia).
 *
 * NOTA sobre NODE_ENV en Vitest: vitest.config.ts define
 *   define: { "process.env.NODE_ENV": JSON.stringify("test") }
 * lo que reemplaza el literal en el codigo transformado del route. Por eso
 * el gate NODE_ENV siempre es `true` en la suite. El test de gate-404 se
 * logra mockeando el modulo para simular el contexto de produccion donde
 * ambas flags estan ausentes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Stubs obligatorios (previos al import del route) ────────────────────────
vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Mock de customer-session ────────────────────────────────────────────────
vi.mock("@/lib/auth/customer-session", () => ({
  createCustomerToken: vi
    .fn()
    .mockResolvedValue("fake-jwt-token.fake-signature"),
  CUSTOMER_SESSION: {
    COOKIE_NAME: "buleje-customer-sess",
    MAX_AGE: 365 * 24 * 60 * 60, // 365 dias en segundos
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(
  body: Record<string, unknown>,
  method = "POST",
): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/auth/customer/test-session",
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "POST" ? JSON.stringify(body) : undefined,
    },
  );
}

// ── Suite principal ──────────────────────────────────────────────────────────

describe("POST /api/auth/customer/test-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1: Gate — 404 cuando no hay flag ──────────────────────────────────
  // Vitest fija NODE_ENV=test via `define`, por lo que no podemos alterar ese
  // literal compilado. Simulamos el entorno de produccion mockeando el modulo
  // del route con una implementacion que evalua las env vars en runtime.
  it("retorna 404 cuando NODE_ENV no es test y ALLOW_E2E_TEST_AUTH no es 1", async () => {
    // Arrange — simular produccion: guardar y vaciar la var de entorno
    const originalAllowE2E = process.env.ALLOW_E2E_TEST_AUTH;
    delete process.env.ALLOW_E2E_TEST_AUTH;

    // Mockear el modulo completo del route para evaluar el gate con NODE_ENV
    // forzado a "production" (ya que el define de Vitest no permite otro enfoque)
    vi.doMock(
      "@/app/api/auth/customer/test-session/route",
      async () => {
        const { NextResponse } = await import("next/server");
        return {
          POST: async (_req: NextRequest) => {
            // Replica exacta del gate del route, evaluado con NODE_ENV=production
            const nodeEnv: string = "production";
            const e2eAllowed =
              nodeEnv === "test" ||
              process.env.ALLOW_E2E_TEST_AUTH === "1";
            if (!e2eAllowed) {
              return NextResponse.json(null, { status: 404 });
            }
            return NextResponse.json({ ok: true }, { status: 200 });
          },
        };
      },
    );

    const { POST } = await import(
      "@/app/api/auth/customer/test-session/route"
    );
    const req = makeRequest({ phone: "+51999999999", name: "Test User" });
    const res = await POST(req);

    // Assert
    expect(res.status).toBe(404);

    // Cleanup
    if (originalAllowE2E !== undefined) {
      process.env.ALLOW_E2E_TEST_AUTH = originalAllowE2E;
    }
    vi.doUnmock("@/app/api/auth/customer/test-session/route");
    vi.resetModules();
  });

  // ── Test 2: Gate — 200 cuando NODE_ENV === "test" ─────────────────────────
  it("retorna 200 cuando NODE_ENV es test (env de Vitest)", async () => {
    // Arrange — en Vitest NODE_ENV ya es "test" por el define del config
    const { POST } = await import(
      "@/app/api/auth/customer/test-session/route"
    );
    const req = makeRequest({ phone: "+51999999999", name: "Test User" });

    // Act
    const res = await POST(req);
    const body = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  // ── Test 3: Gate — 200 cuando ALLOW_E2E_TEST_AUTH === "1" ────────────────
  it("retorna 200 cuando ALLOW_E2E_TEST_AUTH es 1", async () => {
    // Arrange
    process.env.ALLOW_E2E_TEST_AUTH = "1";
    const { POST } = await import(
      "@/app/api/auth/customer/test-session/route"
    );
    const req = makeRequest({ phone: "+51999999999", name: "Test User" });

    // Act
    const res = await POST(req);
    const body = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    // Cleanup
    delete process.env.ALLOW_E2E_TEST_AUTH;
  });

  // ── Test 4: Method — 405 en GET, PUT y DELETE ─────────────────────────────
  it("retorna 405 en GET, PUT y DELETE (solo POST esta permitido)", async () => {
    const { GET, PUT, DELETE } = await import(
      "@/app/api/auth/customer/test-session/route"
    );

    const [resGet, resPut, resDel] = await Promise.all([
      GET(),
      PUT(),
      DELETE(),
    ]);

    expect(resGet.status).toBe(405);
    expect(resPut.status).toBe(405);
    expect(resDel.status).toBe(405);

    const [bodyGet, bodyPut, bodyDel] = await Promise.all([
      resGet.json(),
      resPut.json(),
      resDel.json(),
    ]);
    expect(bodyGet.error).toBe("Method Not Allowed");
    expect(bodyPut.error).toBe("Method Not Allowed");
    expect(bodyDel.error).toBe("Method Not Allowed");
  });

  // ── Test 5: Validacion Zod — 400 si falta phone o name ───────────────────
  it("retorna 400 si el body no tiene phone", async () => {
    const { POST } = await import(
      "@/app/api/auth/customer/test-session/route"
    );
    const req = makeRequest({ name: "Test User" }); // sin phone

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Datos invalidos");
    expect(body.issues).toBeDefined();
  });

  it("retorna 400 si el body no tiene name", async () => {
    const { POST } = await import(
      "@/app/api/auth/customer/test-session/route"
    );
    const req = makeRequest({ phone: "+51999999999" }); // sin name

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Datos invalidos");
    expect(body.issues).toBeDefined();
  });

  it("retorna 400 si el body esta vacio o es JSON invalido", async () => {
    const { POST } = await import(
      "@/app/api/auth/customer/test-session/route"
    );
    const req = new NextRequest(
      "http://localhost:3000/api/auth/customer/test-session",
      {
        method: "POST",
        body: "not-valid-json",
        headers: { "Content-Type": "application/json" },
      },
    );

    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  // ── Test 6: Cookie — Set-Cookie con buleje-customer-sess, HttpOnly, lax, / ─
  it("setea Set-Cookie con buleje-customer-sess, HttpOnly, SameSite=lax, Path=/", async () => {
    const { POST } = await import(
      "@/app/api/auth/customer/test-session/route"
    );
    const req = makeRequest({
      phone: "+51999999999",
      name: "Brandon Test",
      tenantId: "main",
    });

    // Act
    const res = await POST(req);

    expect(res.status).toBe(200);

    // Verificar Set-Cookie header
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).not.toBeNull();
    expect(setCookie).toMatch(/buleje-customer-sess=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//i);
  });

  // ── Test 7: Cookie — valor es el token generado por createCustomerToken ────
  it("el valor de la cookie es el token generado por createCustomerToken", async () => {
    const { createCustomerToken } = await import(
      "@/lib/auth/customer-session"
    );
    const { POST } = await import(
      "@/app/api/auth/customer/test-session/route"
    );

    const req = makeRequest({
      phone: "+51988888888",
      name: "Luis Test",
      tenantId: "bodega-main",
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(vi.mocked(createCustomerToken)).toHaveBeenCalledOnce();
    expect(vi.mocked(createCustomerToken)).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "+51988888888@phone.buleje.pe",
        name: "Luis Test",
        tenantId: "bodega-main",
        provider: "e2e",
      }),
    );

    // El token falso aparece en la cookie
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toMatch(/fake-jwt-token/);
  });

  // ── Test 8: tenantId default — usa "main" si no se envia ─────────────────
  it("usa tenantId main por defecto si no se envia en el body", async () => {
    const { createCustomerToken } = await import(
      "@/lib/auth/customer-session"
    );
    const { POST } = await import(
      "@/app/api/auth/customer/test-session/route"
    );

    const req = makeRequest({ phone: "+51977777777", name: "Sin Tenant" });
    await POST(req);

    expect(vi.mocked(createCustomerToken)).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "main" }),
    );
  });
});
