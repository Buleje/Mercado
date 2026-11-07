// @vitest-environment node
/**
 * «Desatar» una guía de su permiso (25-10, revisión del freno de saldo, M3):
 * la vuelta atrás de «Asignar permiso». La guía, sus despachos y los trozados
 * SIN árbol de sus trozas vuelven a sin plan en una tx, bajo el orden de locks
 * del despacho (libro → especies), con la condición en el WHERE; dice qué plan
 * queda pasado (lo sin plan cuenta en el saldo de cada vigente, ADR-459). No
 * desata: la troza de la tala del plan, un mes cerrado, una guía de otro
 * negocio (404).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;
const H = vi.hoisted(() => ({
  libro: [] as Fila[],
  guias: [] as Fila[],
  planes: [] as Fila[],
  especies: {} as Record<string, { id: string; speciesCommon: string; speciesScientific: string | null; autorizado: number }[]>,
  cierres: [] as unknown[],
  orden: [] as string[],
  updates: [] as { modelo: string; where: Fila; data: Fila }[],
  audits: [] as Fila[],
}));

function cumple(fila: Fila, where: Fila): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === "OR") return (v as Fila[]).some((w) => cumple(fila, w));
    const val = fila[k] ?? null;
    if (v === null) return val === null;
    if (typeof v === "object" && !(v instanceof Date)) {
      const o = v as { in?: unknown[]; not?: unknown };
      if (o.in) return o.in.includes(val);
      if ("not" in o) return val !== null && val !== o.not;
      return true;
    }
    return val === v;
  });
}

vi.mock("@/lib/prisma", () => {
  const actualizar = (modelo: string, filas: () => Fila[]) => async (q: { where: Fila; data: Fila }) => {
    H.updates.push({ modelo, ...q });
    const tocadas = filas().filter((f) => cumple(f, q.where));
    for (const f of tocadas) Object.assign(f, q.data);
    return { count: tocadas.length };
  };
  const db = {
    forestGtf: {
      /* Copias: lo leído no cambia si la fila cambia después (como la base). */
      findFirst: async ({ where }: { where: Fila }) => {
        const g = H.guias.find((x) => cumple(x, where));
        return g ? { ...g } : null;
      },
      findMany: async ({ where }: { where: Fila }) => H.guias.filter((g) => cumple(g, where)).map((g) => ({ ...g })),
      updateMany: actualizar("gtf", () => H.guias),
    },
    forestPlan: {
      findFirst: async ({ where }: { where: Fila }) => H.planes.find((p) => cumple(p, where)) ?? null,
      findMany: async ({ where }: { where: Fila }) => H.planes.filter((p) => cumple(p, where)),
    },
    forestLothEntry: {
      findMany: async ({ where }: { where: Fila }) => H.libro.filter((f) => cumple(f, where)),
      updateMany: actualizar("libro", () => H.libro),
      /* El `groupBy` de `medidasT6` (el real): por especie, con su filtro. */
      groupBy: async ({ where }: { where: Fila }) => {
        const grupos = new Map<string, { speciesCommon: unknown; speciesScientific: unknown; _sum: { volumeM3: number; quantity: number } }>();
        for (const f of H.libro.filter((x) => cumple(x, where))) {
          const k = `${f.speciesCommon}\u0000${f.speciesScientific}`;
          const g = grupos.get(k) ?? { speciesCommon: f.speciesCommon, speciesScientific: f.speciesScientific ?? null, _sum: { volumeM3: 0, quantity: 0 } };
          g._sum.volumeM3 += Number(f.volumeM3 ?? 0);
          g._sum.quantity += Number(f.quantity ?? 0);
          grupos.set(k, g);
        }
        return [...grupos.values()];
      },
    },
    forestPlanSpecies: {
      /* Lo autorizado de `medidasT6`: marca qué plan se midió (el orden de los locks). */
      aggregate: async ({ where }: { where: { id: { in: string[] } } }) => {
        const filas = Object.entries(H.especies).flatMap(([plan, xs]) => xs.filter((e) => where.id.in.includes(e.id)).map((e) => ({ plan, ...e })));
        H.orden.push(`medir:${filas[0]?.plan}`);
        return { _sum: { volumenAutorizadoM3: filas.length === 0 ? null : filas.reduce((a, e) => a + e.autorizado, 0) } };
      },
    },
    $queryRaw: async (sql: TemplateStringsArray) => {
      H.orden.push(sql.join("?").includes('"ForestLothEntry"') ? "lock-libro" : "lock-especies");
      return [];
    },
  };
  return { prisma: { ...db, $transaction: async (fn: (tx: typeof db) => unknown) => fn(db) } };
});
vi.mock("@/lib/db/forest-loth.db", async (real) => {
  const r = await real<typeof import("@/lib/db/forest-loth.db")>();
  return {
    ...r,
    ForestLothDB: {
      lineasDeLaGuia: async (_t: string, gtf: { gtfNumber: string }) =>
        H.libro.filter((f) => f.section === "despacho_troza" && f.gtfNumber === gtf.gtfNumber && f.deletedAt === null).map((f) => ({ id: f.id, entryDate: f.entryDate })),
      especiesT6DelPlan: async (_db: unknown, _t: string, planId: string) => (H.especies[planId] ?? []).map(({ id, speciesCommon, speciesScientific }) => ({ id, speciesCommon, speciesScientific })),
      /* El REAL, contra el prisma de arriba: el filtro de alcance es el de la base (un mock propio escondía que el Trozado de un plan dado de baja no contaba). */
      medidasT6: r.ForestLothDB.medidasT6,
    },
  };
});
vi.mock("@/lib/db/forest-loth-cierre.db", () => ({ ForestLothCierreDB: { list: async () => H.cierres } }));
vi.mock("@/lib/forestal/loth-audit", () => ({ auditLoth: (a: Fila) => H.audits.push(a) }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { ForestLothGuiaDesatarDB } from "@/lib/db/forest-loth-guia-desatar.db";
import { lothErrorResponse } from "@/lib/forestal/loth-api-errors";

const OCT = new Date("2026-10-15T00:00:00.000Z");
const vivo = { tenantId: "t1", status: "registrado", deletedAt: null, entryDate: OCT };
const despacho = (id: string, trozaCode: string, planId: string | null): Fila => ({ ...vivo, id, section: "despacho_troza", gtfNumber: "025-001-0000009", trozaCode, planId });
const trozado = (id: string, trozaCode: string, planId: string | null, treeCode: string | null = null): Fila => ({
  ...vivo, id, section: "trozado", trozaCode, planId, treeCode, speciesCommon: "Tornillo", speciesScientific: null, volumeM3: 2,
});
const guia = (over: Fila = {}): Fila => ({
  id: "g1", tenantId: "t1", deletedAt: null, gtfNumber: "025-001-0000009", items: [{ code: "1-0001" }, { code: "1-0002" }],
  planId: "plan-P", titularName: null, status: "emitida", tipo: "trozas", tituloHabilitante: "PO-2026-001", parcelaCorta: null, ...over,
});

beforeEach(() => {
  H.guias = [guia()];
  H.planes = [
    { id: "plan-P", tenantId: "t1", deletedAt: null, estado: "vigente", planNumber: "PO-2026-001", tituloHabilitante: "PO-2026-001" },
    { id: "plan-Q", tenantId: "t1", deletedAt: null, estado: "vigente", planNumber: "PO-9", tituloHabilitante: null },
  ];
  H.especies = {
    "plan-P": [{ id: "sp-p", speciesCommon: "Tornillo", speciesScientific: null, autorizado: 100 }],
    "plan-Q": [{ id: "sp-q", speciesCommon: "Tornillo", speciesScientific: null, autorizado: 100 }],
  };
  H.libro = [despacho("d1", "1-0001", "plan-P"), despacho("d2", "1-0002", "plan-P"), trozado("z1", "1-0001", "plan-P"), trozado("z2", "1-0002", "plan-P")];
  H.cierres = [];
  H.orden = [];
  H.updates = [];
  H.audits = [];
});

describe("ForestLothGuiaDesatarDB.desatar", () => {
  it("la guía, sus despachos y sus trozados sin árbol vuelven a sin plan, con el plan en el WHERE", async () => {
    const r = await ForestLothGuiaDesatarDB.desatar("t1", "g1", "qa");
    expect(r).toMatchObject({ gtfId: "g1", planId: "plan-P", guias: 1, despachos: 2, trozados: 2, avisos: [] });
    expect(H.guias[0].planId).toBeNull();
    expect(H.libro.every((f) => f.planId === null)).toBe(true);
    for (const u of H.updates) expect(u.where).toMatchObject({ tenantId: "t1", planId: "plan-P" });
    expect(H.updates.find((u) => u.modelo === "gtf")?.where).toMatchObject({ status: { not: "anulada" } });
    expect(H.audits[0]).toMatchObject({ action: "loth_linea_desatar_plan", entityId: "g1", user: "qa" });
    expect(String(H.audits[0].detail)).toContain("GTF 025-001-0000009");
  });

  it("bloquea el libro ANTES que las especies de los otros vigentes (el orden del despacho) y mide después de escribir", async () => {
    await ForestLothGuiaDesatarDB.desatar("t1", "g1", "qa");
    expect(H.orden).toEqual(["lock-libro", "lock-especies", "medir:plan-Q"]);
  });

  it("dice qué plan queda pasado: lo desatado entra en el saldo de los otros vigentes", async () => {
    H.especies["plan-Q"] = [{ id: "sp-q", speciesCommon: "Tornillo", speciesScientific: null, autorizado: 3 }];
    const r = await ForestLothGuiaDesatarDB.desatar("t1", "g1", "qa");
    // 2 trozas × 2 m³ = 4 m³ ahora sin plan, contra 3 autorizados en PO-9.
    expect(r?.avisos).toEqual(["Con esto el plan PO-9 queda pasado por 1.000 m³ de Tornillo: lo sin plan cuenta en su saldo hasta que lo ates."]);
    expect(String(H.audits[0].detail)).toContain("PO-9 queda pasado por 1.000 m³");
  });

  it("un vigente sin la especie no se bloquea ni se mide", async () => {
    H.especies["plan-Q"] = [{ id: "sp-q", speciesCommon: "Capirona", speciesScientific: null, autorizado: 1 }];
    const r = await ForestLothGuiaDesatarDB.desatar("t1", "g1", "qa");
    expect(r?.avisos).toEqual([]);
    expect(H.orden).toEqual(["lock-libro"]);
  });

  it("una troza de la TALA del plan no se desata: 422 y no escribe nada", async () => {
    H.libro = [despacho("d1", "1-0001", "plan-P"), trozado("z1", "1-0001", "plan-P", "A-12")];
    const err = await ForestLothGuiaDesatarDB.desatar("t1", "g1", "qa").catch((e: unknown) => e);
    const res = lothErrorResponse(err, "test", "t1");
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("GUIA_PERMISO_NO_APLICA");
    expect(body.message).toContain("La troza 1-0001 viene de la tala de este plan");
    expect(H.updates).toEqual([]);
    expect(H.guias[0].planId).toBe("plan-P");
  });

  it("una línea en un mes cerrado → 422 PERIODO_CERRADO, sin tocar el acta", async () => {
    H.cierres = [{ periodKey: "2026-10", from: "2026-10-01T00:00:00.000Z", to: "2026-10-31T23:59:59.999Z", label: "octubre de 2026", closedAt: "", closedBy: "qa", totales: { lineasCount: 0, taladoM3: 0, trozadoM3: 0 } }];
    const err = await ForestLothGuiaDesatarDB.desatar("t1", "g1", "qa").catch((e: unknown) => e);
    const body = await lothErrorResponse(err, "test", "t1").json();
    expect(body.error).toBe("PERIODO_CERRADO");
    expect(body.message).toContain("octubre de 2026");
    expect(H.updates).toEqual([]);
  });

  it("una guía sin permiso o anulada no tiene nada que desatar (422)", async () => {
    H.guias = [guia({ planId: null })];
    const sin = await lothErrorResponse(await ForestLothGuiaDesatarDB.desatar("t1", "g1", "qa").catch((e: unknown) => e), "t", "t1").json();
    expect(sin.message).toContain("no tiene permiso");
    H.guias = [guia({ status: "anulada" })];
    const anulada = await lothErrorResponse(await ForestLothGuiaDesatarDB.desatar("t1", "g1", "qa").catch((e: unknown) => e), "t", "t1").json();
    expect(anulada.message).toContain("anulada");
    expect(H.updates).toEqual([]);
  });

  it("una guía de OTRO negocio no se encuentra (null → 404) y no escribe nada", async () => {
    expect(await ForestLothGuiaDesatarDB.desatar("t-otro", "g1", "qa")).toBeNull();
    expect(H.updates).toEqual([]);
    expect(H.audits).toEqual([]);
  });

  it("si otra persona la desató mientras tanto, 422 «cambió» (la condición está en el WHERE)", async () => {
    // Entre la lectura y la tx, la guía pierde su permiso.
    const r = ForestLothGuiaDesatarDB.desatar("t1", "g1", "qa");
    H.guias[0].planId = null;
    const body = await lothErrorResponse(await r.catch((e: unknown) => e), "t", "t1").json();
    expect(body.message).toContain("cambió mientras tanto");
  });
});

describe("ForestLothGuiaDesatarDB.bajaDelPlan", () => {
  it("desata las guías del plan y da de baja en la MISMA tx; las de mes cerrado se quedan", async () => {
    H.guias = [guia(), guia({ id: "g2", gtfNumber: "025-001-0000010", items: [{ code: "1-0003" }] })];
    H.libro.push({ ...despacho("d3", "1-0003", "plan-P"), gtfNumber: "025-001-0000010", entryDate: new Date("2026-09-10T00:00:00.000Z") });
    H.cierres = [{ periodKey: "2026-09", from: "2026-09-01T00:00:00.000Z", to: "2026-09-30T23:59:59.999Z", label: "setiembre de 2026", closedAt: "", closedBy: "qa", totales: { lineasCount: 0, taladoM3: 0, trozadoM3: 0 } }];
    const r = await ForestLothGuiaDesatarDB.bajaDelPlan("t1", "plan-P", async () => {
      H.orden.push("baja");
      return "ok";
    });
    expect(r.resultado).toBe("ok");
    expect(r.desatado).toMatchObject({ guias: 1, despachos: 2, trozados: 2 });
    expect(r.enMesCerrado).toEqual(["025-001-0000010"]);
    expect(H.guias.find((g) => g.id === "g2")?.planId).toBe("plan-P");
    expect(H.orden.at(-1)).toBe("baja");
  });

  it("en la baja, las trozas de la tala del plan no frenan: su despacho vuelve a sin plan y la tala se queda en su plan", async () => {
    H.libro = [despacho("d1", "1-0001", "plan-P"), trozado("z1", "1-0001", "plan-P", "A-12")];
    const r = await ForestLothGuiaDesatarDB.bajaDelPlan("t1", "plan-P", async () => "ok");
    expect(r.desatado).toMatchObject({ guias: 1, despachos: 1, trozados: 0 });
    expect(H.libro.find((f) => f.id === "d1")?.planId).toBeNull();
    expect(H.libro.find((f) => f.id === "z1")?.planId).toBe("plan-P"); // la tala sigue en su plan
  });

  it("dar de baja un plan con tala: lo despachado cuenta en el otro vigente de la especie (el despacho decide, no el plan del trozado)", async () => {
    // Blas 096: 22 trozados con árbol, 20,303 m³. Antes de 25-10 esos m³ no contaban en ningún saldo.
    H.libro = [despacho("d1", "1-0001", "plan-P"), despacho("d2", "1-0002", "plan-P"), trozado("z1", "1-0001", "plan-P", "A-12"), trozado("z2", "1-0002", "plan-P", "A-13")];
    H.especies["plan-Q"] = [{ id: "sp-q", speciesCommon: "Tornillo", speciesScientific: null, autorizado: 3 }];
    const r = await ForestLothGuiaDesatarDB.bajaDelPlan("t1", "plan-P", async () => "ok");
    expect(r.desatado).toMatchObject({ despachos: 2, trozados: 0 });
    // 2 trozas × 2 m³ sin plan contra 3 autorizados en PO-9: entran en su saldo.
    expect(r.desatado?.avisos).toEqual(["Con esto el plan PO-9 queda pasado por 1.000 m³ de Tornillo: lo sin plan cuenta en su saldo hasta que lo ates."]);
    const { ForestLothDB } = await import("@/lib/db/forest-loth.db");
    const { prisma } = await import("@/lib/prisma");
    const delQ = [{ id: "sp-q", speciesCommon: "Tornillo", speciesScientific: null }];
    const medida = (await ForestLothDB.medidasT6(prisma as never, "t1", "plan-Q", delQ, ["tornillo"])).get("tornillo");
    expect(medida).toEqual({ autorizado: 3, movilizado: 4 });
  });

  it("medidasT6 no toma el Trozado de otra tienda aunque el código coincida", async () => {
    H.libro = [despacho("d1", "1-0001", null), { ...trozado("z1", "1-0001", "plan-P", "A-12"), tenantId: "t-otro" }];
    const { ForestLothDB } = await import("@/lib/db/forest-loth.db");
    const { prisma } = await import("@/lib/prisma");
    const delQ = [{ id: "sp-q", speciesCommon: "Tornillo", speciesScientific: null }];
    expect((await ForestLothDB.medidasT6(prisma as never, "t1", "plan-Q", delQ, ["tornillo"])).get("tornillo")).toEqual({ autorizado: 100, movilizado: 0 });
  });
});
