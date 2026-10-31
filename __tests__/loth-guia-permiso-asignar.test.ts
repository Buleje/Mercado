// @vitest-environment node
/**
 * «Asignar permiso» no crea cruces (15-10, revisión): si una troza de la guía
 * ya es de OTRO permiso —su Trozado o su línea de despacho—, 422
 * `TROZA_DE_OTRO_PERMISO` y no se escribe nada. Las filas del libro se
 * bloquean ANTES de medir (el orden del despacho: libro → especies).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;
const H = vi.hoisted(() => ({
  libro: [] as Fila[],
  planes: [] as Fila[],
  orden: [] as string[],
  updates: [] as { where: Fila; data: Fila }[],
  gtfUpdates: 0,
}));

function cumple(fila: Fila, where: Fila): boolean {
  return Object.entries(where).every(([k, v]) => {
    const val = fila[k] ?? null;
    if (v === null) return val === null;
    if (typeof v === "object" && !(v instanceof Date)) {
      const o = v as { in?: unknown[] };
      return o.in ? o.in.includes(val) : true;
    }
    return val === v;
  });
}

vi.mock("@/lib/prisma", () => {
  const db = {
    forestGtf: {
      findFirst: async () => ({ id: "g1", gtfNumber: "025-001-0000009", items: [{ code: "1-0001" }, { code: "1-0002" }], planId: null, titularName: null, status: "emitida", tipo: "trozas", tituloHabilitante: null, parcelaCorta: null }),
      updateMany: async () => { H.gtfUpdates += 1; return { count: 1 }; },
    },
    forestPlan: {
      findFirst: async ({ where }: { where: Fila }) => H.planes.find((p) => p.id === where.id) ?? null,
      findMany: async ({ where }: { where: Fila }) => H.planes.filter((p) => cumple(p, { id: where.id })),
    },
    forestLothEntry: {
      findMany: async ({ where }: { where: Fila }) => H.libro.filter((f) => cumple(f, where)),
      updateMany: async (q: { where: Fila; data: Fila }) => {
        H.updates.push(q);
        const filas = H.libro.filter((f) => cumple(f, q.where));
        for (const f of filas) Object.assign(f, q.data);
        return { count: filas.length };
      },
    },
    $queryRaw: async (sql: TemplateStringsArray) => { H.orden.push(sql.join("?").includes('"ForestLothEntry"') ? "lock-libro" : "lock-especies"); return []; },
  };
  return { prisma: { ...db, $transaction: async (fn: (tx: typeof db) => unknown) => fn(db) } };
});
vi.mock("@/lib/db/forest-loth.db", async (real) => {
  const r = await real<typeof import("@/lib/db/forest-loth.db")>();
  return {
    ...r,
    ForestLothDB: {
      lineasDeLaGuia: async () => H.libro.filter((f) => f.section === "despacho_troza").map((f) => ({ id: f.id, entryDate: new Date("2026-10-15") })),
      especiesT6DelPlan: async () => {
        H.orden.push("medir");
        return [{ id: "sp-t", speciesCommon: "Tornillo", speciesScientific: "Cedrelinga cateniformis" }];
      },
      medidaT6: async () => ({ autorizado: 320, movilizado: 2 }),
    },
  };
});
vi.mock("@/lib/db/forest-loth-cierre.db", () => ({ ForestLothCierreDB: { list: async () => [] } }));
vi.mock("@/lib/forestal/loth-audit", () => ({ auditLoth: vi.fn() }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { ForestLothGuiaPermisoDB } from "@/lib/db/forest-loth-guia-permiso.db";
import { lothErrorResponse } from "@/lib/forestal/loth-api-errors";

const vivo = { tenantId: "t1", status: "registrado", deletedAt: null };
const despacho = (id: string, trozaCode: string, planId: string | null): Fila => ({ ...vivo, id, section: "despacho_troza", trozaCode, planId, entryDate: new Date("2026-10-15") });
const trozado = (id: string, trozaCode: string, planId: string | null): Fila => ({ ...vivo, id, section: "trozado", trozaCode, planId, treeCode: null, speciesCommon: "Tornillo", speciesScientific: null, volumeM3: 1, entryDate: new Date("2026-10-15") });

beforeEach(() => {
  H.planes = [
    { id: "plan-P", planNumber: "PO-2026-001", planType: "PO", tituloHabilitante: "PO-2026-001", parcelaCorta: null },
    { id: "plan-Q", planNumber: "PO-OTRO-9", planType: "PO", tituloHabilitante: null, parcelaCorta: null },
  ];
  H.orden = [];
  H.updates = [];
  H.gtfUpdates = 0;
});

describe("ForestLothGuiaPermisoDB.asignar · sin cruce de permisos", () => {
  it("Trozado de otro permiso → 422 TROZA_DE_OTRO_PERMISO, por troza, y no escribe nada", async () => {
    H.libro = [despacho("d1", "1-0001", null), despacho("d2", "1-0002", null), trozado("z1", "1-0001", "plan-Q"), trozado("z2", "1-0002", null)];
    const err = await ForestLothGuiaPermisoDB.asignar("t1", "g1", "plan-P", "qa").catch((e: unknown) => e);
    const res = lothErrorResponse(err, "test", "t1");
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("TROZA_DE_OTRO_PERMISO");
    expect(body.message).toContain("1-0001 (PO-OTRO-9)");
    expect(H.updates).toEqual([]);
    expect(H.gtfUpdates).toBe(0);
    expect(H.libro.find((f) => f.id === "d1")?.planId).toBeNull();
  });

  it("línea de despacho de otro permiso (Trozado sin permiso) también cruza", async () => {
    H.libro = [despacho("d1", "1-0001", "plan-Q"), trozado("z1", "1-0001", null)];
    const s = await ForestLothGuiaPermisoDB.saldo("t1", "g1", "plan-P");
    expect(s?.deOtroPermiso.porTroza).toEqual([{ codigo: "1-0001", permiso: "PO-OTRO-9" }]);
    expect(s?.bloqueo?.codigo).toBe("TROZA_DE_OTRO_PERMISO");
  });

  it("sin cruce: bloquea el libro ANTES de medir y pone el permiso sólo en líneas vivas sin permiso", async () => {
    H.libro = [despacho("d1", "1-0001", null), despacho("d2", "1-0002", null), trozado("z1", "1-0001", "plan-P"), trozado("z2", "1-0002", null)];
    const r = await ForestLothGuiaPermisoDB.asignar("t1", "g1", "plan-P", "qa");
    expect(r).toMatchObject({ planId: "plan-P", despachos: 2, trozados: 1 });
    expect(H.orden.slice(0, 2)).toEqual(["lock-libro", "medir"]);
    expect(H.updates[0].where).toMatchObject({ planId: null, status: "registrado", deletedAt: null });
    expect(H.libro.filter((f) => f.planId === "plan-P").map((f) => f.id).sort()).toEqual(["d1", "d2", "z1", "z2"]);
  });
});
