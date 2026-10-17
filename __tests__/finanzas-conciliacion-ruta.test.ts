// @vitest-environment node
/**
 * POST /api/finanzas/conciliacion (11-10): sube el extracto, NO escribe nada.
 * Sin sesión 401 · encargado 403 · cuenta de otro negocio 404 (la busca con el
 * tenant de la sesión) · .xls viejo 415 · sin movimientos 422 · y el cruce
 * pide lo del sistema con el período del extracto ± 3 días.
 *
 * `environment: node`: el multipart de `NextRequest` necesita el `FormData` de undici.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  auth: { tenantId: "t1", username: "brandon", role: "admin" } as { tenantId: string; username: string; role: string } | null,
  getCuenta: vi.fn(),
  movimientos: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => (H.auth ? H.auth : NextResponse.json({ error: "unauthorized" }, { status: 401 }))),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/db/treasury.db", () => ({ TreasuryDB: { getCuenta: (...a: unknown[]) => H.getCuenta(...a) } }));
vi.mock("@/lib/db/conciliacion-bancaria.db", () => ({
  ConciliacionBancariaDB: { movimientosDelSistema: (...a: unknown[]) => H.movimientos(...a) },
}));

import { POST } from "@/app/api/finanzas/conciliacion/route";

const CSV = "Fecha;Descripción;Monto;N° de operación\n15/10/2026;YAPE JUAN;25.50;111\n16/10/2026;COMISION;-12.00;\n20/10/2026;PLIN ANA;40.00;";

function subir(campos: Record<string, string>, contenido = CSV, nombre = "extracto.csv") {
  const fd = new FormData();
  fd.append("archivo", new Blob([contenido], { type: "text/csv" }), nombre);
  for (const [k, v] of Object.entries(campos)) fd.append(k, v);
  return new NextRequest("http://localhost/api/finanzas/conciliacion", { method: "POST", body: fd });
}

beforeEach(() => {
  vi.clearAllMocks();
  H.auth = { tenantId: "t1", username: "brandon", role: "admin" };
  H.getCuenta.mockResolvedValue({ id: "c1", tenantId: "t1" });
  H.movimientos.mockResolvedValue({
    pagos: [
      { id: "venta:v1", date: "2026-10-15", amount: 25.5, reference: "111" },
      { id: "venta:v2", date: "2026-10-20", amount: 41 },
      { id: "venta:fuera", date: "2026-10-13", amount: 9 },
      { id: "venta:dentro", date: "2026-10-18", amount: 9 },
    ],
    porFuente: { tesoreria: 0, ventas: 4, caja: 0, pedidos: 0 },
    recortado: false,
  });
});

describe("POST /api/finanzas/conciliacion", () => {
  it("sin sesión → 401 y no lee nada", async () => {
    H.auth = null;
    const res = await POST(subir({}));
    expect(res.status).toBe(401);
    expect(H.movimientos).not.toHaveBeenCalled();
  });

  it("encargado (management tier) → 403: sólo admin o dueño", async () => {
    H.auth = { tenantId: "t1", username: "enc", role: "manager" };
    const res = await POST(subir({}));
    expect(res.status).toBe(403);
    expect(H.movimientos).not.toHaveBeenCalled();
  });

  it("cuenta de otro negocio → 404 (se busca con el tenant de la sesión)", async () => {
    H.getCuenta.mockResolvedValue(null);
    const res = await POST(subir({ cuentaId: "cuenta-de-otro" }));
    expect(res.status).toBe(404);
    expect(H.getCuenta).toHaveBeenCalledWith("t1", "cuenta-de-otro");
    expect(H.movimientos).not.toHaveBeenCalled();
  });

  it(".xls viejo → 415 con qué hacer", async () => {
    const res = await POST(subir({}, CSV, "extracto.xls"));
    expect(res.status).toBe(415);
    expect((await res.json()).error).toMatch(/\.xlsx o CSV/);
  });

  it("más de 4 MB → 413 antes de leerlo (Vercel corta a 4,5 MB con su propio error)", async () => {
    const res = await POST(subir({}, "a".repeat(4 * 1024 * 1024 + 10)));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/4 MB/);
    expect(H.movimientos).not.toHaveBeenCalled();
  });

  it("archivo sin movimientos → 422", async () => {
    const res = await POST(subir({}, "hola;mundo\nnada;aqui"));
    expect(res.status).toBe(422);
  });

  it("cruza con el período ± 3 días y devuelve los 4 grupos con sus totales", async () => {
    const res = await POST(subir({ cuentaId: "c1", conVentas: "1" }));
    expect(res.status).toBe(200);
    expect(H.movimientos).toHaveBeenCalledWith("t1", { desde: "2026-10-12", hasta: "2026-10-23", cuentaId: "c1", conVentas: true });
    const j = await res.json();
    expect(j.periodo).toEqual({ desde: "2026-10-15", hasta: "2026-10-20" });
    expect(j.resumen).toEqual({
      coinciden: { cantidad: 1, monto: 25.5 },
      conDiferencia: { cantidad: 1, monto: -1 },
      soloBanco: { cantidad: 1, monto: -12 },
      // «fuera» (13-10) sólo servía para cruzar: no es «falta en el banco».
      soloSistema: { cantidad: 1, monto: 9 },
    });
    expect(j.grupos.soloSistema.map((x: { id: string }) => x.id)).toEqual(["venta:dentro"]);
  });
});
