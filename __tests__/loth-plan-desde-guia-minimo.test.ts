/**
 * «Crear el plan desde la guía» — revisión del freno de saldo (25-10):
 *  · M4: el plan nuevo nace con esta guía Y lo sin plan de otras guías (ADR-459):
 *    lo autorizado tiene que cubrir las dos cosas, la ventana lo dice con la suma
 *    y el servidor lo frena antes de la transacción con el mismo texto.
 *  · BAJO 3: la misma especie dos veces en el alta SUMA, no gana la última.
 *  · BAJO 1: el ⓘ de «Lo que no tiene plan» dice la regla (frena, no sólo «se ve gastado»).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { autorizadoPorEspecie, faltaDelMinimo, minimoDelPlanDesdeLaGuia, type EspecieDeLaGuia } from "@/lib/forestal/loth-atar-lo-suelto";
import type { MovimientoDelSaldo } from "@/lib/forestal/loth-saldo-cascada";

type Fila = Record<string, unknown>;
const TENANT = "tenant-main";
const GUIA = "19-000004";

const H = vi.hoisted(() => ({
  guias: [] as Record<string, unknown>[],
  libro: [] as Record<string, unknown>[],
  tx: 0,
  atados: 0,
  especiesCreadas: [] as { speciesCommon: string; volumenAutorizadoM3: number }[][],
}));

/** El `where` de Prisma que usan estas lecturas: igualdad, `not`, `in`. */
function cumple(f: Fila, where: Fila): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === "OR") return true;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o = v as { not?: unknown; in?: unknown[] };
      if ("not" in o) return f[k] !== o.not;
      if ("in" in o) return (o.in ?? []).includes(f[k]);
      return true;
    }
    return f[k] === v;
  });
}

vi.mock("@/lib/prisma", () => {
  const db = {
    forestGtf: {
      findFirst: async ({ where }: { where: Fila }) => H.guias.find((g) => cumple(g, where)) ?? null,
      findMany: async ({ where }: { where: Fila }) => H.guias.filter((g) => cumple(g, where)),
    },
    forestPlan: { findMany: async () => [] },
    forestLothEntry: {
      findMany: async ({ where }: { where: Fila }) => H.libro.filter((f) => cumple(f, where)),
      aggregate: async () => ({ _count: { _all: 0 }, _sum: { volumeM3: null } }),
    },
  };
  const tx = { $executeRaw: async () => 1 };
  return {
    prisma: {
      ...db,
      $transaction: async (fn: (t: typeof tx) => unknown) => {
        H.tx++;
        return fn(tx);
      },
    },
  };
});
vi.mock("@/lib/db/forest-loth.db", async (real) => {
  const r = await real<typeof import("@/lib/db/forest-loth.db")>();
  return { ...r, ForestLothDB: { conteoAtarSinPlan: async () => ({ total: 0 }) } };
});
vi.mock("@/lib/db/forest-plan.db", () => ({
  ForestPlanDB: {
    crearPlanEnTx: async (_tx: unknown, _t: string, input: Fila) => ({ id: "plan-nuevo", ...input }),
    crearEspeciesEnTx: async (_tx: unknown, _t: string, _p: string, especies: { speciesCommon: string; volumenAutorizadoM3: number }[]) => {
      H.especiesCreadas.push(especies);
      return especies;
    },
    despuesDelAlta: () => undefined,
  },
}));
vi.mock("@/lib/db/forest-loth-guia-permiso.db", () => ({
  SELECT_GUIA_PARA_ATAR: {},
  ForestLothGuiaPermisoDB: {
    exigirSinPermiso: () => undefined,
    codigosDe: () => [],
    lineasAAtar: async () => ({ despachos: [], trozados: [] }),
    atarEnTx: async () => {
      H.atados++;
      return { despachos: 3, trozados: 3 };
    },
    despuesDeAtar: () => undefined,
  },
}));
vi.mock("@/lib/db/forest-loth-importar.db", () => ({
  ForestLothImportarDB: { planesYContratos: async () => ({ planes: [], contratos: [] }) },
}));

const { ForestLothSaldoPlanDB } = await import("@/lib/db/forest-loth-saldo-plan.db");

/* La guía 19-000004 de Blas (24-10), recortada: plantación, sin plan. */
const guia = {
  id: "gtf-1",
  tenantId: TENANT,
  deletedAt: null,
  planId: null,
  tipo: "trozas",
  status: "emitida",
  gtfNumber: GUIA,
  gtfDate: new Date("2026-10-20T00:00:00Z"),
  tituloHabilitante: "19-SEC/REG-PLT-2026-117",
  titularName: null,
  volumenTotalM3: null,
  piezasTotal: null,
  origen: "COMUNIDAD NATIVA SEPTIMO UNIDOS, Puerto Bermúdez, Oxapampa, Pasco",
  items: [
    { code: "1-0004", species: "Tornillo", scientific: "Cedrelinga cateniformis", volumeM3: 1.5 },
    { code: "1-0005", species: "TORNILLO", scientific: null, volumeM3: 0.5 },
    { code: "1-0006", species: "Capirona", scientific: null, volumeM3: 0.25 },
  ],
  gtfDatos: { titulos: ["19-SEC/REG-PLT-2026-117"], guia: { origenRecurso: "plantacion" } },
};

