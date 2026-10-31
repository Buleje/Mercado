/**
 * ADR-504 · `WoodEntriesDB.buscarTrozaPorCodigo` ya no devuelve «la primera»:
 * en Blas 24 codificaciones SERFOR están en dos permisos (y 5 de ellas, en dos
 * guías del MISMO permiso). Devuelve `una | ninguna | varias` y se acota con el
 * permiso del ingreso o con sus ingresos (`ambito`).
 *
 * Y `GtfNumeroDB.resolverGuia`: la guía de una `GuiaRef` (N° + permiso) en la
 * base, con la misma regla pura que el import (`resolverGuiaEntre`).
 *
 * Base simulada: un evaluador mínimo del `where` que usa el método; un operador
 * desconocido revienta, para que el test no apruebe por no entenderlo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;

function cumple(fila: Fila, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [k, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (k === "OR") {
      if (!(cond as Record<string, unknown>[]).some((w) => cumple(fila, w))) return false;
      continue;
    }
    const v = fila[k];
    if (cond !== null && typeof cond === "object") {
      const c = cond as Record<string, unknown>;
      if ("equals" in c) {
        if (c.mode !== "insensitive") throw new Error("equals sin mode insensitive");
        if (typeof v !== "string" || v.toLowerCase() !== String(c.equals).toLowerCase()) return false;
        continue;
      }
      if ("endsWith" in c) {
        if (typeof v !== "string" || !v.toLowerCase().endsWith(String(c.endsWith).toLowerCase())) return false;
        continue;
      }
      if ("in" in c || "notIn" in c) {
        if ("in" in c && !(c.in as unknown[]).includes(v)) return false;
        if ("notIn" in c && (c.notIn as unknown[]).includes(v)) return false;
        continue;
      }
      if (v === null || typeof v !== "object") return false;
      if (!cumple(v as Fila, c)) return false;
      continue;
    }
    if (v !== cond) return false;
  }
  return true;
}

const H = vi.hoisted(() => ({ trozas: [] as Record<string, unknown>[], args: [] as Record<string, unknown>[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    woodEntryTroza: {
      findMany: vi.fn(async (args: { where: Record<string, unknown>; take?: number }) => {
        H.args.push(args);
        const f = (globalThis as unknown as { __cumple: typeof cumple }).__cumple;
        return H.trozas.filter((t) => f(t, args.where)).slice(0, args.take ?? Infinity);
      }),
    },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn(), m3: (n: number) => n }));

(globalThis as unknown as { __cumple: typeof cumple }).__cumple = cumple;

import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { GtfNumeroDB } from "@/lib/db/gtf-numero.db";

const T = "tenant-blas";
const entry = (id: string, contratoId: string | null, gtfNumber: string, extra: Fila = {}): Fila => ({
  id,
  contratoId,
  gtfNumber,
  libroNro: null,
  originCode: contratoId ? `PERMISO-${contratoId}` : null,
  deletedAt: null,
  ...extra,
});
const troza = (id: string, e: Fila, codificacion: string | null, extra: Fila = {}): Fila => ({
  id,
  tenantId: T,
  woodEntryId: e.id,
  codificacion,
  codigoPlanta: null,
  volumenM3: null,
  consumidaEnId: null,
  trozaOrigenId: null,
  noRecepcionada: false,
  retrozos: [],
  entry: e,
  ...extra,
});

const P1 = entry("w1", "c1", "019-001-0000004");
const P1b = entry("w1b", "c1", "019-001-0000009");
const P2 = entry("w2", "c2", "019-001-0000004");
const SIN = entry("w0", null, "019-001-0000007");

beforeEach(() => {
  H.args = [];
  H.trozas = [
    troza("t1", P1, "12"),
    troza("t2", P2, "12"),
    troza("t3", P1, "13/a"),
    troza("t4", SIN, "77"),
    troza("t5", P1, null, { codigoPlanta: "B-20" }),
    troza("t6", P1b, "12"),
    troza("tx", entry("wx", "c1", "019-001-0000004"), "12", { tenantId: "tenant-otro" }),
    troza("td", entry("wd", "c1", "019-001-0000004", { deletedAt: new Date() }), "12"),
  ];
});

describe("ADR-504 · buscarTrozaPorCodigo", () => {
  it("una: el código está en una sola troza viva del negocio (codificación o código de planta, sin mayúsculas)", async () => {
    expect(await WoodEntriesDB.buscarTrozaPorCodigo(T, " 13/A ")).toMatchObject({ estado: "una", troza: { id: "t3" } });
    expect(await WoodEntriesDB.buscarTrozaPorCodigo(T, "b-20")).toMatchObject({ estado: "una", troza: { id: "t5", entry: { contratoId: "c1" } } });
  });

  it("varias: «12» en dos permisos y en dos guías del mismo permiso → todas, nunca la primera (ni la de otro negocio ni la borrada)", async () => {
    const r = await WoodEntriesDB.buscarTrozaPorCodigo(T, "12");
    expect(r.estado).toBe("varias");
    expect(r.estado === "varias" && r.trozas.map((t) => t.id)).toEqual(["t1", "t2", "t6"]);
  });

  it("ámbito por permiso: P2 reduce a una; P1 sigue en dos guías; null = sólo las sin permiso", async () => {
    expect(await WoodEntriesDB.buscarTrozaPorCodigo(T, "12", { contratoId: "c2" })).toMatchObject({ estado: "una", troza: { id: "t2" } });
    const p1 = await WoodEntriesDB.buscarTrozaPorCodigo(T, "12", { contratoId: "c1" });
    expect(p1.estado === "varias" && p1.trozas.map((t) => t.entry.gtfNumber)).toEqual(["019-001-0000004", "019-001-0000009"]);
    expect(await WoodEntriesDB.buscarTrozaPorCodigo(T, "12", { contratoId: null })).toEqual({ estado: "ninguna" });
    expect(await WoodEntriesDB.buscarTrozaPorCodigo(T, "77", { contratoId: null })).toMatchObject({ estado: "una", troza: { id: "t4" } });
  });

  it("ámbito por ingresos: la guía elegida decide; lista vacía = ninguna sin ir a la base", async () => {
    expect(await WoodEntriesDB.buscarTrozaPorCodigo(T, "12", { woodEntryIds: ["w1b"] })).toMatchObject({ estado: "una", troza: { id: "t6" } });
    expect(await WoodEntriesDB.buscarTrozaPorCodigo(T, "12", { woodEntryIds: [] })).toEqual({ estado: "ninguna" });
    expect(await WoodEntriesDB.buscarTrozaPorCodigo(T, "  ")).toEqual({ estado: "ninguna" });
    expect(H.args).toHaveLength(1);
  });

  it("el WHERE lleva el negocio y el tope (no trae el patio entero)", async () => {
    await WoodEntriesDB.buscarTrozaPorCodigo(T, "12", { contratoId: "c1" });
    expect(H.args[0]).toMatchObject({ where: { tenantId: T, entry: { deletedAt: null, contratoId: "c1" } }, take: 20 });
    await expect(WoodEntriesDB.buscarTrozaPorCodigo("", "12")).rejects.toThrow("tenantId");
  });
});

describe("ADR-504 · GtfNumeroDB.resolverGuia", () => {
  const vivos = [
    { id: "w1", libroNro: 4, gtfNumber: "019-001-0000004", serforNumeroRegistro: null, speciesCommonName: "Tornillo", originCode: "P-1", providerName: "CCNN SAN LUIS", contratoId: "c1", status: "validado", deletedAt: null, tenantId: T },
    { id: "w2", libroNro: 5, gtfNumber: "019-001-0000004", serforNumeroRegistro: null, speciesCommonName: "Tornillo", originCode: "P-2", providerName: "CCNN SAN LUIS", contratoId: "c2", status: "validado", deletedAt: null, tenantId: T },
    { id: "wa", libroNro: 6, gtfNumber: "019-001-0000004", serforNumeroRegistro: null, speciesCommonName: "Tornillo", originCode: "P-3", providerName: "CCNN SAN LUIS", contratoId: "c3", status: "anulado", deletedAt: null, tenantId: T },
  ];
  const db = {
    woodEntry: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => vivos.filter((v) => cumple(v, where))),
    },
  } as unknown as Parameters<typeof GtfNumeroDB.resolverGuia>[0];

  it("con permiso: la de ese permiso; uno anulado no cuenta", async () => {
    expect(await GtfNumeroDB.resolverGuia(db, T, { gtfNumber: "19-1-4", contratoId: "c2" })).toMatchObject({ estado: "una", guia: { ingresoIds: ["w2"] } });
    expect(await GtfNumeroDB.resolverGuia(db, T, { gtfNumber: "19-1-4", contratoId: "c3" })).toEqual({ estado: "ninguna" });
  });

  it("sin permiso y dos talonarios con ese N°: ambigua con las dos candidatas", async () => {
    const r = await GtfNumeroDB.resolverGuia(db, T, { gtfNumber: "019-001-0000004", contratoId: null });
    expect(r.estado).toBe("ambigua");
    expect(r.estado === "ambigua" && r.candidatas.map((c) => c.contratoId).sort()).toEqual(["c1", "c2"]);
  });
});
