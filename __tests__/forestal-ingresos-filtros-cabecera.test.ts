/**
 * Autofiltro en la CABECERA de Ingresos (Brandon, 2026-09-26): una columna →
 * su filtro, como Excel.
 *
 * Se evalúa el `where` contra filas de muestra, no sólo su forma (un `where`
 * bien formado que trae filas de más es el bug real):
 *  · cada columna de asiento acota lo que dice (contains sin mayúsculas, días
 *    inclusivos, `docType` vacío = GTF, trozas con/sin, con costo);
 *  · los filtros de la cabecera NO pisan el `OR` de la búsqueda ni el rango
 *    del período (se cruzan);
 *  · estado repetible = OR;
 *  · m³ / piezas comparan contra la SUMA de la guía, y `list` y `listPorGuia`
 *    quedan con el mismo conjunto; cero guías = nada, nunca «todo»;
 *  · otro tenant nunca entra;
 *  · el espejo SQL existe para cada columna y usa placeholders.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;
const OPS = new Set(["equals", "contains", "mode", "in", "notIn", "gte", "lte", "lt", "gt", "not", "some", "none"]);

function cumpleEscalar(v: unknown, cond: unknown): boolean {
  if (cond === null || typeof cond !== "object" || cond instanceof Date) {
    return cond instanceof Date ? v instanceof Date && v.getTime() === cond.getTime() : v === cond;
  }
  const c = cond as Record<string, unknown>;
  for (const k of Object.keys(c)) if (!OPS.has(k)) throw new Error(`operador no soportado: ${k}`);
  const ins = c.mode === "insensitive";
  const norm = (x: unknown) => (ins && typeof x === "string" ? x.toLowerCase() : x);
  const num = (x: unknown) => (x instanceof Date ? x.getTime() : Number(x));
  if ("equals" in c && norm(v) !== norm(c.equals)) return false;
  if ("contains" in c && !(typeof v === "string" && String(norm(v)).includes(String(norm(c.contains))))) return false;
  if ("in" in c && !(c.in as unknown[]).includes(v)) return false;
  if ("notIn" in c && (c.notIn as unknown[]).includes(v)) return false;
  if (("gte" in c || "lt" in c || "lte" in c || "gt" in c) && v == null) return false;
  if ("gte" in c && !(num(v) >= num(c.gte))) return false;
  if ("gt" in c && !(num(v) > num(c.gt))) return false;
  if ("lte" in c && !(num(v) <= num(c.lte))) return false;
  if ("lt" in c && !(num(v) < num(c.lt))) return false;
  if ("not" in c && !(c.not === null ? v != null : v !== c.not)) return false;
  return true;
}

function cumple(fila: Fila, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [k, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (k === "AND") {
      const lista = Array.isArray(cond) ? cond : [cond];
      if (!lista.every((w) => cumple(fila, w as Record<string, unknown>))) return false;
      continue;
    }
    if (k === "OR") {
      if (!(cond as Record<string, unknown>[]).some((w) => cumple(fila, w))) return false;
      continue;
    }
    if (k === "trozas") {
      const c = cond as { some?: object; none?: object };
      const n = (fila.trozas as unknown[]).length;
      if ("some" in c && n === 0) return false;
      if ("none" in c && n > 0) return false;
      continue;
    }
    if (!cumpleEscalar(fila[k], cond)) return false;
  }
  return true;
}

const H = vi.hoisted(() => ({ filas: [] as Record<string, unknown>[] }));

vi.mock("@/lib/prisma", () => {
  const f = (w: Record<string, unknown>) =>
    H.filas.filter((x) => (globalThis as unknown as { __c: typeof cumple }).__c(x, w));
  const dec = (n: number) => ({ toNumber: () => n, valueOf: () => n, toString: () => String(n) });
  return {
    prisma: {
      woodEntry: {
        findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => f(where)),
        count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => f(where).length),
        aggregate: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          const ls = f(where);
          const suma = (c: string) => dec(ls.reduce((a, r) => a + Number(r[c] ?? 0), 0));
          return {
            _count: { _all: ls.length },
            _sum: { volumeM3: suma("volumeM3"), pieces: ls.reduce((a, r) => a + Number(r.pieces), 0), costoTotal: suma("costoTotal") },
          };
        }),
        groupBy: vi.fn(async ({ where, by }: { where: Record<string, unknown>; by: string[] }) => {
          const g = new Map<string, Fila[]>();
          for (const r of f(where)) {
            const k = by.map((c) => String(r[c] ?? "")).join("|");
            g.set(k, [...(g.get(k) ?? []), r]);
          }
          return [...g.values()].map((ls) => ({
            ...Object.fromEntries(by.map((c) => [c, ls[0][c]])),
            _count: { _all: ls.length },
            _sum: {
              volumeM3: dec(ls.reduce((a, r) => a + Number(r.volumeM3), 0)),
              pieces: ls.reduce((a, r) => a + Number(r.pieces), 0),
            },
            _min: {
              entryDate: ls[0].entryDate,
              createdAt: ls[0].createdAt,
              providerName: ls[0].providerName,
              speciesCommonName: ls[0].speciesCommonName,
            },
            _max: { fechaRecepcion: null },
          }));
        }),
      },
      woodEntryTroza: {
        groupBy: vi.fn(async () => []),
        aggregate: vi.fn(async () => ({ _count: { _all: 0, volumenM3: 0 }, _sum: { volumenM3: null } })),
      },
      // Sólo el promedio de días de registro de `stats()` llega acá en estos casos.
      $queryRaw: vi.fn(async () => [{ prom: null, max: null }]),
    },
  };
});
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn() }));

import {
  WoodEntriesDB,
  buildListWhere,
  condicionesCabeceraSql,
  guiaEnTopes,
  rangoDeDias,
} from "@/lib/db/wood-entries.db";

(globalThis as unknown as { __c: typeof cumple }).__c = cumple;

const T = "tenant-blas";
const OTRO = "tenant-otro";
const dia = (s: string) => new Date(`${s}T00:00:00.000Z`);

const asiento = (id: string, x: Partial<Fila> = {}): Fila => ({
  id,
  tenantId: T,
  deletedAt: null,
  status: "validado",
  gtfSeries: null,
  gtfNumber: `GTF-${id}`,
  docType: "GTF",
  serforNumeroRegistro: null,
  originRegion: null,
  originDistrict: null,
  unit: "m3",
  createdBy: "qaadmin",
  validatedBy: null,
  entryDate: dia("2026-09-10"),
  gtfDate: null,
  createdAt: dia("2026-09-10"),
  providerName: "Proveedor",
  speciesCommonName: "Tornillo",
  originCode: null,
  originSourceNumber: null,
  costoTotal: null,
  volumeM3: 1,
  pieces: 1,
  trozas: [],
  ...x,
});

const FILAS: Fila[] = [
  asiento("a1", { gtfNumber: "001-0012345", serforNumeroRegistro: "SNIFFS-778", originRegion: "Ucayali" }),
  asiento("a2", { docType: null, unit: "pt", originDistrict: "Callería", validatedBy: "brandon" }),
  asiento("a3", { docType: "Boleta", entryDate: dia("2026-09-15"), gtfDate: new Date("2026-09-14T10:30:00Z") }),
  asiento("a4", { status: "pendiente", costoTotal: 1200, trozas: [{ id: "t1" }] }),
  asiento("a5", { tenantId: OTRO, gtfNumber: "001-0012345" }),
  // Guías para los topes: G6 = 6 + 6 (12 m³, 30 pz), G8 = 8 m³ sola (5 pz).
  asiento("g6a", { gtfNumber: "G6", speciesCommonName: "Tornillo", volumeM3: 6, pieces: 10 }),
  asiento("g6b", { gtfNumber: "G6", speciesCommonName: "Cachimbo", volumeM3: 6, pieces: 20 }),
  asiento("g8", { gtfNumber: "G8", volumeM3: 8, pieces: 5 }),
];

const idsDe = (w: Record<string, unknown>) => FILAS.filter((f) => cumple(f, w)).map((f) => f.id).sort();

describe("buildListWhere — columnas de asiento de la cabecera", () => {
  it("doc / sniffs / unidad: contains sin mayúsculas", () => {
    expect(idsDe(buildListWhere(T, { cabecera: { doc: "0012345" } }) as Fila)).toEqual(["a1"]);
    expect(idsDe(buildListWhere(T, { cabecera: { sniffs: "sniffs-7" } }) as Fila)).toEqual(["a1"]);
    expect(idsDe(buildListWhere(T, { cabecera: { unidad: "PT" } }) as Fila)).toEqual(["a2"]);
  });

  it("tipo: un docType vacío es una GTF — `gtf` lo trae; `boleta` no", () => {
    const gtf = idsDe(buildListWhere(T, { cabecera: { tipo: "gtf" } }) as Fila);
    expect(gtf).toContain("a2");
    expect(gtf).not.toContain("a3");
    expect(idsDe(buildListWhere(T, { cabecera: { tipo: "bol" } }) as Fila)).toEqual(["a3"]);
  });

  it("origen = región O distrito; registro = quien registró O validó", () => {
    expect(idsDe(buildListWhere(T, { cabecera: { origen: "ucay" } }) as Fila)).toEqual(["a1"]);
    expect(idsDe(buildListWhere(T, { cabecera: { origen: "CALLER" } }) as Fila)).toEqual(["a2"]);
    expect(idsDe(buildListWhere(T, { cabecera: { registro: "BRAND" } }) as Fila)).toEqual(["a2"]);
  });

  it("fechas: días inclusivos, y `hasta` incluye una hora del mismo día", () => {
    const w = buildListWhere(T, { cabecera: { fechaDesde: "2026-09-15", fechaHasta: "2026-09-15" } });
    expect(idsDe(w as Fila)).toEqual(["a3"]);
    const g = buildListWhere(T, { cabecera: { gtfDesde: "2026-09-14", gtfHasta: "2026-09-14" } });
    expect(idsDe(g as Fila)).toEqual(["a3"]);
  });

  it("la fecha de la cabecera se CRUZA con el período, no lo reemplaza", () => {
    const w = buildListWhere(T, {
      fromDate: dia("2026-09-01"),
      toDate: dia("2026-09-12"),
      cabecera: { fechaDesde: "2026-09-14" },
    });
    expect(idsDe(w as Fila)).toEqual([]);
  });

  it("trozas con / sin y con costo", () => {
    expect(idsDe(buildListWhere(T, { cabecera: { trozas: "con" } }) as Fila)).toEqual(["a4"]);
    expect(idsDe(buildListWhere(T, { cabecera: { trozas: "sin" } }) as Fila)).not.toContain("a4");
    expect(idsDe(buildListWhere(T, { cabecera: { conCosto: true } }) as Fila)).toEqual(["a4"]);
  });

  it("estado repetible = OR; uno solo va derecho al campo", () => {
    expect(buildListWhere(T, { status: "pendiente" }).status).toBe("pendiente");
    const w = buildListWhere(T, { status: ["pendiente", "validado"] });
    expect(w.status).toEqual({ in: ["pendiente", "validado"] });
    expect(idsDe(w as Fila)).toHaveLength(7);
  });

  it("NO pisa el OR de la búsqueda libre y otro tenant nunca entra", () => {
    const w = buildListWhere(T, { search: "0012345", cabecera: { doc: "001" } });
    expect(Array.isArray(w.OR) && w.OR.length).toBeGreaterThan(1);
    expect(idsDe(w as Fila)).toEqual(["a1"]);
  });

  it("sin cabecera (o todo vacío) el where es el de siempre", () => {
    expect(buildListWhere(T, { cabecera: { doc: "  ", origen: "" } })).toEqual(buildListWhere(T, {}));
  });
});

describe("rangoDeDias", () => {
  it("un día inválido se ignora, no se corre al mes siguiente", () => {
    expect(rangoDeDias("2026-02-31", "no-es-fecha")).toEqual({});
    expect(rangoDeDias("2026-09-01", "2026-09-30")).toEqual({
      gte: dia("2026-09-01"),
      lt: dia("2026-10-01"),
    });
  });
});

describe("espejo SQL (`buildLateConditions`)", () => {
  it("una condición por cada columna de asiento, con placeholders", () => {
    const cab = {
      doc: "x' OR 1=1 --",
      sniffs: "s",
      tipo: "gtf",
      origen: "o",
      unidad: "u",
      registro: "r",
      fechaDesde: "2026-09-01",
      fechaHasta: "2026-09-02",
      gtfDesde: "2026-09-01",
      gtfHasta: "2026-09-02",
      trozas: "con" as const,
      conCosto: true,
    };
    const sql = condicionesCabeceraSql(cab);
    // 10 columnas; las dos fechas son 2 condiciones cada una (gte + lt).
    expect(sql).toHaveLength(12);
    const texto = sql.map((s) => s.sql).join(" ");
    expect(texto).not.toContain("OR 1=1");
    expect(sql[0].values).toEqual(["%x' OR 1=1 --%"]);
  });
});

describe("topes por GUÍA (Σ m³ / Σ piezas)", () => {
  beforeEach(() => {
    H.filas = FILAS;
  });

  it("guiaEnTopes: inclusivo y un tope ausente = sin tope", () => {
    expect(guiaEnTopes({ volumeM3: 10, pieces: 1 }, { volMin: 10, volMax: 10 })).toBe(true);
    expect(guiaEnTopes({ volumeM3: 9.99, pieces: 1 }, { volMin: 10 })).toBe(false);
    expect(guiaEnTopes({ volumeM3: 1, pieces: 50 }, { pzMax: 49 })).toBe(false);
    expect(guiaEnTopes({ volumeM3: 1, pieces: 1 }, {})).toBe(true);
  });

  it("m³ ≥ 10 trae la guía 6 + 6 ENTERA y deja fuera la de 8", async () => {
    const r = await WoodEntriesDB.listPorGuia(T, { cabecera: { volMin: 10 } });
    expect(r.total).toBe(1);
    expect(r.lineas).toBe(2);
    const l = await WoodEntriesDB.list(T, { cabecera: { volMin: 10 } });
    expect(l.entries.map((e) => e.id).sort()).toEqual(["g6a", "g6b"]);
  });

  it("piezas ≤ 5 compara la suma: G8 (5) sí, G6 (30) no", async () => {
    const r = await WoodEntriesDB.list(T, { cabecera: { pzMin: 5, pzMax: 5 } });
    expect(r.entries.map((e) => e.id)).toEqual(["g8"]);
  });

  it("la suma es la de lo que muestra la tabla: con especie Tornillo, G6 suma 6", async () => {
    const r = await WoodEntriesDB.list(T, { speciesCommonName: "Tornillo", cabecera: { volMin: 10 } });
    expect(r.total).toBe(0);
  });

  it("cero guías = nada (no «sin filtro»)", async () => {
    const r = await WoodEntriesDB.listPorGuia(T, { cabecera: { volMin: 1000 } });
    expect(r).toEqual({ guias: [], total: 0, lineas: 0 });
    const l = await WoodEntriesDB.list(T, { cabecera: { volMin: 1000 } });
    expect(l.total).toBe(0);
  });

  it("otro tenant no aporta a la suma ni entra", async () => {
    const r = await WoodEntriesDB.list(T, { cabecera: { doc: "0012345", volMin: 0 } });
    expect(r.entries.map((e) => e.id)).toEqual(["a1"]);
  });
});

describe("facetas con topes por guía: la faceta se excluye a sí misma", () => {
  it("especie Tornillo + m³ ≥ 10 → el desplegable de especies ofrece más de una", async () => {
    // G11: una guía de Tornillo sola que SÍ pasa el tope con el filtro puesto.
    H.filas = [...FILAS, asiento("g11", { gtfNumber: "G11", volumeM3: 11, pieces: 3 })];
    const st = await WoodEntriesDB.stats(T, { speciesCommonName: ["Tornillo"], cabecera: { volMin: 10 } });
    // La tabla: sólo G11 (G6 suma 6 de Tornillo).
    expect(st.totalCount).toBe(1);
    // La faceta: sin el filtro de especie, G6 (12 m³) también pasa y trae Cachimbo.
    expect(st.species.map((x) => x.value).sort()).toEqual(["Cachimbo", "Tornillo"]);
  });
});
