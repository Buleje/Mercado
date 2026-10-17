/**
 * Despacho con guía EN LOTE (16-10): una guía de 50 trozas registraba con
 * 500 a los 61 s en Blas (Supabase a 119 ms por ida y ~20 idas por troza,
 * la transacción vencía en T2). Ahora las invariantes de la salida (T1, T2,
 * T6, T7) y las del trozado a mano (T3, T4) se leen UNA vez por guía.
 *
 * Contra el código real (`asentarTrozasAManoEnTx` + `despacharConGuiaEnTx`)
 * sobre una base en memoria que entiende los filtros que usa el libro, con un
 * contador de idas: cada llamada a un modelo o a `$queryRaw`/`$executeRaw`
 * dentro de la transacción es una ida a la base.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";

type Fila = Record<string, unknown>;

const H = vi.hoisted(() => {
  const db = {
    lineas: [] as Fila[],
    especies: [] as Fila[],
    planes: [] as Fila[],
    censo: [] as Fila[],
    gtfs: [] as Fila[],
  };
  const cuenta = { idas: 0, porMetodo: new Map<string, number>() };
  let seq = 0;
  const up = (v: unknown) => String(v ?? "").toUpperCase();
  const cumple = (valor: unknown, cond: unknown): boolean => {
    if (cond === null) return valor == null;
    if (typeof cond !== "object" || cond instanceof Date) return valor === cond;
    const c = cond as Record<string, unknown>;
    const ins = c.mode === "insensitive";
    const norm = (x: unknown) => (ins ? up(x) : String(x ?? ""));
    if ("in" in c) return (c.in as unknown[]).includes(valor);
    if ("not" in c) return c.not === null ? valor != null : valor !== c.not;
    if ("equals" in c) return valor != null && norm(valor) === norm(c.equals);
    if ("startsWith" in c) return valor != null && norm(valor).startsWith(norm(c.startsWith));
    if ("endsWith" in c) return valor != null && norm(valor).endsWith(norm(c.endsWith));
    throw new Error(`filtro no soportado: ${JSON.stringify(c)}`);
  };
  const coincide = (fila: Fila, where: Fila = {}): boolean =>
    Object.entries(where).every(([k, cond]) => {
      if (cond === undefined) return true;
      if (k === "OR") return (cond as Fila[]).some((w) => coincide(fila, w));
      if (k === "AND") return (cond as Fila[]).every((w) => coincide(fila, w));
      return cumple(fila[k], cond);
    });
  const ordenar = (filas: Fila[], orderBy: unknown) => {
    const claves = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []) as Record<string, "asc" | "desc">[];
    return [...filas].sort((a, b) => {
      for (const o of claves) {
        const [k, dir] = Object.entries(o)[0];
        const x = a[k] as string | number;
        const y = b[k] as string | number;
        if (x === y) continue;
        return (x < y ? -1 : 1) * (dir === "desc" ? -1 : 1);
      }
      return 0;
    });
  };
  const modelo = (tabla: () => Fila[], pref: string) => ({
    findMany: async ({ where, orderBy, take }: { where?: Fila; orderBy?: unknown; take?: number } = {}) =>
      ordenar(tabla().filter((f) => coincide(f, where)), orderBy).slice(0, take ?? Infinity),
    findFirst: async ({ where, orderBy }: { where?: Fila; orderBy?: unknown } = {}) =>
      ordenar(tabla().filter((f) => coincide(f, where)), orderBy)[0] ?? null,
    count: async ({ where }: { where?: Fila } = {}) => tabla().filter((f) => coincide(f, where)).length,
    aggregate: async ({ where, _max, _sum }: { where?: Fila; _max?: Fila; _sum?: Fila }) => {
      const filas = tabla().filter((f) => coincide(f, where));
      const out: Record<string, Record<string, number | null>> = {};
      if (_max) out._max = Object.fromEntries(Object.keys(_max).map((k) => [k, filas.length ? Math.max(...filas.map((f) => Number(f[k] ?? 0))) : null]));
      if (_sum) {
        out._sum = Object.fromEntries(
          Object.keys(_sum).map((k) => {
            const v = filas.map((f) => f[k]).filter((x) => x != null);
            return [k, v.length ? v.reduce((a: number, b) => a + Number(b), 0) : null];
          }),
        );
      }
      return out;
    },
    groupBy: async ({ by, where, _sum }: { by: string[]; where?: Fila; _sum?: Fila }) => {
      const grupos = new Map<string, Fila & { _sum: Record<string, number> }>();
      for (const f of tabla().filter((x) => coincide(x, where))) {
        const k = by.map((b) => String(f[b])).join("|");
        const g = grupos.get(k) ?? { ...Object.fromEntries(by.map((b) => [b, f[b] ?? null])), _sum: {} };
        for (const s of Object.keys(_sum ?? {})) g._sum[s] = (g._sum[s] ?? 0) + Number(f[s] ?? 0);
        grupos.set(k, g);
      }
      return [...grupos.values()];
    },
    create: async ({ data }: { data: Fila }) => {
      const fila = { status: "registrado", deletedAt: null, ...data, id: `${pref}${String(++seq).padStart(5, "0")}` };
      tabla().push(fila);
      return fila;
    },
    createManyAndReturn: async ({ data }: { data: Fila[] }) =>
      data.map((d) => {
        const fila = { status: "registrado", deletedAt: null, ...d, id: `${pref}${String(++seq).padStart(5, "0")}` };
        tabla().push(fila);
        return fila;
      }),
  });
  const base = {
    $queryRaw: async () => [],
    $executeRaw: async () => 1,
    forestLothEntry: modelo(() => db.lineas, "l"),
    forestPlanSpecies: modelo(() => db.especies, "s"),
    forestPlan: modelo(() => db.planes, "p"),
    forestCensusTree: modelo(() => db.censo, "c"),
    forestGtf: modelo(() => db.gtfs, "g"),
    activityLog: modelo(() => [], "a"),
  };
  const contar = <O extends object>(obj: O, ruta: string): O =>
    new Proxy(obj, {
      get(t, p) {
        const v = (t as Record<string | symbol, unknown>)[p];
        const nombre = `${ruta}${String(p)}`;
        if (typeof v === "function") {
          return (...a: unknown[]) => {
            cuenta.idas += 1;
            cuenta.porMetodo.set(nombre, (cuenta.porMetodo.get(nombre) ?? 0) + 1);
            return (v as (...x: unknown[]) => unknown)(...a);
          };
        }
        if (v && typeof v === "object") return contar(v as object, `${nombre}.`);
        return v;
      },
    });
  const tx = contar(base, "");
  const reset = () => {
    db.lineas = [];
    db.especies = [];
    db.planes = [];
    db.censo = [];
    db.gtfs = [];
    cuenta.idas = 0;
    cuenta.porMetodo.clear();
    seq = 0;
  };
  return { db, cuenta, tx, reset };
});

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/loth-audit", () => ({ auditLoth: () => {} }));

import type { Prisma } from "@/lib/generated/prisma/client";
import { ForestLothDB, LothInvariantError, type FilaAManoConEspecie } from "@/lib/db/forest-loth.db";
import { gtfDatosVacio } from "@/lib/forestal/ctp-gtf-datos";
import type { DespachoT6DeLaEspecie } from "@/lib/forestal/loth-t6";

const T = "tenant-qa";
const PLAN = "plan-po-1";
const GTF = "019-001-0000123";
const FECHA = new Date("2026-10-16T00:00:00Z");
const TOR = { comun: "Tornillo", cientifico: "Cedrelinga cateniformis" };
const CAP = { comun: "Capirona", cientifico: "Calycophyllum spruceanum" };
const tx = H.tx as unknown as Prisma.TransactionClient;

function sembrarPlan(autorizado: { tor?: number | null; cap?: number | null } = {}) {
  H.db.planes.push({ id: PLAN, tenantId: T, deletedAt: null, estado: "vigente", planType: "PO", planNumber: "PO-1", tituloHabilitante: null, parcelaCorta: null, createdAt: FECHA });
  H.db.especies.push(
    { id: "esp-tor", tenantId: T, planId: PLAN, deletedAt: null, speciesCommon: TOR.comun, speciesScientific: TOR.cientifico, volumenAutorizadoM3: autorizado.tor === undefined ? 10_000 : autorizado.tor },
    { id: "esp-cap", tenantId: T, planId: PLAN, deletedAt: null, speciesCommon: CAP.comun, speciesScientific: CAP.cientifico, volumenAutorizadoM3: autorizado.cap === undefined ? 10_000 : autorizado.cap },
  );
}

let lineNo = 0;
function trozado(trozaCode: string, volumeM3: number, extra: Fila = {}) {
  H.db.lineas.push({
    id: `t-${trozaCode}`, tenantId: T, caratulaId: null, planId: PLAN, section: "trozado", lineNo: ++lineNo, status: "registrado", deletedAt: null,
    trozaCode, treeCode: null, speciesCommon: TOR.comun, speciesScientific: TOR.cientifico, cites: false,
    diamMayorM: 0.5, diamMenorM: 0.48, lengthM: 4, volumeM3, ...extra,
  });
}
function despachoPrevio(trozaCode: string) {
  H.db.lineas.push({ id: `d-${trozaCode}`, tenantId: T, caratulaId: null, planId: PLAN, section: "despacho_troza", lineNo: ++lineNo, status: "registrado", deletedAt: null, trozaCode, gtfNumber: "019-001-0000001" });
}

const despachar = (codes: string[], extra: Partial<Parameters<typeof ForestLothDB.despacharConGuiaEnTx>[2]> = {}, opts: Parameters<typeof ForestLothDB.despacharConGuiaEnTx>[4] = {}) =>
  ForestLothDB.despacharConGuiaEnTx(
    tx,
    T,
    { gtfNumber: GTF, gtfDate: FECHA, trozaCodes: codes, gtfDatos: gtfDatosVacio(), titularName: "Blas", createdBy: "qa", ...extra },
    null,
    opts,
  );

async function aManoYDespacho(filas: FilaAManoConEspecie[], planId: string | null = PLAN) {
  const manual = await ForestLothDB.asentarTrozasAManoEnTx(tx, T, { filas, planId, ocupados: [], gtfNumber: GTF, gtfDate: FECHA, caratulaId: null, createdBy: "qa" });
  const r = await despachar(manual.codigos, { codigosGuia: manual.codigosGuia, nacidas: new Set(manual.codigos) });
  return { manual, r };
}

const fila = (cantidad: number, extra: Partial<FilaAManoConEspecie> = {}): FilaAManoConEspecie => ({
  d1Cm: 50, d2Cm: 48, largoM: 4, cantidad, especie: TOR.comun, cientifico: TOR.cientifico, ...extra,
});

async function error(p: Promise<unknown>): Promise<LothInvariantError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof LothInvariantError) return e;
    throw e;
  }
  throw new Error("se esperaba un LothInvariantError");
}

beforeEach(() => {
  H.reset();
  lineNo = 0;
});

/** Los trozados de varias líneas de una, como los asienta la troza a mano (método privado). */
const asentarLote = (lineas: Fila[]) =>
  (Reflect.get(ForestLothDB, "asentarTrozadosEnLoteEnTx") as (...a: unknown[]) => Promise<Fila[]>).call(ForestLothDB, tx, T, lineas, FECHA, null);
