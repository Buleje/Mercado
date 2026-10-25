import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { ordenDeLista } from "@/lib/comprobantes/orden";

const listar = vi.fn();
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => ({ tenantId: "t1" })),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/db/comprobantes-seguimiento.db", () => ({ ComprobantesSeguimientoDB: { listar: (...a: unknown[]) => listar(...a) } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { GET } from "@/app/api/admin/comprobantes/lista/route";

const pedir = (qs: string) => GET(new NextRequest(`http://x.test/api/admin/comprobantes/lista?${qs}`));

describe("ordenDeLista", () => {
  it("sin columna = fecha descendente con desempate por id", () => {
    expect(ordenDeLista()).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  });
  it("con columna ordena por ella y desempata por id", () => {
    expect(ordenDeLista("total", "asc")).toEqual([{ total: "asc" }, { id: "asc" }]);
    expect(ordenDeLista("serie", "desc")).toEqual([{ series: "desc" }, { number: "desc" }, { id: "desc" }]);
  });
});

describe("GET /api/admin/comprobantes/lista — orden", () => {
  beforeEach(() => {
    listar.mockReset();
    listar.mockResolvedValue({ data: [], total: 0, resumen: {} });
  });
  it("sin orden pasa undefined (igual que hoy)", async () => {
    const r = await pedir("limite=5");
    expect(r.status).toBe(200);
    const [tenant, f] = listar.mock.calls[0];
    expect(tenant).toBe("t1");
    expect(f.orden).toBeUndefined();
    expect(f.dir).toBeUndefined();
  });
  it("con orden lo pasa a la base", async () => {
    const r = await pedir("orden=cliente&dir=asc");
    expect(r.status).toBe(200);
    expect(listar.mock.calls[0][1]).toMatchObject({ orden: "cliente", dir: "asc" });
  });
  it("columna fuera de la lista blanca = 400 y no consulta", async () => {
    const r = await pedir("orden=password");
    expect(r.status).toBe(400);
    expect((await pedir("orden=total&dir=sideways")).status).toBe(400);
    expect(listar).not.toHaveBeenCalled();
  });
});
