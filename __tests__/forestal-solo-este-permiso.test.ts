/**
 * «Solo este permiso» (radar 2026-09-19, ADR-421): el interruptor de la banda
 * acota las listas del Libro CTP al contrato activo, y el filtro lo hace el
 * SERVIDOR con `?contratoId=`.
 *
 * Lo que se fija acá, sobre filas de muestra y no sólo sobre la forma del
 * `where` (un `where` bien formado que trae filas de más es el bug real):
 *  · con filtro → sólo las filas del contrato, incluida la producción y el
 *    despacho que HEREDAN el permiso de la madera (sin `contratoId` propio);
 *  · sin filtro → todas las del tenant, exactamente como antes;
 *  · otro tenant → nunca, aunque su fila tenga el MISMO id de contrato o la
 *    corrida apunte a madera ajena;
 *  · el parámetro: vacío = sin filtro, malformado = error (no «todo» en silencio).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Un evaluador mínimo de `where` de Prisma sobre objetos en memoria ──────
// Cubre sólo los operadores que usan estos filtros; uno desconocido revienta,
// para que el test no apruebe por no entender la condición.

type Fila = Record<string, unknown>;
const OPS = new Set(["equals", "contains", "mode", "in", "notIn", "gt", "gte", "lt", "lte", "not"]);

function cumpleEscalar(v: unknown, cond: unknown): boolean {
  if (cond === null || typeof cond !== "object" || cond instanceof Date) {
    return cond instanceof Date ? v instanceof Date && v.getTime() === cond.getTime() : v === cond;
  }
  const c = cond as Record<string, unknown>;
  for (const k of Object.keys(c)) if (!OPS.has(k)) throw new Error(`operador no soportado: ${k}`);
  const ins = c.mode === "insensitive";
  const norm = (x: unknown) => (ins && typeof x === "string" ? x.toLowerCase() : x);
  if ("equals" in c && norm(v) !== norm(c.equals)) return false;
  if ("contains" in c && !(typeof v === "string" && String(norm(v)).includes(String(norm(c.contains))))) return false;
  if ("in" in c && !(c.in as unknown[]).includes(v)) return false;
  if ("notIn" in c && (c.notIn as unknown[]).includes(v)) return false;
  if ("gt" in c && !(Number(v) > Number(c.gt))) return false;
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
    const v = fila[k];
    if (Array.isArray(v)) {
      // relación a muchos: sólo `some`
      const c = cond as { some?: Record<string, unknown> };
      if (!c.some) throw new Error(`relación ${k} sin some`);
      if (!v.some((hijo) => cumple(hijo as Fila, c.some))) return false;
      continue;
    }
    if (v !== null && typeof v === "object" && !(v instanceof Date)) {
      // relación a uno: `where` anidado
      if (!cumple(v as Fila, cond as Record<string, unknown>)) return false;
      continue;
    }
    if (!cumpleEscalar(v, cond)) return false;
  }
  return true;
}

// ─── Datos de muestra ────────────────────────────────────────────────────────

const T = "tenant-blas";
const OTRO = "tenant-otro";
const C1 = "ctr_hua_007";
const C2 = "ctr_sec_plt";

const ingreso = (id: string, tenantId: string, contratoId: string | null): Fila => ({
  id,
  tenantId,
  contratoId,
  deletedAt: null,
  status: "validado",
  gtfNumber: `GTF-${id}`,
  providerName: "Proveedor",
  speciesCommonName: "Tornillo",
  originCode: contratoId === C1 ? "10-HUA-PUE/PER-FMP-2026-007" : null,
});

const w1 = ingreso("w1", T, C1);
const w2 = ingreso("w2", T, C2);
const w3 = ingreso("w3", OTRO, C1); // otro negocio, MISMO id de contrato
const w4 = ingreso("w4", T, null);
const INGRESOS = [w1, w2, w3, w4];

const linea = (
  id: string,
  x: Partial<{
    tenantId: string;
    section: string;
    contratoId: string | null;
    consumos: Fila[];
    trozasConsumidas: Fila[];
    trozasDespachadas: Fila[];
    origenes: Fila[];
  }>,
): Fila => ({
  id,
  tenantId: x.tenantId ?? T,
  section: x.section ?? "produccion",
  contratoId: x.contratoId ?? null,
  deletedAt: null,
  status: "registrado",
  consumos: x.consumos ?? [],
  trozasConsumidas: x.trozasConsumidas ?? [],
  trozasDespachadas: x.trozasDespachadas ?? [],
  origenes: x.origenes ?? [],
});

const consumoDe = (w: Fila): Fila => ({ tenantId: w.tenantId, woodEntry: w });
const trozaDe = (w: Fila): Fila => ({ tenantId: w.tenantId, entry: w });

const p1 = linea("p1", { contratoId: C1 }); // atada a mano
const p2 = linea("p2", { consumos: [consumoDe(w1)] }); // hereda C1 por consumo
const p3 = linea("p3", { consumos: [consumoDe(w2)] }); // hereda C2
const p4 = linea("p4", { trozasConsumidas: [trozaDe(w1)] }); // hereda C1 por troza
const p5 = linea("p5", { consumos: [consumoDe(w4)] }); // madera sin contrato
const d1 = linea("d1", { section: "despacho", origenes: [{ tenantId: T, produccion: p2 }] });
const d2 = linea("d2", { section: "despacho", origenes: [{ tenantId: T, produccion: p3 }] });
const d3 = linea("d3", { section: "despacho", trozasDespachadas: [trozaDe(w1)] });
const x1 = linea("x1", { tenantId: OTRO, contratoId: C1 }); // otro tenant, mismo id
// Adversarial: fila de T colgada de madera de OTRO con el mismo id de contrato.
const x2 = linea("x2", { consumos: [{ tenantId: OTRO, woodEntry: w3 }] });
const LINEAS = [p1, p2, p3, p4, p5, d1, d2, d3, x1, x2];

const ids = (filas: Fila[]) => filas.map((f) => f.id).sort();

// ─── Mocks para las DB classes ──────────────────────────────────────────────

const H = vi.hoisted(() => ({ lineas: [] as Record<string, unknown>[], wheres: [] as unknown[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => {
  const filtrar = (where: Record<string, unknown>) => {
    H.wheres.push(where);
    return H.lineas.filter((f) => cumpleRef(f, where));
  };
  // `cumple` se define más abajo; el mock se evalúa antes (hoisting), así que
  // la referencia se resuelve al llamar.
  const cumpleRef = (f: Record<string, unknown>, w: Record<string, unknown>) =>
    (globalThis as unknown as { __cumple: typeof cumple }).__cumple(f, w);
  return {
    prisma: {
      forestCtpEntry: {
        findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => filtrar(where)),
        count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => filtrar(where).length),
      },
      forestCtpDespachoOrigen: { groupBy: vi.fn(async () => []) },
    },
  };
});
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn() }));
vi.mock("@/lib/db/forest-ctp-saldo-corrida", () => ({ saldosDeCorridas: vi.fn(async () => new Map()) }));

(globalThis as unknown as { __cumple: typeof cumple }).__cumple = cumple;

import { ForestCtpDB, whereCtpDelContrato } from "@/lib/db/forest-ctp.db";
import { buildListWhere } from "@/lib/db/wood-entries.db";
import { conContratoId, leerContratoId } from "@/lib/forestal/contrato-filtro";

beforeEach(() => {
  H.lineas = LINEAS;
  H.wheres = [];
});

// ─── Ingresos / GTF ingresadas (WoodEntry) ──────────────────────────────────

describe("Ingresos — buildListWhere con contratoId", () => {
  it("con filtro → sólo los ingresos atados a ese contrato", () => {
    const w = buildListWhere(T, { contratoId: C1 });
    expect(ids(INGRESOS.filter((f) => cumple(f, w as Record<string, unknown>)))).toEqual(["w1"]);
  });

  it("sin filtro → todos los del tenant, como antes", () => {
    const w = buildListWhere(T, {});
    expect(w.contratoId).toBeUndefined();
    expect(ids(INGRESOS.filter((f) => cumple(f, w as Record<string, unknown>)))).toEqual(["w1", "w2", "w4"]);
  });

  it("otro tenant → nunca, aunque su ingreso tenga el mismo id de contrato", () => {
    const w = buildListWhere(T, { contratoId: C1 });
    expect(cumple(w3, w as Record<string, unknown>)).toBe(false);
    expect(ids(INGRESOS.filter((f) => cumple(f, buildListWhere(OTRO, { contratoId: C1 }) as Record<string, unknown>)))).toEqual(["w3"]);
  });

  it("no toca el AND ni el OR de la búsqueda (stats recorta el AND por posición)", () => {
    const w = buildListWhere(T, { contratoId: C1, search: "GTF", speciesCommonName: ["Tornillo", "Cachimbo"] });
    expect(w.contratoId).toBe(C1);
    expect(Array.isArray(w.AND) && w.AND).toHaveLength(1);
    expect(Array.isArray(w.OR) && w.OR.length).toBeGreaterThan(1);
    expect(buildListWhere(T, { speciesCommonName: ["Tornillo", "Cachimbo"] }).AND).toEqual(w.AND);
  });
});

// ─── Producción / Despacho / Disponibles (ForestCtpEntry) ───────────────────

describe("whereCtpDelContrato — atado o heredado", () => {
  const delContrato = (tenantId: string, contratoId: string) =>
    ids(
      LINEAS.filter((f) =>
        cumple(f, { tenantId, deletedAt: null, AND: [whereCtpDelContrato(tenantId, contratoId)] } as Record<
          string,
          unknown
        >),
      ),
    );

  it("con filtro → la atada, la que consumió su madera (guía o troza) y los despachos de ellas", () => {
    expect(delContrato(T, C1)).toEqual(["d1", "d3", "p1", "p2", "p4"]);
    expect(delContrato(T, C2)).toEqual(["d2", "p3"]);
  });

  it("otro tenant → nunca: ni su fila con el mismo id, ni madera ajena colgada de una fila propia", () => {
    expect(delContrato(T, C1)).not.toContain("x1");
    expect(delContrato(T, C1)).not.toContain("x2");
    expect(delContrato(OTRO, C1)).toEqual(["x1"]);
  });

  it("un contrato que no existe no trae nada (no degrada a «todo»)", () => {
    expect(delContrato(T, "ctr_inexistente")).toEqual([]);
  });
});

describe("ForestCtpDB.list — el filtro llega a la base", () => {
  it("despacho con filtro → sólo los despachos del contrato", async () => {
    const r = await ForestCtpDB.list(T, { section: "despacho", contratoId: C1 });
    expect(ids(r.entries as Fila[])).toEqual(["d1", "d3"]);
    expect(r.total).toBe(2);
  });

  it("despacho sin filtro → todos los del tenant, y el where no lleva AND de contrato", async () => {
    const r = await ForestCtpDB.list(T, { section: "despacho" });
    expect(ids(r.entries as Fila[])).toEqual(["d1", "d2", "d3"]);
    expect((H.wheres[0] as Record<string, unknown>).AND).toBeUndefined();
  });

  it("el contrato va en AND y no pisa el OR de la búsqueda", async () => {
    await ForestCtpDB.list(T, { section: "despacho", contratoId: C1, search: "tornillo" });
    const w = H.wheres[0] as Record<string, unknown>;
    expect(Array.isArray(w.OR)).toBe(true);
    expect(w.AND).toEqual([whereCtpDelContrato(T, C1)]);
    expect(w.tenantId).toBe(T);
  });

  it("otro tenant pidiendo el mismo id → ninguno de los despachos de Blas", async () => {
    const r = await ForestCtpDB.list(OTRO, { section: "despacho", contratoId: C1 });
    expect(r.entries).toEqual([]);
    expect(r.total).toBe(0);
  });
});

// ─── El parámetro de la URL ─────────────────────────────────────────────────

describe("?contratoId= — lectura y armado", () => {
  it("ausente o vacío = sin filtro", () => {
    expect(leerContratoId(new URLSearchParams())).toEqual({ ok: true, contratoId: undefined });
    expect(leerContratoId(new URLSearchParams("contratoId="))).toEqual({ ok: true, contratoId: undefined });
  });

  it("un cuid válido pasa tal cual", () => {
    expect(leerContratoId(new URLSearchParams(`contratoId=${C1}`))).toEqual({ ok: true, contratoId: C1 });
  });

  it("malformado = error, nunca «todo» en silencio", () => {
    for (const malo of ["x' OR 1=1--", "a".repeat(65), "ctr/../otro", "id con espacio"]) {
      expect(leerContratoId(new URLSearchParams({ contratoId: malo })).ok).toBe(false);
    }
  });

  it("el cliente sólo agrega el parámetro si hay contrato", () => {
    expect(conContratoId(new URLSearchParams("a=1"), null).toString()).toBe("a=1");
    expect(conContratoId(new URLSearchParams("a=1"), C1).get("contratoId")).toBe(C1);
  });
});
