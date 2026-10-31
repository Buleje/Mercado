/**
 * Contrato de «Refinanciar préstamo» (11-10): el cuerpo que arma el modal
 * (`cuerpoRefinanciar`, el mismo que usa `handleRefinanciar` en
 * PrestamosModule) tiene que pasar el Zod de la ruta. Antes el modal mandaba
 * `{monto, tasaInteres, numeroCuotas, sistemaAmortizacion}` y la ruta pedía
 * `{nuevaTasa, nuevasCuotas, sistema}`: 400 siempre.
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockGetById = vi.fn();
const mockRefinanciar = vi.fn();
const mockRequireAdmin = vi.fn();

vi.mock("@/lib/db/prestamos.db", () => ({
  PrestamosDB: {
    getById: (...a: unknown[]) => mockGetById(...a),
    refinanciar: (...a: unknown[]) => mockRefinanciar(...a),
  },
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: (...a: unknown[]) => mockRequireAdmin(...a) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: () => Promise.resolve() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { POST } from "@/app/api/prestamos/[id]/refinanciar/route";
import { cuerpoRefinanciar } from "@/lib/prestamos/refinanciar";

const params = Promise.resolve({ id: "p1" });
const pedido = (cuerpo: unknown) =>
  new NextRequest("http://localhost/api/prestamos/p1/refinanciar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({ tenantId: "t1", username: "qa", role: "admin" });
  mockGetById.mockResolvedValue({ id: "p1", tenantId: "t1", status: "ACTIVO", cuotas: [] });
  mockRefinanciar.mockResolvedValue({ id: "p1", tenantId: "t1", status: "ACTIVO", cuotas: [] });
});

describe("Refinanciar — el modal y la ruta hablan el mismo idioma", () => {
  it("el cuerpo que arma el modal → 200 y llega entero a PrestamosDB.refinanciar", async () => {
    const armado = cuerpoRefinanciar({ tasa: "2", cuotas: "3", sistema: "FRANCES" });
    expect(armado).toEqual({ ok: true, cuerpo: { nuevaTasa: 2, nuevasCuotas: 3, sistema: "FRANCES" } });
    if (!armado.ok) return;

    const res = await POST(pedido(armado.cuerpo), { params });

    expect(res.status).toBe(200);
    expect(mockRefinanciar).toHaveBeenCalledWith("t1", "p1", { nuevaTasa: 2, nuevasCuotas: 3, sistema: "FRANCES" });
  });

  it("el cuerpo viejo del modal (monto/tasaInteres/numeroCuotas) sigue siendo 400: no hay alias escondidos", async () => {
    const res = await POST(pedido({ monto: 1000, tasaInteres: 2, numeroCuotas: 3, sistemaAmortizacion: "FRANCES" }), { params });
    expect(res.status).toBe(400);
    expect(mockRefinanciar).not.toHaveBeenCalled();
  });

  it("los errores se dicen en el modal antes de pedir: tasa fuera de 0-100 y cuotas fuera de 1-120 o con decimales", () => {
    expect(cuerpoRefinanciar({ tasa: "", cuotas: "3", sistema: "FRANCES" }).ok).toBe(false);
    expect(cuerpoRefinanciar({ tasa: "-1", cuotas: "3", sistema: "FRANCES" }).ok).toBe(false);
    expect(cuerpoRefinanciar({ tasa: "101", cuotas: "3", sistema: "FRANCES" }).ok).toBe(false);
    expect(cuerpoRefinanciar({ tasa: "2", cuotas: "0", sistema: "FRANCES" }).ok).toBe(false);
    expect(cuerpoRefinanciar({ tasa: "2", cuotas: "121", sistema: "FRANCES" }).ok).toBe(false);
    expect(cuerpoRefinanciar({ tasa: "2", cuotas: "2.5", sistema: "FRANCES" }).ok).toBe(false);
    expect(cuerpoRefinanciar({ tasa: "0", cuotas: "120", sistema: "ALEMAN" })).toEqual({
      ok: true,
      cuerpo: { nuevaTasa: 0, nuevasCuotas: 120, sistema: "ALEMAN" },
    });
  });

  it("préstamo de otro negocio → 404 sin refinanciar (el tenant va en el WHERE de getById)", async () => {
    mockGetById.mockResolvedValue(null);
    const armado = cuerpoRefinanciar({ tasa: "2", cuotas: "3", sistema: "FRANCES" });
    if (!armado.ok) return;
    const res = await POST(pedido(armado.cuerpo), { params });
    expect(res.status).toBe(404);
    expect(mockGetById).toHaveBeenCalledWith("t1", "p1");
    expect(mockRefinanciar).not.toHaveBeenCalled();
  });

  it("sin sesión de gestión no llega a la base", async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await POST(pedido({ nuevasCuotas: 3 }), { params });
    expect(res.status).toBe(403);
    expect(mockGetById).not.toHaveBeenCalled();
  });
});
