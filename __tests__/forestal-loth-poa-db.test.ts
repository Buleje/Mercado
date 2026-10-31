/**
 * ForestLothPoaDB (ADR-455) — el ÚNICO lugar donde se decide el % de
 * semilleros de un plan: lo guardado en Parámetros manda; si no hay nada, el
 * defecto del plan (plantación 0 %, bosque 10 %). La vista POA, el censo de
 * tala, el mapa, el planificador y la Extracción leen de acá.
 *
 * Multi-tenant: el plan se busca con el `tenantId` en el WHERE; un plan de
 * otro negocio no se ve y cae al defecto de bosque (sin filtrar su tipo).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  store: null as null | Record<string, unknown>,
  planes: [] as { tenantId: string; id: string; planType: string; planNumber: string | null; tituloHabilitante: string | null }[],
  findFirst: vi.fn(),
  set: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { forestPlan: { findFirst: (a: unknown) => H.findFirst(a) } } }));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    get: async () => H.store,
    set: async (...a: unknown[]) => H.set(...a),
  },
}));
vi.mock("@/lib/forestal/loth-audit", () => ({ auditLoth: (a: unknown) => H.audit(a) }));

import { ForestLothPoaDB } from "@/lib/db/forest-loth-poa.db";

const BLAS = "cmpxiv6p4000bohvzwl6bnfpv";
const PLANTACION = "cmuamvvnu00018tvz1owuk0h0";
const PO_PRUEBA = "cmrtxh5bp000irrvzgw5y9yb0";

beforeEach(() => {
  // El KV real de Blas al 29-09: sólo PO-2026-001 tiene config guardada.
  H.store = { [PO_PRUEBA]: { dmcOverrides: {}, semillerosPct: 10 } };
  H.planes = [
    { tenantId: BLAS, id: PLANTACION, planType: "PLANTACION", planNumber: "19-SEC/REG-PLT-2025-096", tituloHabilitante: null },
    { tenantId: BLAS, id: PO_PRUEBA, planType: "PO", planNumber: "PO-2026-001", tituloHabilitante: "17-CPO/C-J-045-26" },
    { tenantId: "main", id: "p-main", planType: "PLANTACION", planNumber: "QA-PLT", tituloHabilitante: null },
  ];
  H.findFirst.mockReset().mockImplementation(async ({ where }: { where: { tenantId: string; id: string } }) => {
    const p = H.planes.find((x) => x.tenantId === where.tenantId && x.id === where.id);
    return p ? { planType: p.planType, planNumber: p.planNumber, tituloHabilitante: p.tituloHabilitante } : null;
  });
  H.set.mockReset().mockResolvedValue(undefined);
  H.audit.mockReset();
});

describe("ForestLothPoaDB.leer — el % de semilleros de cada plan", () => {
  it("⭐ Blas, plantación 19-SEC/REG-PLT-2025-096 sin config → 0 % por ser plantación", async () => {
    expect(await ForestLothPoaDB.leer(BLAS, PLANTACION)).toEqual({ config: { dmcOverrides: {}, semillerosPct: 0 }, origen: "plantacion" });
  });

  it("Blas, PO-2026-001 con 10 % guardado → manda lo guardado (no se toca)", async () => {
    expect(await ForestLothPoaDB.leer(BLAS, PO_PRUEBA)).toEqual({ config: { dmcOverrides: {}, semillerosPct: 10 }, origen: "guardado" });
  });

  it("una plantación con config guardada usa la guardada", async () => {
    H.store = { [PLANTACION]: { dmcOverrides: { Copaiba: 60 }, semillerosPct: 15 } };
    expect(await ForestLothPoaDB.leer(BLAS, PLANTACION)).toEqual({ config: { dmcOverrides: { copaiba: 60 }, semillerosPct: 15 }, origen: "guardado" });
  });

  it("guardada sin % (config vieja) → el defecto de ESE plan, no un 10 fijo", async () => {
    H.store = { [PLANTACION]: { dmcOverrides: {} } };
    expect((await ForestLothPoaDB.leer(BLAS, PLANTACION)).config.semillerosPct).toBe(0);
  });

  it("con el plan ya leído no lo vuelve a buscar (la Extracción lee todos juntos)", async () => {
    const r = await ForestLothPoaDB.leer(BLAS, "otro", { planType: "PO", planNumber: "19-SEC/REG-PLT-2026-032" });
    expect(r).toEqual({ config: { dmcOverrides: {}, semillerosPct: 0 }, origen: "plantacion" });
    expect(H.findFirst).not.toHaveBeenCalled();
  });

  it("multi-tenant: la plantación de `main` pedida desde Blas no se ve → defecto de bosque", async () => {
    expect(await ForestLothPoaDB.leer(BLAS, "p-main")).toEqual({ config: { dmcOverrides: {}, semillerosPct: 10 }, origen: "defecto" });
    expect(H.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: BLAS, id: "p-main" } }));
  });

  it("get() devuelve la misma config que leer()", async () => {
    expect(await ForestLothPoaDB.get(BLAS, PLANTACION)).toEqual({ dmcOverrides: {}, semillerosPct: 0 });
  });

  it("sin tenant, error; sin plan, el defecto de bosque", async () => {
    await expect(ForestLothPoaDB.leer("", PLANTACION)).rejects.toThrow("tenantId is required");
    expect(await ForestLothPoaDB.leer(BLAS, "")).toEqual({ config: { dmcOverrides: {}, semillerosPct: 10 }, origen: "defecto" });
  });
});

describe("ForestLothPoaDB.set — guardar sin % toma el defecto del plan", () => {
  it("PUT de una plantación sin semillerosPct → guarda 0 %, sin pisar la config de los otros planes", async () => {
    const guardada = await ForestLothPoaDB.set(BLAS, PLANTACION, { dmcOverrides: { copaiba: 58 } }, "qa");
    expect(guardada).toEqual({ dmcOverrides: { copaiba: 58 }, semillerosPct: 0 });
    const [clave, store] = H.set.mock.calls[0] as [string, Record<string, unknown>];
    expect(clave).toBe(`loth-poa:${BLAS}`);
    expect(store[PO_PRUEBA]).toEqual({ dmcOverrides: {}, semillerosPct: 10 });
    expect(store[PLANTACION]).toEqual({ dmcOverrides: { copaiba: 58 }, semillerosPct: 0 });
  });

  it("con % explícito guarda ese % (también 0 en un bosque)", async () => {
    expect((await ForestLothPoaDB.set(BLAS, PO_PRUEBA, { semillerosPct: 0 }, "qa")).semillerosPct).toBe(0);
    expect((await ForestLothPoaDB.set(BLAS, PLANTACION, { semillerosPct: 12.4 }, "qa")).semillerosPct).toBe(12);
  });
});
