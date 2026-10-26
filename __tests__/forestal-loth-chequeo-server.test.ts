/**
 * chequeoAvanzado (reviewer 26-10): lo que falla en UN plan no esconde lo que
 * se leyó de los otros; la vigencia se juzga aunque fallen los papeles; con
 * un plan elegido y las guías sin leer, los despachos no se juzgan; y los
 * papeles sólo para quien ve todo el Archivo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  planes: {} as Record<string, Record<string, unknown> | null>,
  papelesFallan: new Set<string>(),
  planFalla: new Set<string>(),
  guiasFallan: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: vi.fn(async () => false) }));
vi.mock("@/lib/db/forest-contrato.db", () => ({ ForestContratoDB: { list: vi.fn(async () => []) } }));
vi.mock("@/lib/db/forest-loth.db", () => ({
  ForestLothDB: {
    datosAvisoPlazos: vi.fn(async () => ({
      lineas: [],
      gtfs: [],
      planes: Object.keys(m.planes).map((id) => ({ id, alias: `PO ${id}`, planType: "PO", isActive: true, estado: "vigente" })),
    })),
    arbolesBajoDmc: vi.fn(async () => new Map()),
  },
}));
vi.mock("@/lib/db/forest-loth-chequeo.db", () => ({
  ForestLothChequeoDB: {
    guias: vi.fn(async () => {
      if (m.guiasFallan) throw new Error("guías caídas");
      return [];
    }),
    censoDeArboles: vi.fn(async () => []),
    planesConCenso: vi.fn(async () => new Set()),
  },
}));
vi.mock("@/lib/db/forest-loth-saldo-plan.db", () => ({ ForestLothSaldoPlanDB: { saldo: vi.fn(async () => null) } }));
vi.mock("@/lib/db/forest-plan-preliminares.db", () => ({ ForestPlanPreliminaresDB: { delPlan: vi.fn() } }));
vi.mock("@/lib/db/forest-plan.db", () => ({
  ForestPlanDB: {
    getPlan: vi.fn(async (_t: string, id: string) => {
      if (m.planFalla.has(id)) throw new Error("plan caído");
      return m.planes[id];
    }),
    listSpecies: vi.fn(async () => []),
  },
}));
vi.mock("@/lib/forestal/loth-plan-papeles-server", () => ({
  papelesDelPlan: vi.fn(async (_t: string, id: string) => {
    if (m.papelesFallan.has(id)) throw new Error("drive caído");
    return null;
  }),
}));

import { chequeoAvanzado } from "@/lib/forestal/loth-chequeo-server";
import { AJUSTES_CHEQUEO_DEFECTO } from "@/lib/forestal/loth-chequeo-tipos";

const AHORA = Date.parse("2026-10-26T15:00:00Z");
const plan = (vigenciaHasta: string) => ({
  planType: "PO",
  estado: "vigente",
  vigenciaHasta: new Date(`${vigenciaHasta}T00:00:00Z`),
  tituloHabilitante: "TH-1",
  titularName: "Titular",
});
const correr = (o: { planId?: string; verPapeles?: boolean } = {}) =>
  chequeoAvanzado("t1", { ajustes: AJUSTES_CHEQUEO_DEFECTO, ahora: AHORA, verPapeles: o.verPapeles ?? true, planId: o.planId ?? null });
const casosDe = (r: Awaited<ReturnType<typeof correr>>, key: string) => r.checks.find((c) => c.key === key)?.casos ?? null;

beforeEach(() => {
  m.planes = { A: plan("2027-12-31"), B: plan("2026-09-30") };
  m.papelesFallan = new Set();
  m.planFalla = new Set();
  m.guiasFallan = false;
});

describe("chequeoAvanzado — lo que no se leyó de un plan no esconde a los otros", () => {
  it("fallan los papeles de A y B está vencido → plan_vencido sale con el caso de B", async () => {
    m.papelesFallan = new Set(["A"]);
    const r = await correr();
    const vencido = casosDe(r, "plan_vencido");
    expect(vencido).toHaveLength(1);
    expect(vencido?.[0]).toMatch(/^PO B:/);
    expect(r.sinLeer).toContain("los papeles de PO A");
    /* Los papeles sin casos y con A sin leer: no salen «en orden». */
    expect(r.checks.some((c) => c.key === "papeles_vencidos" || c.key === "papeles_faltan")).toBe(false);
  });

  it("no se pudo leer el plan A → igual sale el vencido de B; sin casos, el chequeo no sale «en orden»", async () => {
    m.planFalla = new Set(["A"]);
    const r = await correr();
    expect(casosDe(r, "plan_vencido")?.[0]).toMatch(/^PO B:/);
    expect(r.sinLeer.some((s) => s.includes("PO A"))).toBe(true);

    m.planes = { A: plan("2027-12-31"), B: plan("2027-12-31") };
    const r2 = await correr();
    expect(r2.checks.find((c) => c.key === "plan_vencido")).toBeUndefined();
  });

  it("todo leído y nada vencido → plan_vencido sale «en orden» (0 casos)", async () => {
    m.planes = { A: plan("2027-12-31") };
    const r = await correr();
    expect(r.checks.find((c) => c.key === "plan_vencido")?.count).toBe(0);
  });
});

describe("chequeoAvanzado — despachos con un plan elegido", () => {
  it("guías sin leer → despacho_* no se juzga (no se cuelan los de otros planes)", async () => {
    m.guiasFallan = true;
    const r = await correr({ planId: "A" });
    expect(r.checks.find((c) => c.key === "despacho_sin_asentar")).toBeUndefined();
    expect(r.checks.find((c) => c.key === "despacho_por_asentar")).toBeUndefined();
    expect(r.sinLeer).toContain("las guías emitidas");
  });

  it("sin plan elegido, las guías caídas no frenan el despacho (es del libro entero)", async () => {
    m.guiasFallan = true;
    const r = await correr();
    expect(r.checks.find((c) => c.key === "despacho_sin_asentar")?.count).toBe(0);
  });
});

describe("chequeoAvanzado — papeles sólo para dueño y administrador", () => {
  it("sin verPapeles no salen papeles_* (ni cuentan) y se dice que no se revisaron", async () => {
    const r = await correr({ verPapeles: false });
    expect(r.checks.some((c) => c.key.startsWith("papeles_"))).toBe(false);
    expect(r.sinLeer.some((s) => s.startsWith("los papeles de los planes"))).toBe(true);
    /* La vigencia sí. */
    expect(casosDe(r, "plan_vencido")?.[0]).toMatch(/^PO B:/);
  });
});
