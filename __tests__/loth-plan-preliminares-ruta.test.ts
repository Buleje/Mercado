/**
 * /api/admin/forestal/plan/preliminares — GTF hechas a mano por enviar a SERFOR (25-10).
 *
 * La clave de `PlatformSettings`, el plan, sus bloques y las guías del libro van
 * en memoria; la ruta, la clase de la base, el schema y las reglas puras son los
 * de verdad. Lo que se prueba: Zod con mensaje legible, quién escribe, que el
 * plan sea de este negocio, el N.º repetido (409), anular con motivo y que la
 * guía que ya está en el libro quede registrada sola.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  rol: "admin",
  planes: new Map<string, Set<string>>(),
  especies: [] as { speciesCommon: string }[],
  bloques: null as { bloques: { nombre: string }[] } | null,
  libro: [] as { id: string; gtfNumber: string; planId: string | null; tenantId: string }[],
  kv: new Map<string, unknown>(),
  auditados: [] as { tenantId: string; action: string }[],
}));

vi.mock("@/lib/require-admin", () => ({
  /* Como el de verdad: manager pasa siempre (memoria requireAdmin-deja-pasar-manager-siempre). */
  requireAdmin: async (_req: unknown, roles: string[]) =>
    roles.includes(H.rol) || H.rol === "manager"
      ? { tenantId: "t-blas", role: H.rol, username: "qaadmin" }
      : NextResponse.json({ error: "forbidden" }, { status: 403 }),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/db/forest-plan.db", () => ({
  ForestPlanDB: {
    getPlan: async (tenantId: string, id: string) => (H.planes.get(tenantId)?.has(id) ? { id, tenantId } : null),
    listSpecies: async () => H.especies,
  },
}));
vi.mock("@/lib/db/forest-plan-bloques.db", () => ({ ForestPlanBloquesDB: { leer: async () => H.bloques } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    forestGtf: {
      findMany: async ({ where }: { where: { tenantId: string; OR: { planId: string | null }[] } }) =>
        H.libro.filter((g) => g.tenantId === where.tenantId && where.OR.some((o) => o.planId === g.planId)),
    },
  },
}));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    getFresco: async (key: string) => structuredClone(H.kv.get(key) ?? null),
    actualizar: async (key: string, cambio: (actual: unknown) => { valor?: unknown; resultado: unknown }) => {
      const { valor, resultado } = cambio(structuredClone(H.kv.get(key) ?? null));
      if (valor !== undefined) H.kv.set(key, structuredClone(valor));
      return resultado;
    },
  },
}));
vi.mock("@/lib/forestal/loth-audit", () => ({
  auditLoth: (p: { tenantId: string; action: string }) => H.auditados.push({ tenantId: p.tenantId, action: p.action }),
}));

const { POST, PATCH } = await import("@/app/api/admin/forestal/plan/preliminares/route");

const URL_RUTA = "http://localhost/api/admin/forestal/plan/preliminares";
const ctx = { params: Promise.resolve({}) };
const post = (body: unknown) => POST(new NextRequest(URL_RUTA, { method: "POST", body: JSON.stringify(body) }), ctx);
const patch = (body: unknown) => PATCH(new NextRequest(URL_RUTA, { method: "PATCH", body: JSON.stringify(body) }), ctx);

const GUIA = { planId: "plan-propio", numeroGtf: "001-0000123", numerosLt: ["2"], lineas: [{ especie: "tornillo", trozas: 30, m3: 20, bloque: "Bloque 1" }] };

beforeEach(() => {
  H.rol = "admin";
  H.planes = new Map([
    ["t-blas", new Set(["plan-propio"])],
    ["t-otro", new Set(["plan-ajeno"])],
  ]);
  H.especies = [{ speciesCommon: "Tornillo (Cedrelinga catenaeformis)" }];
  H.bloques = { bloques: [{ nombre: "Bloque 1" }, { nombre: "Bloque 2" }] };
  H.libro = [];
  H.kv = new Map();
  H.auditados = [];
});