/** Una troza del libro (su Trozado) y, si `gtf`, su despacho con esa guía. */
function troza(codigo: string, especie: string, m3: number, gtf: string | null, planId: string | null = null, tenantId = TENANT): Fila[] {
  const base = { tenantId, deletedAt: null, status: "registrado", speciesScientific: null, quantity: null, unit: null, planId, trozaCode: codigo, speciesCommon: especie, volumeM3: m3 };
  const filas: Fila[] = [{ ...base, section: "trozado", gtfNumber: null }];
  if (gtf) filas.push({ ...base, section: "despacho_troza", gtfNumber: gtf });
  return filas;
}

/** El libro: esta guía (Tornillo 2 m³, Capirona 0,25), otra guía sin plan (Tornillo 4), un plan ajeno, una troza sin despachar y otro negocio. */
const LIBRO = () => [
  ...troza("1-0004", "Tornillo", 1.5, GUIA),
  ...troza("1-0005", "TORNILLO", 0.5, GUIA),
  ...troza("1-0006", "Capirona", 0.25, GUIA),
  ...troza("2-0001", "Tornillo", 4, "19-000010"),
  ...troza("3-0001", "Tornillo", 7, "19-000020", "plan-x"),
  ...troza("4-0001", "Tornillo", 9, null),
  ...troza("9-0001", "Tornillo", 50, "19-000099", null, "otro-negocio"),
];

beforeEach(() => {
  H.guias = [{ ...guia }];
  H.libro = LIBRO();
  H.tx = 0;
  H.atados = 0;
  H.especiesCreadas = [];
});

const ESPECIES: EspecieDeLaGuia[] = [
  { especie: "Tornillo", cientifico: "Cedrelinga cateniformis", cites: false, trozas: 2, m3: 2 },
  { especie: "Capirona", cientifico: null, cites: false, trozas: 1, m3: 0.25 },
];
const sinPlanDelLibro = (): MovimientoDelSaldo[] =>
  LIBRO()
    .filter((f) => f.tenantId === TENANT && f.planId == null)
    .map((f) => f as unknown as MovimientoDelSaldo);

describe("minimoDelPlanDesdeLaGuia — lo que el plan nuevo ya lleva al nacer (M4)", () => {
  it("esta guía + lo sin plan de otras guías; lo de otro plan y lo no despachado, no", () => {
    expect(minimoDelPlanDesdeLaGuia(ESPECIES, sinPlanDelLibro(), GUIA)).toEqual([
      { clave: "tornillo", especie: "Tornillo", estaGuiaM3: 2, otrasSinPlanM3: 4, minimoM3: 6 },
      { clave: "capirona", especie: "Capirona", estaGuiaM3: 0.25, otrasSinPlanM3: 0, minimoM3: 0.25 },
    ]);
  });

  it("una línea de un plan que se colara no cuenta (sólo lo sin plan)", () => {
    const conPlan = [...sinPlanDelLibro(), ...(troza("3-0001", "Tornillo", 7, "19-000020", "plan-x") as unknown as MovimientoDelSaldo[])];
    expect(minimoDelPlanDesdeLaGuia(ESPECIES, conPlan, GUIA)[0].minimoM3).toBe(6);
  });
});

describe("faltaDelMinimo — la ventana y el servidor dicen la misma suma", () => {
  const minimos = minimoDelPlanDesdeLaGuia(ESPECIES, sinPlanDelLibro(), GUIA);

  it("autorizado bajo el mínimo → explica esta guía + las otras sin plan", () => {
    expect(faltaDelMinimo(ESPECIES, [5, 1], minimos, "autorizado")).toBe(
      `Tornillo: lo autorizado tiene que cubrir esta guía (${fmtM3(2)} m³) y lo sin plan de otras guías (${fmtM3(4)} m³), que también cuenta en el saldo del plan nuevo: al menos ${fmtM3(6)} m³.`,
    );
  });

  it("mismo redondeo que T6 (`excedeTechoM3`): 5,9996 cubre 6; 5,998 no", () => {
    expect(faltaDelMinimo(ESPECIES, [5.9996, 1], minimos, "autorizado")).toBeNull();
    expect(faltaDelMinimo(ESPECIES, [5.998, 1], minimos, "autorizado")).toMatch(/^Tornillo: /);
  });

  it("sin lo sin plan de otras guías, el texto habla sólo de esta guía; sin techo, no frena", () => {
    expect(faltaDelMinimo(ESPECIES, [6, 0.2], minimos, "registrado")).toBe(`Capirona: lo registrado tiene que cubrir lo que esta guía ya despachó (${fmtM3(0.25)} m³).`);
    expect(faltaDelMinimo(ESPECIES, [null, null], minimos, "autorizado")).toBeNull();
  });
});

