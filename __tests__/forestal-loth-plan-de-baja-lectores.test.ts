/**
 * Un plan dado de baja no deja su censo mandando (revisión ADR-454, 29-09).
 *
 * `ForestPlanDB.eliminarPlan` marca el plan con `deletedAt` y deja vivo su
 * censo (a propósito: es historia declarada). Tres lectores trataban esas filas
 * como si el plan siguiera: la vista «Extracción» (arreglada en
 * `loth-extraccion.ts`), la ficha de la troza (`arbolesDeTrozados`: dos filas
 * del mismo árbol → «no se adivina» y se perdía la del plan vivo) y el picker
 * de la tala (`availableSource("tala")`: ofrecía árboles de un plan de baja).
 *
 * Base simulada que SÍ aplica los `where` (igualdad, `in`, `not`), para
 * afirmar sobre lo que devuelve el lector y no sobre la consulta que armó.
 * Medido el 29-09: hoy no hay filas así en Blas, main ni QA; el caso es latente.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;

const H = vi.hoisted(() => {
  const tablas: Record<string, Fila[]> = { forestPlan: [], forestCensusTree: [], forestLothEntry: [] };
  const cumple = (fila: Fila, where: Record<string, unknown> = {}): boolean =>
    Object.entries(where).every(([k, cond]) => {
      const v = fila[k];
      if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
        const c = cond as { in?: unknown[]; not?: unknown };
        if (c.in) return c.in.includes(v);
        if ("not" in c) return v !== c.not;
        return true;
      }
      return v === cond;
    });
  const modelo = (nombre: string) => ({
    findMany: async (args: { where?: Record<string, unknown>; distinct?: string[] } = {}) => {
      let filas = tablas[nombre].filter((f) => cumple(f, args.where));
      if (args.distinct?.length) {
        const vistos = new Set<string>();
        filas = filas.filter((f) => {
          const k = args.distinct?.map((c) => String(f[c])).join("|") ?? "";
          if (vistos.has(k)) return false;
          vistos.add(k);
          return true;
        });
      }
      return filas;
    },
  });
  return {
    tablas,
    prisma: { forestPlan: modelo("forestPlan"), forestCensusTree: modelo("forestCensusTree"), forestLothEntry: modelo("forestLothEntry") },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { ForestLothDB } from "@/lib/db/forest-loth.db";

const T = "t1";
const arbolCenso = (planId: string, treeCode: string, parcela: string, estado = "en_pie"): Fila => ({
  id: `${planId}-${treeCode}`,
  tenantId: T,
  planId,
  treeCode,
  speciesCommon: "Copaiba",
  speciesScientific: null,
  cites: false,
  dapM: null,
  alturaComercialM: null,
  volumenEstimadoM3: null,
  estado,
  deletedAt: null,
  utmX: null,
  utmY: null,
  utmZona: null,
  parcelaCorta: parcela,
  condicion: "Aprovechable",
});

beforeEach(() => {
  H.tablas.forestPlan = [
    { id: "vivo", tenantId: T, deletedAt: null },
    { id: "baja", tenantId: T, deletedAt: new Date("2026-09-20T00:00:00Z") },
  ];
  // El mismo árbol «111» en los dos censos; el plan de baja además tiene el «900».
  H.tablas.forestCensusTree = [arbolCenso("vivo", "111", "PC-vivo"), arbolCenso("baja", "111", "PC-baja"), arbolCenso("baja", "900", "PC-baja")];
  H.tablas.forestLothEntry = [
    {
      id: "tz1", tenantId: T, section: "trozado", status: "registrado", deletedAt: null, planId: null, lineNo: 3,
      entryDate: new Date("2026-09-28T00:00:00Z"), treeCode: "111", trozaCode: "111-A", speciesCommon: "Copaiba", speciesScientific: null,
    },
  ];
});

describe("arbolesDeTrozados — la ficha de la troza", () => {
  it("un trozado sin plan encuentra el censo del plan VIVO aunque el de baja tenga el mismo árbol", async () => {
    const a = (await ForestLothDB.arbolesDeTrozados(T, ["tz1"])).get("tz1");
    expect(a?.censo?.parcela).toBe("PC-vivo");
  });

  it("si sólo el plan de baja lo tiene, no se muestra ese censo", async () => {
    H.tablas.forestCensusTree = [arbolCenso("baja", "111", "PC-baja")];
    const a = (await ForestLothDB.arbolesDeTrozados(T, ["tz1"])).get("tz1");
    expect(a?.arbolCodigo).toBe("111");
    expect(a?.censo).toBeNull();
  });
});

describe("availableSource('tala') — el picker de la tala", () => {
  it("sin plan: sólo ofrece árboles de planes vivos", async () => {
    const items = await ForestLothDB.availableSource(T, "tala");
    expect(items.map((i) => `${i.code}:${"meta" in i ? i.meta : ""}`)).toEqual(["111:PC-vivo"]);
  });

  it("con el id de un plan de baja: nada que talar", async () => {
    expect(await ForestLothDB.availableSource(T, "tala", "baja")).toEqual([]);
  });

  it("con el plan vivo: sus árboles en pie, sin los que el libro ya taló", async () => {
    H.tablas.forestCensusTree.push(arbolCenso("vivo", "112", "PC-vivo"));
    H.tablas.forestLothEntry.push({ id: "t1", tenantId: T, section: "tala", status: "registrado", deletedAt: null, treeCode: "112" });
    const items = await ForestLothDB.availableSource(T, "tala", "vivo");
    expect(items.map((i) => i.code)).toEqual(["111"]);
  });
});
