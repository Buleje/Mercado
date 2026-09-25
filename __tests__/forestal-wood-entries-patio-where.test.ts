/**
 * `WoodEntriesDB.trozasDelPatio` / `contarTrozasDelPatio` con `contratoId`
 * (ADR-431): qué filas trae el `where`, no sólo su forma.
 *
 * Un `where` bien formado que trae filas de más es el bug real, así que se
 * evalúa contra piezas de muestra:
 *  · con filtro → sólo las piezas de guías atadas a ESE contrato;
 *  · sin filtro → todas las del tenant, exactamente como antes;
 *  · otro tenant → nunca, aunque su guía tenga el MISMO id de contrato;
 *  · la lista y el conteo filtran IGUAL (si no, «hay N y ves M» miente);
 *  · el mapeo publica `diametroCm` y `guiaCites` (derivado de la guía).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;

/* Evaluador mínimo de `where` de Prisma: sólo los operadores que usa el patio.
   Uno desconocido revienta, para que el test no apruebe por no entenderlo. */
function cumple(fila: Fila, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [k, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    const v = fila[k];
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>;
      if ("notIn" in c || "in" in c) {
        for (const op of Object.keys(c)) if (op !== "notIn" && op !== "in") throw new Error(`operador ${op}`);
        if ("notIn" in c && (c.notIn as unknown[]).includes(v)) return false;
        if ("in" in c && !(c.in as unknown[]).includes(v)) return false;
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

const H = vi.hoisted(() => ({ filas: [] as Record<string, unknown>[], wheres: [] as unknown[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => {
  const filtrar = (where: Record<string, unknown>) => {
    H.wheres.push(where);
    const f = (globalThis as unknown as { __cumple: (a: Fila, b: Record<string, unknown>) => boolean }).__cumple;
    return H.filas.filter((x) => f(x, where));
  };
  return {
    prisma: {
      woodEntryTroza: {
        findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => filtrar(where)),
        count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => filtrar(where).length),
      },
      forestCtpConsumo: { groupBy: vi.fn(async () => []) },
    },
  };
});
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn(), m3: (n: number) => n }));

(globalThis as unknown as { __cumple: typeof cumple }).__cumple = cumple;

import { WoodEntriesDB } from "@/lib/db/wood-entries.db";

const T = "tenant-blas";
const OTRO = "tenant-otro";
const C1 = "ctr_hua_007";
const C2 = "ctr_sec_plt";

const guia = (id: string, tenantId: string, contratoId: string | null, extra: Fila = {}): Fila => ({
  id,
  tenantId,
  contratoId,
  deletedAt: null,
  status: "validado",
  gtfNumber: `GTF-${id}`,
  providerName: "Proveedor",
  entryDate: new Date("2026-09-08T05:00:00.000Z"),
  fechaRecepcion: new Date("2026-09-11T05:00:00.000Z"),
  originCode: contratoId === C1 ? "10-HUA-PUE/PER-FMP-2026-007" : "19-SEC/REG-PLT-2021-017",
  originSourceNumber: null,
  serforNumeroRegistro: null,
  volumeM3: 10,
  speciesCites: false,
  ...extra,
});

const troza = (id: string, entry: Fila, extra: Fila = {}): Fila => ({
  id,
  tenantId: entry.tenantId,
  woodEntryId: entry.id,
  entry,
  loteAserrioId: null,
  loteAserrio: null,
  codificacion: id,
  codigoPlanta: null,
  parcela: null,
  especieComun: "Tornillo",
  especieCientifica: null,
  dimensiones: null,
  d1Cm: null,
  d2Cm: null,
  diametroCm: null,
  largoM: 4,
  volumenM3: 1.5,
  fechaRecepcion: null,
  noRecepcionada: false,
  descarte: false,
  trozaOrigenId: null,
  consumidaEnId: null,
  consumidaEn: null,
  despachadaEnId: null,
  despachadaEn: null,
  _count: { retrozos: 0 },
  ...extra,
});

const g1 = guia("w1", T, C1, { speciesCites: true });
const g2 = guia("w2", T, C2);
const g3 = guia("w3", OTRO, C1); // otro negocio, MISMO id de contrato
const g4 = guia("w4", T, null);
const gAnulada = guia("w5", T, C1, { status: "anulado" });

const FILAS = [
  troza("t1", g1, { diametroCm: 42.5 }),
  troza("t2", g1, { loteAserrioId: "LA-1" }),
  troza("t3", g2),
  troza("t4", g3),
  troza("t5", g4),
  troza("t6", gAnulada),
];
const ids = (xs: { id: unknown }[]) => xs.map((x) => String(x.id)).sort();

beforeEach(() => {
  H.filas = FILAS;
  H.wheres = [];
});

describe("trozasDelPatio / contarTrozasDelPatio — «Solo este permiso»", () => {
  it("con filtro → sólo las piezas de guías atadas a ese contrato (y vivas)", async () => {
    expect(ids(await WoodEntriesDB.trozasDelPatio(T, { contratoId: C1 }))).toEqual(["t1", "t2"]);
    expect(await WoodEntriesDB.contarTrozasDelPatio(T, { contratoId: C1 })).toBe(2);
  });

  it("sin filtro → todas las del tenant, como antes (la anulada sigue fuera)", async () => {
    expect(ids(await WoodEntriesDB.trozasDelPatio(T))).toEqual(["t1", "t2", "t3", "t5"]);
    expect(await WoodEntriesDB.contarTrozasDelPatio(T)).toBe(4);
    const w = H.wheres[0] as { entry: Record<string, unknown> };
    expect(w.entry).not.toHaveProperty("contratoId");
  });

  it("otro tenant → nunca, aunque su guía tenga el MISMO id de contrato", async () => {
    const mias = await WoodEntriesDB.trozasDelPatio(T, { contratoId: C1 });
    expect(mias.map((t) => t.id)).not.toContain("t4");
    expect(ids(await WoodEntriesDB.trozasDelPatio(OTRO, { contratoId: C1 }))).toEqual(["t4"]);
  });

  it("un contrato de otro tenant (id ajeno) → lista vacía y total 0, no un error", async () => {
    expect(await WoodEntriesDB.trozasDelPatio(OTRO, { contratoId: C2 })).toEqual([]);
    expect(await WoodEntriesDB.contarTrozasDelPatio(OTRO, { contratoId: C2 })).toBe(0);
  });

  it("tenantId va en la RAÍZ del where; contratoId sólo dentro de entry y sólo si viene", async () => {
    await WoodEntriesDB.trozasDelPatio(T, { contratoId: C1, loteId: "LA-1" });
    const w = H.wheres[0] as Record<string, unknown> & { entry: Record<string, unknown> };
    expect(w.tenantId).toBe(T);
    expect(w.loteAserrioId).toBe("LA-1");
    expect(w.entry.contratoId).toBe(C1);
    expect(w).not.toHaveProperty("contratoId");
  });

  it("loteId + contratoId = AND", async () => {
    expect(ids(await WoodEntriesDB.trozasDelPatio(T, { contratoId: C1, loteId: "LA-1" }))).toEqual(["t2"]);
    expect(await WoodEntriesDB.trozasDelPatio(T, { contratoId: C2, loteId: "LA-1" })).toEqual([]);
  });

  it("la lista y el conteo usan el MISMO where", async () => {
    await WoodEntriesDB.trozasDelPatio(T, { contratoId: C2 });
    await WoodEntriesDB.contarTrozasDelPatio(T, { contratoId: C2 });
    expect(H.wheres[0]).toEqual(H.wheres[1]);
  });

  it("sin tenantId lanza, nunca cae a un tenant por defecto", async () => {
    await expect(WoodEntriesDB.trozasDelPatio("", { contratoId: C1 })).rejects.toThrow(/tenantId/);
    await expect(WoodEntriesDB.contarTrozasDelPatio("", { contratoId: C1 })).rejects.toThrow(/tenantId/);
  });
});

describe("trozasComoConsumibles — diámetro y guía CITES", () => {
  it("publica diametroCm de la troza y guiaCites de la GUÍA", async () => {
    const r = await WoodEntriesDB.trozasComoConsumibles(T, { contratoId: C1 });
    const t1 = r.find((t) => t.id === "t1");
    const t2 = r.find((t) => t.id === "t2");
    expect(t1).toMatchObject({ diametroCm: 42.5, guiaCites: true, permiso: "10-HUA-PUE/PER-FMP-2026-007" });
    expect(t2).toMatchObject({ diametroCm: null, guiaCites: true, loteAserrioId: "LA-1" });
  });

  it("una guía sin CITES da guiaCites=false, y el filtro por contrato llega al mapeo", async () => {
    const r = await WoodEntriesDB.trozasComoConsumibles(T, { contratoId: C2 });
    expect(r.map((t) => [t.id, t.guiaCites])).toEqual([["t3", false]]);
  });
});