describe("POST /plan/preliminares", () => {
  it("anota la guía pendiente con la especie del plan, en la clave del plan y del negocio", async () => {
    const res = await post(GUIA);
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j).toMatchObject({ yaEnElLibro: false, guia: { numeroGtf: "001-0000123", estado: "pendiente", creadaPor: "qaadmin" } });
    expect(j.guia.lineas).toEqual([{ especie: "Tornillo (Cedrelinga catenaeformis)", trozas: 30, m3: 20, bloque: "Bloque 1" }]);
    expect([...H.kv.keys()]).toEqual(["loth-plan-preliminares:t-blas:plan-propio"]);
    expect(H.auditados).toEqual([{ tenantId: "t-blas", action: "loth_plan_preliminar_crear" }]);
  });

  it("Zod: los m³ en cero dan 400 con la fila y un mensaje en español", async () => {
    const res = await post({ ...GUIA, lineas: [GUIA.lineas[0], { especie: "tornillo", trozas: 1, m3: 0, bloque: "Bloque 2" }] });
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.message).toMatch(/^Fila 2: /);
    expect(j.message).not.toMatch(/Too small|expected/i);
  });

  it("con más de un bloque, sin elegirlo es 400", async () => {
    const res = await post({ ...GUIA, lineas: [{ especie: "tornillo", trozas: 1, m3: 1 }] });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("Elige el bloque de Tornillo (Cedrelinga catenaeformis): el plan tiene 2.");
  });

  it.each(["almacenero", "cajero", "encargado"])("%s no anota (403)", async (rol) => {
    H.rol = rol;
    expect((await post(GUIA)).status).toBe(403);
    expect(H.kv.size).toBe(0);
  });

  it("manager pasa requireAdmin pero no escribe (soloAdminODueno)", async () => {
    H.rol = "manager";
    const res = await post(GUIA);
    expect(res.status).toBe(403);
    expect(H.kv.size).toBe(0);
  });

  it("el plan de otro negocio es 404 y no escribe nada", async () => {
    const res = await post({ ...GUIA, planId: "plan-ajeno" });
    expect(res.status).toBe(404);
    expect(H.kv.size).toBe(0);
  });

  it("el mismo N.º escrito distinto («1-123») es 409 con mensaje legible", async () => {
    expect((await post(GUIA)).status).toBe(201);
    const res = await post({ ...GUIA, numeroGtf: "1-123" });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toContain("ya está anotada en este plan");
  });

  it("si el N.º ya está en el libro de este plan, nace registrada y lo dice", async () => {
    H.libro = [
      { id: "gtf-otro-negocio", gtfNumber: "001-0000123", planId: "plan-propio", tenantId: "t-otro" },
      { id: "gtf-1", gtfNumber: "1-123", planId: "plan-propio", tenantId: "t-blas" },
    ];
    const j = await (await post(GUIA)).json();
    expect(j).toMatchObject({ yaEnElLibro: true, guia: { estado: "registrada", gtfId: "gtf-1" } });
    expect(j.message).toContain("quedó como registrada");
  });
});

describe("PATCH /plan/preliminares", () => {
  const crear = async () => (await (await post(GUIA)).json()).guia.id as string;

  it("anular sin motivo es 400; con motivo queda anulada y no se borra", async () => {
    const id = await crear();
    expect((await patch({ planId: "plan-propio", id, accion: "anular" })).status).toBe(400);
    expect((await patch({ planId: "plan-propio", id, accion: "anular", motivo: "x" })).status).toBe(400);
    const res = await patch({ planId: "plan-propio", id, accion: "anular", motivo: "la guía salió con el N.º mal" });
    expect(res.status).toBe(200);
    expect((await res.json()).guia).toMatchObject({ estado: "anulada", motivoAnulacion: "la guía salió con el N.º mal" });
    const guardadas = (H.kv.get("loth-plan-preliminares:t-blas:plan-propio") as { guias: unknown[] }).guias;
    expect(guardadas).toHaveLength(1);
  });

  it("una anulada no vuelve: cambiarla es 409", async () => {
    const id = await crear();
    await patch({ planId: "plan-propio", id, accion: "anular", motivo: "mal hecha" });
    expect((await patch({ planId: "plan-propio", id, accion: "pendiente" })).status).toBe(409);
  });

  it("«Ya la registré» la ata a la guía del libro que busca el servidor", async () => {
    const id = await crear();
    H.libro = [{ id: "gtf-9", gtfNumber: "1-123", planId: null, tenantId: "t-blas" }];
    const j = await (await patch({ planId: "plan-propio", id, accion: "registrada" })).json();
    expect(j.guia).toMatchObject({ estado: "registrada", gtfId: "gtf-9" });
  });

  it("no acepta un gtfId mandado por la pantalla", async () => {
    const id = await crear();
    expect((await patch({ planId: "plan-propio", id, accion: "registrada", gtfId: "gtf-ajena" })).status).toBe(400);
  });

  it("corregir otra guía del plan ajeno es 404; una id que no existe, 404", async () => {
    const id = await crear();
    expect((await patch({ planId: "plan-ajeno", id, accion: "pendiente" })).status).toBe(404);
    expect((await patch({ planId: "plan-propio", id: "no-existe", accion: "pendiente" })).status).toBe(404);
  });

  it("acción desconocida: 400 que dice qué se puede hacer", async () => {
    const res = await patch({ planId: "plan-propio", id: "x", accion: "borrar" });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("corregir, registrada, pendiente o anular");
  });
});