const despachos = () => H.db.lineas.filter((l) => l.section === "despacho_troza" && l.gtfNumber === GTF);

/*
 * Tope: antes, ~12 idas por troza del libro y ~16 por troza a mano (606 y 810
 * para 50). Ahora no crecen con la guía; 40 deja margen sin dejar volver al
 * «una lectura por troza» (10 trozas ya serían 120).
 */
const TOPE_IDAS = 40;

describe("idas a la base por guía", () => {
  const medidas: string[] = [];
  const idasDe = new Map<string, number>();
  const medir = async (nombre: string, fn: () => Promise<unknown>) => {
    H.cuenta.idas = 0;
    H.cuenta.porMetodo.clear();
    await fn();
    medidas.push(`${nombre}: ${H.cuenta.idas} idas · ${[...H.cuenta.porMetodo].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(" ")}`);
    idasDe.set(nombre, H.cuenta.idas);
    return H.cuenta.idas;
  };

  for (const n of [10, 25, 50]) {
    it(`${n} trozas del libro`, async () => {
      sembrarPlan();
      for (let i = 1; i <= n; i++) trozado(`L-${String(i).padStart(3, "0")}`, 1.2345, { treeCode: `ARB-${i}` });
      const idas = await medir(`libro ${n}`, () => despachar(H.db.lineas.map((l) => String(l.trozaCode))));
      expect(H.db.lineas.filter((l) => l.section === "despacho_troza")).toHaveLength(n);
      expect(idas).toBeLessThanOrEqual(TOPE_IDAS);
    });
    it(`${n} trozas a mano sin árbol`, async () => {
      sembrarPlan();
      const idas = await medir(`a mano ${n}`, () => aManoYDespacho([fila(n)]));
      expect(H.db.lineas.filter((l) => l.section === "trozado")).toHaveLength(n);
      expect(H.db.lineas.filter((l) => l.section === "despacho_troza")).toHaveLength(n);
      // El correlativo sigue el orden de las piezas, sin huecos.
      expect(H.db.lineas.filter((l) => l.section === "trozado").map((l) => l.lineNo)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      expect(idas).toBeLessThanOrEqual(TOPE_IDAS);
    });
    it(`${n} trozas a mano de 5 árboles`, async () => {
      sembrarPlan();
      for (let a = 1; a <= 5; a++) H.db.censo.push({ id: `arb-${a}`, tenantId: T, planId: PLAN, deletedAt: null, estado: "en_pie", treeCode: `00${a}-TOR`, speciesCommon: TOR.comun, speciesScientific: TOR.cientifico });
      const filas = [1, 2, 3, 4, 5].map((a) => fila(n / 5, { arbolId: `arb-${a}` }));
      const idas = await medir(`a mano con árbol ${n}`, () => aManoYDespacho(filas));
      expect(H.db.lineas.filter((l) => l.section === "trozado" && l.treeCode)).toHaveLength(n);
      expect(idas).toBeLessThanOrEqual(TOPE_IDAS);
    });
  }

  it("deja las cifras: 50 trozas hacen las mismas idas que 10", () => {
    if (process.env.IDAS_OUT) writeFileSync(process.env.IDAS_OUT, `${medidas.join("\n")}\n`);
    expect(medidas.length).toBe(9);
    for (const caso of ["libro", "a mano", "a mano con árbol"]) expect(idasDe.get(`${caso} 50`)).toBe(idasDe.get(`${caso} 10`));
  });
});

describe("T1 y T2: la salida de cada troza, igual que de a una", () => {
  it("T1 — una troza ya despachada frena la guía entera, con su código y su línea; nada se escribe", async () => {
    sembrarPlan();
    trozado("L-001", 1);
    trozado("L-002", 1);
    despachoPrevio("L-002");
    const e = await error(despachar(["L-001", "L-002"]));
    expect(e.code).toBe("T1_TROZA_YA_MOVILIZADA");
    expect(e.message).toBe("La troza L-002 ya fue despachada (línea #3). Una troza sale del bosque una sola vez.");
    expect(e.detail).toMatchObject({ trozaCode: "L-002", lineNo: 3, section: "despacho_troza" });
    expect(despachos()).toHaveLength(0);
    expect(H.db.gtfs).toHaveLength(0);
  });

  it("T1 — una troza consumida en el aserradero tampoco sale", async () => {
    sembrarPlan();
    trozado("L-001", 1);
    H.db.lineas.push({ id: "c-1", tenantId: T, caratulaId: null, planId: PLAN, section: "consumo_troza", lineNo: 9, status: "registrado", deletedAt: null, trozaCode: "L-001" });
    const e = await error(despachar(["L-001"]));
    expect(e.code).toBe("T1_TROZA_YA_MOVILIZADA");
    expect(e.message).toContain("ya fue consumida (línea #9)");
  });

  it("T1 — la misma troza escrita dos veces en la guía sale UNA vez", async () => {
    sembrarPlan();
    trozado("L-001", 1);
    const r = await despachar(["L-001", " L-001 ", "L-001"]);
    expect(r.lineas).toHaveLength(1);
    expect(despachos()).toHaveLength(1);
  });

  it("T1 — una despachada ANULADA no cuenta: la troza vuelve a salir", async () => {
    sembrarPlan();
    trozado("L-001", 1);
    despachoPrevio("L-001");
    H.db.lineas[1].status = "anulado";
    await despachar(["L-001"]);
    expect(despachos()).toHaveLength(1);
  });

  it("T2 — una troza sin Trozado no sale", async () => {
    sembrarPlan();
    trozado("L-001", 1);
    const e = await error(despachar(["L-001", "NO-EXISTE"]));
    expect(e.code).toBe("T2_TROZA_SIN_TROZADO");
    expect(e.message).toBe("La troza NO-EXISTE no está registrada en Trozado. Registra el trozado antes de despacharla o consumirla.");
    expect(despachos()).toHaveLength(0);
  });
});

describe("T6 por especie con la suma de la guía", () => {
  it("cada troza cabe sola pero la guía no: rechazo con la especie, lo que despacha y cuánto se pasa", async () => {
    sembrarPlan({ tor: 5 });
    for (const c of ["L-001", "L-002", "L-003"]) trozado(c, 2);
    const e = await error(despachar(["L-001", "L-002", "L-003"]));
    expect(e.code).toBe("T6_EXCESO_AUTORIZADO");
    expect(e.message).toBe(
      "El POA autoriza 5 m³ de Tornillo y ya se movilizaron 0 m³; este despacho de 6 m³ excede lo autorizado en 1 m³. Es la infracción que sanciona OSINFOR.",
    );
    expect(e.detail).toEqual({ species: "Tornillo", autorizado: 5, movilizado: 0, pedido: 6, excesoM3: 1 });
    expect(despachos()).toHaveLength(0);
  });

  it("lo ya despachado cuenta: 2 salieron + 4 de esta guía = 6 de 5", async () => {
    sembrarPlan({ tor: 5 });
    for (const c of ["L-001", "L-002", "L-003"]) trozado(c, 2);
    await despachar(["L-001"], { gtfNumber: "019-001-0000100" });
    const e = await error(despachar(["L-002", "L-003"]));
    expect(e.detail).toEqual({ species: "Tornillo", autorizado: 5, movilizado: 2, pedido: 4, excesoM3: 1 });
  });

  it("justo en el techo pasa (≤, nunca ==)", async () => {
    sembrarPlan({ tor: 6 });
    for (const c of ["L-001", "L-002", "L-003"]) trozado(c, 2);
    await despachar(["L-001", "L-002", "L-003"]);
    expect(despachos()).toHaveLength(3);
  });

  it("dos especies: se mide cada una con lo suyo y el rechazo nombra la que se pasa", async () => {
    sembrarPlan({ tor: 100, cap: 3 });
    trozado("L-001", 2);
    trozado("C-001", 2, { speciesCommon: CAP.comun, speciesScientific: CAP.cientifico });
    trozado("C-002", 2, { speciesCommon: CAP.comun, speciesScientific: CAP.cientifico });
    const e = await error(despachar(["C-001", "C-002", "L-001"]));
    expect(e.detail).toEqual({ species: CAP.comun, autorizado: 3, movilizado: 0, pedido: 4, excesoM3: 1 });
    expect(e.message).toContain("de Capirona");
  });

  it("dos especies que se pasan: UN rechazo que nombra a las dos (no se corrige una y aparece la otra)", async () => {
    sembrarPlan({ tor: 3, cap: 3 });
    trozado("L-001", 2);
    trozado("L-002", 2);
    trozado("C-001", 2, { speciesCommon: CAP.comun, speciesScientific: CAP.cientifico });
    trozado("C-002", 2, { speciesCommon: CAP.comun, speciesScientific: CAP.cientifico });
    const e = await error(despachar(["C-001", "C-002", "L-001", "L-002"]));
    expect(e.code).toBe("T6_EXCESO_AUTORIZADO");
    expect(e.message).toMatch(/^2 especies se pasan de lo autorizado\./);
    expect(e.message).toContain("de Tornillo");
    expect(e.message).toContain("de Capirona");
    expect((e.detail as { especies?: Array<{ species: string; excesoM3: number }> }).especies?.map((x) => x.species).sort()).toEqual(
      [CAP.comun, "Tornillo"].sort(),
    );
    expect(despachos()).toHaveLength(0);
  });

  it("especie sin techo en el plan → no se bloquea", async () => {
    sembrarPlan({ tor: null });
    for (const c of ["L-001", "L-002"]) trozado(c, 50);
    await despachar(["L-001", "L-002"]);
    expect(despachos()).toHaveLength(2);
  });

  it("con `excepcionT6` (importador) anota la especie con lo de antes y la suma: lo mismo que troza por troza", async () => {
    sembrarPlan({ tor: 5 });
    trozado("P-001", 1);
    despachoPrevio("P-001");
    for (const c of ["L-001", "L-002", "L-003"]) trozado(c, 2);
    const excepcion = new Map<string, DespachoT6DeLaEspecie>();
    await despachar(["L-001", "L-002", "L-003"], {}, { excepcionT6: excepcion });
    expect([...excepcion.values()]).toEqual([expect.objectContaining({ especie: "Tornillo", autorizado: 5, antes: 1, despacha: 6 })]);
    expect(despachos()).toHaveLength(3);
  });
});

describe("T7 en la guía", () => {
  it("una troza de una especie fuera del plan frena la guía", async () => {
    sembrarPlan();
    trozado("L-001", 1);
    trozado("X-001", 1, { speciesCommon: "Cedro", speciesScientific: "Cedrela odorata" });
    const e = await error(despachar(["L-001", "X-001"]));
    expect(e.code).toBe("T7_ESPECIE_NO_AUTORIZADA");
    expect(e.detail).toMatchObject({ species: "Cedro", planId: PLAN, momento: "despacho" });
    expect(despachos()).toHaveLength(0);
  });

  it("el plan y su registro se leen UNA vez por guía", async () => {
    sembrarPlan();
    for (let i = 1; i <= 20; i++) trozado(`L-${i}`, 1);
    H.cuenta.porMetodo.clear();
    await despachar(H.db.lineas.map((l) => String(l.trozaCode)));
    // T7 (registro) + T6 (especies del plan): 2, no 2 por troza.
    expect(H.cuenta.porMetodo.get("forestPlanSpecies.findMany")).toBe(2);
  });
});

describe("T3 y T4 del trozado en lote: también contra las anteriores de la misma carga", () => {
  const linea = (trozaCode: string, extra: Fila = {}): Fila => ({ section: "trozado", trozaCode, treeCode: null, volumeM3: 0.5, createdBy: "qa", ...extra });

  it("T3 — un código que ya está en Trozado", async () => {
    trozado("L-001", 1);
    const e = await error(asentarLote([linea("N-001"), linea("L-001")]));
    expect(e.code).toBe("T3_TROZA_DUPLICADA");
    expect(e.message).toBe("La troza L-001 ya está registrada en Trozado (línea #1). Usa un código de troza único.");
  });

  it("T3 — el mismo código dos veces en la carga", async () => {
    const e = await error(asentarLote([linea("N-001"), linea("N-001")]));
    expect(e.code).toBe("T3_TROZA_DUPLICADA");
    expect(e.message).toBe("La troza N-001 va dos veces en estas trozas. Usa un código de troza único.");
    expect(H.db.lineas).toHaveLength(0);
  });

  it("T3 — la placa repetida con el N° de guía, contra la anterior de la misma carga", async () => {
    const e = await error(asentarLote([linea("001-TOR-A", { treeCode: "001-TOR" }), linea("001-tor-a-0123", { treeCode: "001-TOR" })]));
    expect(e.code).toBe("T3_TROZA_DUPLICADA");
    expect(e.message).toBe(
      "La troza 001-tor-a-0123 lleva la placa 001-tor-a, que ya va en esta misma carga (árbol 001-TOR). Una placa no se repite: revisa el código.",
    );
  });

  it("T3 — la placa repetida contra el libro, con su línea", async () => {
    trozado("001-TOR-A-0123", 1, { treeCode: "001-TOR" });
    const e = await error(asentarLote([linea("001-tor-a", { treeCode: "001-TOR" })]));
    expect(e.message).toBe(
      "La troza 001-tor-a ya está en Trozado como 001-TOR-A-0123 (línea #1): es la misma placa con el N° de su guía. Usa la letra que sigue.",
    );
  });

  it("T4 — las trozas del mismo árbol se suman dentro de la carga contra su tala", async () => {
    H.db.lineas.push({ id: "tala-1", tenantId: T, caratulaId: null, planId: PLAN, section: "tala", lineNo: 1, status: "registrado", deletedAt: null, treeCode: "001-TOR", volumeM3: 1 });
    trozado("001-TOR-A", 0.3, { treeCode: "001-TOR" });
    const e = await error(asentarLote([linea("001-TOR-B", { treeCode: "001-TOR", volumeM3: 0.4 }), linea("001-TOR-C", { treeCode: "001-TOR", volumeM3: 0.4 })]));
    expect(e.code).toBe("T4_TROZADO_SUPERA_TALA");
    expect(e.detail).toEqual({ treeCode: "001-TOR", talaVol: 1, yaTrozado: 0.7, nuevo: 0.4 });
  });

  it("sin choques: correlativo seguido después del último del libro", async () => {
    trozado("L-001", 1);
    const creadas = await asentarLote([linea("N-001"), linea("N-002", { treeCode: "002-TOR" })]);
    expect(creadas.map((c) => [c.trozaCode, c.lineNo])).toEqual([["N-001", 2], ["N-002", 3]]);
  });
});