describe("autorizadoPorEspecie — la misma especie dos veces suma (BAJO 3)", () => {
  it("«Tornillo» 4 + «TORNILLO» 3 = 7 con el nombre de la primera; nunca gana la última", () => {
    const m = autorizadoPorEspecie([
      { especie: "Tornillo", volumenAutorizadoM3: 4 },
      { especie: "TORNILLO ", volumenAutorizadoM3: 3 },
      { especie: "Capirona", volumenAutorizadoM3: 1 },
    ]);
    expect([...m]).toEqual([
      ["tornillo", { especie: "Tornillo", volumenAutorizadoM3: 7 }],
      ["capirona", { especie: "Capirona", volumenAutorizadoM3: 1 }],
    ]);
  });
});

describe("ForestLothSaldoPlanDB · crear el plan desde la guía", () => {
  const alta = (especies: { especie: string; volumenAutorizadoM3: number }[]) => ({ titularName: "Comunidad Séptimo Unidos", especies });

  it("sueltos: cada guía trae lo que su plan nuevo ya llevaría (sólo de este negocio)", async () => {
    const s = await ForestLothSaldoPlanDB.sueltos(TENANT);
    expect(s.guias[0].minimos).toEqual([
      { clave: "tornillo", especie: "Tornillo", estaGuiaM3: 2, otrasSinPlanM3: 4, minimoM3: 6 },
      { clave: "capirona", especie: "Capirona", estaGuiaM3: 0.25, otrasSinPlanM3: 0, minimoM3: 0.25 },
    ]);
  });

  it("lo registrado bajo esta guía + lo sin plan de otras → 422 con la suma, sin abrir la transacción", async () => {
    await expect(
      ForestLothSaldoPlanDB.crearPlanDesdeLaGuia(TENANT, "gtf-1", alta([{ especie: "Tornillo", volumenAutorizadoM3: 5 }, { especie: "Capirona", volumenAutorizadoM3: 1 }]), "qaadmin"),
    ).rejects.toMatchObject({
      code: "T6_EXCESO_AUTORIZADO",
      message: `Tornillo: lo registrado tiene que cubrir esta guía (${fmtM3(2)} m³) y lo sin plan de otras guías (${fmtM3(4)} m³), que también cuenta en el saldo del plan nuevo: al menos ${fmtM3(6)} m³.`,
    });
    expect(H.tx).toBe(0);
    expect(H.atados).toBe(0);
  });

  it("con lo autorizado que cubre la suma, crea el plan y ata la guía", async () => {
    const r = await ForestLothSaldoPlanDB.crearPlanDesdeLaGuia(TENANT, "gtf-1", alta([{ especie: "Tornillo", volumenAutorizadoM3: 6 }, { especie: "Capirona", volumenAutorizadoM3: 1 }]), "qaadmin");
    expect(r).toMatchObject({ planId: "plan-nuevo", gtfId: "gtf-1", especies: 2 });
    expect(H.atados).toBe(1);
  });

  it("BAJO 3: «Tornillo» 4 y «TORNILLO» 3 en el alta → el registro guarda 7, no 3", async () => {
    await ForestLothSaldoPlanDB.crearPlanDesdeLaGuia(
      TENANT,
      "gtf-1",
      alta([{ especie: "Tornillo", volumenAutorizadoM3: 4 }, { especie: "TORNILLO", volumenAutorizadoM3: 3 }, { especie: "Capirona", volumenAutorizadoM3: 1 }]),
      "qaadmin",
    );
    expect(H.especiesCreadas[0].map((e) => [e.speciesCommon, e.volumenAutorizadoM3])).toEqual([["Tornillo", 7], ["Capirona", 1]]);
  });

  it("la guía de otro negocio → null, sin leer el libro ni abrir la transacción", async () => {
    expect(await ForestLothSaldoPlanDB.crearPlanDesdeLaGuia("otro-negocio", "gtf-1", alta([]), "qaadmin")).toBeNull();
    expect(H.tx).toBe(0);
  });
});

describe("el ⓘ de lo sin plan dice la regla que aplica el servidor (BAJO 1)", () => {
  const fuente = (archivo: string) => readFileSync(path.join(process.cwd(), "components/admin/forestal", archivo), "utf8");

  it("«Lo que no tiene plan»: lo despachado sin plan cuenta en el saldo de cada plan hasta que lo ates", () => {
    const s = fuente("LothPlanSinPlan.tsx");
    expect(s).toContain("Lo despachado sin plan cuenta en el saldo de cada plan hasta que lo ates");
    expect(s).not.toContain("se ve más gastado de lo que está");
  });

  it("la ventana de crear el plan usa la misma cuenta que el servidor (`faltaDelMinimo`)", () => {
    expect(fuente("LothPlanDesdeGuia.tsx")).toMatch(/return faltaDelMinimo\(guia\.propuesta\.especies, valores, guia\.minimos, techo\)/);
  });
});
