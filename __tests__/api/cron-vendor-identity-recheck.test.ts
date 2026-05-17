/**
 * Tests — GET /api/cron/vendor-identity-recheck
 *
 * Cubre:
 *   - Iteración de vendors aprobados
 *   - Detección de cambios HABIDO → NO HABIDO
 *   - Primera consulta detecta vendor no invoiceable de entrada
 *   - DNI degradado
 *   - Error en verifyRuc no bloquea siguientes vendors
 *   - Snapshot persiste para próxima ejecución
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Cache real con Map para testear snapshot persistence entre vendors
const { snapshotStore } = vi.hoisted(() => ({
  snapshotStore: new Map<string, unknown>(),
}));
vi.mock("@/lib/cache", () => ({
  cacheStore: {
    get: vi.fn((key: string) => snapshotStore.get(key) ?? null),
    set: vi.fn((key: string, value: unknown) => {
      snapshotStore.set(key, value);
    }),
    del: vi.fn((key: string) => {
      snapshotStore.delete(key);
    }),
  },
}));

// withCronHealth wrap-through: validamos CRON_SECRET aparte, acá solo testeamos la lógica.
vi.mock("@/lib/cron/with-cron-health", () => ({
  withCronHealth: (_name: string, handler: (req: NextRequest) => Promise<Response>) => handler,
}));

const { mockVerifyRuc, mockVerifyDni, mockIsInvoiceable } = vi.hoisted(() => ({
  mockVerifyRuc: vi.fn(),
  mockVerifyDni: vi.fn(),
  mockIsInvoiceable: vi.fn(),
}));

vi.mock("@/lib/integrations/sunat-ruc", () => ({
  verifyRuc: mockVerifyRuc,
  isInvoiceable: mockIsInvoiceable,
}));

vi.mock("@/lib/integrations/reniec", () => ({
  verifyDni: mockVerifyDni,
}));

const { mockFindMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    vendorApplication: { findMany: mockFindMany },
  },
}));

import { GET } from "@/app/api/cron/vendor-identity-recheck/route";

function makeReq(): NextRequest {
  return new NextRequest("https://example.com/api/cron/vendor-identity-recheck", {
    headers: { authorization: "Bearer test" },
  });
}

describe("GET /api/cron/vendor-identity-recheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshotStore.clear();
  });

  it("0 vendors → response con total=0, no alerts", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.total).toBe(0);
    expect(body.checked).toBe(0);
    expect(body.changed).toBe(0);
    expect(body.alerts).toEqual([]);
  });

  it("primera consulta detecta vendor con RUC NO HABIDO", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "v1",
        ruc: "20123456789",
        contactDni: "12345678",
        contactName: "Juan",
        businessName: "Mala Bodega",
        tenantId: "t-1",
        tenantSlug: "mala-bodega",
      },
    ]);
    mockVerifyRuc.mockResolvedValueOnce({
      ok: true,
      source: "apisperu",
      estado: "ACTIVO",
      condicion: "NO HABIDO",
    });
    mockIsInvoiceable.mockReturnValueOnce(false);
    mockVerifyDni.mockResolvedValueOnce({ ok: true, source: "apisperu" });

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.checked).toBe(1);
    expect(body.changed).toBe(1);
    expect(body.alerts).toHaveLength(1);
    expect(body.alerts[0].kind).toBe("ruc-changed");
  });

  it("primera consulta detecta RUC no_found → kind=ruc-not-found", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "v2",
        ruc: "20999999999",
        contactDni: "12345678",
        contactName: "X",
        businessName: "Fantasma SAC",
        tenantId: "t-2",
        tenantSlug: "fantasma",
      },
    ]);
    mockVerifyRuc.mockResolvedValueOnce({
      ok: false,
      source: "apisperu",
      reason: "not_found",
    });
    mockIsInvoiceable.mockReturnValueOnce(false);
    mockVerifyDni.mockResolvedValueOnce({ ok: false, source: "apisperu" });

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.alerts).toHaveLength(1);
    expect(body.alerts[0].kind).toBe("ruc-not-found");
  });

  it("segunda corrida: HABIDO en run 1, NO HABIDO en run 2 → alert ruc-changed", async () => {
    // RUN 1: HABIDO
    mockFindMany.mockResolvedValueOnce([
      {
        id: "v3",
        ruc: "20111111111",
        contactDni: "11111111",
        contactName: "X",
        businessName: "Bodega Sana",
        tenantId: "t-3",
        tenantSlug: "sana",
      },
    ]);
    mockVerifyRuc.mockResolvedValueOnce({
      ok: true,
      source: "apisperu",
      estado: "ACTIVO",
      condicion: "HABIDO",
    });
    mockIsInvoiceable.mockReturnValueOnce(true);
    mockVerifyDni.mockResolvedValueOnce({ ok: true, source: "apisperu" });

    const r1 = await GET(makeReq());
    const body1 = await r1.json();
    expect(body1.changed).toBe(0);
    expect(body1.alerts).toEqual([]);

    // RUN 2: NO HABIDO (snapshot anterior existe)
    mockFindMany.mockResolvedValueOnce([
      {
        id: "v3",
        ruc: "20111111111",
        contactDni: "11111111",
        contactName: "X",
        businessName: "Bodega Sana",
        tenantId: "t-3",
        tenantSlug: "sana",
      },
    ]);
    mockVerifyRuc.mockResolvedValueOnce({
      ok: true,
      source: "apisperu",
      estado: "ACTIVO",
      condicion: "NO HABIDO",
    });
    mockIsInvoiceable.mockReturnValueOnce(false);
    mockVerifyDni.mockResolvedValueOnce({ ok: true, source: "apisperu" });

    const r2 = await GET(makeReq());
    const body2 = await r2.json();
    expect(body2.changed).toBe(1);
    expect(body2.alerts[0].kind).toBe("ruc-changed");
  });

  it("DNI desaparecido en RENIEC → alert kind=dni-not-found", async () => {
    // RUN 1: DNI ok
    mockFindMany.mockResolvedValueOnce([
      {
        id: "v4",
        ruc: "20222222222",
        contactDni: "22222222",
        contactName: "X",
        businessName: "Bodega DNI",
        tenantId: "t-4",
        tenantSlug: "dni",
      },
    ]);
    mockVerifyRuc.mockResolvedValueOnce({
      ok: true,
      source: "apisperu",
      estado: "ACTIVO",
      condicion: "HABIDO",
    });
    mockIsInvoiceable.mockReturnValueOnce(true);
    mockVerifyDni.mockResolvedValueOnce({ ok: true, source: "apisperu" });

    await GET(makeReq());

    // RUN 2: DNI ya no existe
    mockFindMany.mockResolvedValueOnce([
      {
        id: "v4",
        ruc: "20222222222",
        contactDni: "22222222",
        contactName: "X",
        businessName: "Bodega DNI",
        tenantId: "t-4",
        tenantSlug: "dni",
      },
    ]);
    mockVerifyRuc.mockResolvedValueOnce({
      ok: true,
      source: "apisperu",
      estado: "ACTIVO",
      condicion: "HABIDO",
    });
    mockIsInvoiceable.mockReturnValueOnce(true);
    mockVerifyDni.mockResolvedValueOnce({ ok: false, source: "apisperu" });

    const r2 = await GET(makeReq());
    const body2 = await r2.json();
    expect(body2.alerts[0].kind).toBe("dni-not-found");
  });

  it("error en verifyRuc → contabiliza errors, no bloquea siguientes", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "v-err",
        ruc: "20333333333",
        contactDni: null,
        contactName: "X",
        businessName: "Err Vendor",
        tenantId: "t-err",
        tenantSlug: "err",
      },
      {
        id: "v-ok",
        ruc: "20444444444",
        contactDni: null,
        contactName: "Y",
        businessName: "OK Vendor",
        tenantId: "t-ok",
        tenantSlug: "ok",
      },
    ]);
    mockVerifyRuc
      .mockRejectedValueOnce(new Error("apisperu down"))
      .mockResolvedValueOnce({
        ok: true,
        source: "apisperu",
        estado: "ACTIVO",
        condicion: "HABIDO",
      });
    mockIsInvoiceable.mockReturnValueOnce(true);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.errors).toBe(1);
    expect(body.checked).toBe(2); // ambos counted, uno via error path
  });
});
