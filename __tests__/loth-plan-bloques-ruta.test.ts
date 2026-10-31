/**
 * /api/admin/forestal/plan/bloques — el reparto por bloque de un plan (24-10).
 *
 * La clave de `PlatformSettings` va en memoria; la ruta, la clase de la base y
 * el schema son los de verdad. Lo que se prueba: quién escribe, que el plan sea
 * de este negocio, que un guardado igual no escriba ni audite, y que `[]` borre.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  rol: "admin",
  planes: new Map<string, Set<string>>(),
  kv: new Map<string, unknown>(),
  escrituras: 0,
  auditados: [] as { tenantId: string; detail: string }[],
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: async (_req: unknown, roles: string[]) =>
    roles.includes(H.rol)
      ? { tenantId: "t-blas", role: H.rol, username: "qaadmin" }
      : NextResponse.json({ error: "forbidden" }, { status: 403 }),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/db/forest-plan.db", () => ({
  ForestPlanDB: {
    getPlan: async (tenantId: string, id: string) => (H.planes.get(tenantId)?.has(id) ? { id, tenantId } : null),
  },
}));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    getFresco: async (key: string) => structuredClone(H.kv.get(key) ?? null),
    actualizar: async (key: string, cambio: (actual: unknown) => { valor?: unknown; resultado: unknown }) => {
      const { valor, resultado } = cambio(structuredClone(H.kv.get(key) ?? null));
      if (valor !== undefined) {
        H.escrituras += 1;
        H.kv.set(key, structuredClone(valor));
      }
      return resultado;
    },
  },
}));
vi.mock("@/lib/forestal/loth-audit", () => ({
  auditLoth: (p: { tenantId: string; detail: string }) => H.auditados.push({ tenantId: p.tenantId, detail: p.detail }),
}));

const { GET, PUT } = await import("@/app/api/admin/forestal/plan/bloques/route");

const URL_RUTA = "http://localhost/api/admin/forestal/plan/bloques";
const put = (body: unknown) => PUT(new NextRequest(URL_RUTA, { method: "PUT", body: JSON.stringify(body) }), { params: Promise.resolve({}) });
const get = (planId: string) => GET(new NextRequest(`${URL_RUTA}?planId=${planId}`), { params: Promise.resolve({}) });

const especie = (speciesCommon: string, volumenM3: number, arboles: number | null = null) => ({
  speciesCommon,
  speciesScientific: null,
  cites: false,
  volumenM3,
  arboles,
  superficieHa: null,
  anioInstalacion: null,
  precioVentaSoles: null,
});
const REPARTO = [
  { nombre: "Bloque 1", especies: [especie("Bolaina", 12, 30)] },
  { nombre: "Bloque 2", especies: [especie("Bolaina", 7.5, 18), especie("Capirona", 4)] },
];

beforeEach(() => {
  H.rol = "admin";
  H.planes = new Map([
    ["t-blas", new Set(["plan-propio"])],
    ["t-otro", new Set(["plan-ajeno"])],
  ]);
  H.kv.clear();
  H.escrituras = 0;
  H.auditados.length = 0;
});

describe("PUT plan/bloques", () => {
  it("guarda, se lee igual, y audita una vez", async () => {
    const res = await put({ planId: "plan-propio", bloques: REPARTO });
    expect(res.status).toBe(200);
    expect((await res.json()).cambio).toBe(true);
    const leido = await (await get("plan-propio")).json();
    expect(leido.bloques).toEqual(REPARTO);
    expect(leido.updatedBy).toBe("qaadmin");
    expect(H.auditados).toEqual([expect.objectContaining({ tenantId: "t-blas", detail: expect.stringMatching(/2 bloques · 2 especies/) })]);
  });

  it("un guardado igual al que ya está no escribe ni audita", async () => {
    await put({ planId: "plan-propio", bloques: REPARTO });
    const otra = await put({ planId: "plan-propio", bloques: REPARTO });
    expect((await otra.json()).cambio).toBe(false);
    expect(H.escrituras).toBe(1);
    expect(H.auditados).toHaveLength(1);
  });

  it("`[]` borra el reparto (y lo audita)", async () => {
    await put({ planId: "plan-propio", bloques: REPARTO });
    const res = await put({ planId: "plan-propio", bloques: [] });
    expect((await res.json()).cambio).toBe(true);
    expect((await (await get("plan-propio")).json()).bloques).toEqual([]);
    expect(H.auditados[1]?.detail).toMatch(/Quitó el reparto por bloques \(tenía 2 bloques\)/);
  });

  it("el encargado (almacenero) lo ve pero no lo cambia", async () => {
    await put({ planId: "plan-propio", bloques: REPARTO });
    H.rol = "almacenero";
    expect((await put({ planId: "plan-propio", bloques: [] })).status).toBe(403);
    expect((await get("plan-propio")).status).toBe(200);
    H.rol = "cajero";
    expect((await get("plan-propio")).status).toBe(403);
    expect(H.escrituras).toBe(1);
  });

  it("un plan de otro negocio: 404 y nada escrito", async () => {
    expect((await put({ planId: "plan-ajeno", bloques: REPARTO })).status).toBe(404);
    expect((await get("plan-ajeno")).status).toBe(404);
    expect(H.escrituras).toBe(0);
  });

  it("dos bloques con el mismo nombre: 400 con el motivo en palabras", async () => {
    const res = await put({ planId: "plan-propio", bloques: [REPARTO[0], { ...REPARTO[1], nombre: "bloque 1" }] });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/está dos veces/);
    expect(H.escrituras).toBe(0);
  });

  it("un reparto por plan: guardar el de un plan no toca el de otro", async () => {
    H.planes.get("t-blas")!.add("plan-dos");
    await put({ planId: "plan-propio", bloques: REPARTO });
    await put({ planId: "plan-dos", bloques: [REPARTO[0]] });
    expect((await (await get("plan-propio")).json()).bloques).toHaveLength(2);
    expect((await (await get("plan-dos")).json()).bloques).toHaveLength(1);
  });
});
