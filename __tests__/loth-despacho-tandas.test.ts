// @vitest-environment node
/**
 * Tests — `ForestLothDespachoDB` (08-10).
 *
 *   · `trozadosDeCodigos` pide de a 2000 códigos (antes cortaba en 2000 y lo
 *     demás salía sin medidas): `m3Despachado` de 4500 despachos suma los 4500.
 *   · `guiaPublica`: la guía de una línea de despacho, sólo sus vigentes, con
 *     las medidas de SU trozado (mismo permiso); anulada entera → `anulada`.
 *     Otra sección o sin N° de guía → null.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Where = Record<string, unknown> & { section?: string; trozaCode?: { in: string[] }; id?: string };

const trozado = (code: string, planId = "plan-1", vol = "0.5000") => ({
  id: `t-${code}-${planId}`,
  planId,
  trozaCode: code,
  lineNo: 1,
  status: "registrado",
  createdAt: new Date("2025-10-09T00:00:00Z"),
  treeCode: code,
  speciesCommon: "Tornillo",
  speciesScientific: "Cedrelinga cateniformis",
  cites: false,
  diamMayorM: "0.60",
  diamMenorM: "0.50",
  lengthM: "4.00",
  volumeM3: vol,
});

const despacho = (code: string, over: Record<string, unknown> = {}) => ({
  section: "despacho_troza",
  status: "registrado",
  entryDate: new Date("2025-10-09T00:00:00Z"),
  planId: "plan-1",
  trozaCode: code,
  treeCode: null,
  speciesCommon: null,
  speciesScientific: null,
  cites: false,
  diamMayorM: null,
  diamMenorM: null,
  lengthM: null,
  volumeM3: null,
  ...over,
});

const findMany = vi.fn();
const findFirst = vi.fn();
const planFindFirst = vi.fn();

beforeEach(() => {
  vi.resetModules();
  findMany.mockReset();
  findFirst.mockReset();
  planFindFirst.mockReset();
  vi.doMock("@/lib/prisma", () => ({
    prisma: { forestLothEntry: { findMany, findFirst }, forestPlan: { findFirst: planFindFirst } },
  }));
});

describe("trozadosDeCodigos en tandas", () => {
  it("m3Despachado con 4500 despachos: tres tandas (2000/2000/500) y suma todo", async () => {
    const codigos = Array.from({ length: 4500 }, (_, i) => `${i}-TOR-A`);
    findMany.mockImplementation(async ({ where }: { where: Where & { AND?: unknown } }) => {
      if (where.AND) return codigos.map((c) => ({ planId: "plan-1", trozaCode: c }));
      return (where.trozaCode?.in ?? []).map((c) => trozado(c));
    });
    const { ForestLothDespachoDB } = await import("@/lib/db/forest-loth-despacho.db");
    const m3 = await ForestLothDespachoDB.m3Despachado("t-qa", { tenantId: "t-qa" });
    const tandas = findMany.mock.calls
      .map((c) => (c[0] as { where: Where }).where.trozaCode?.in.length)
      .filter((n): n is number => n != null);
    expect(tandas).toEqual([2000, 2000, 500]);
    expect(m3).toBe(2250);
  });
});

describe("guiaPublica", () => {
  it("vigentes con las medidas de su trozado; las anuladas no van; el total suma lo medido", async () => {
    findFirst.mockResolvedValue({ planId: "plan-1", gtfNumber: "019-001-0000001" });
    findMany.mockImplementation(async ({ where }: { where: Where }) => {
      if (where.section === "despacho_troza")
        return [despacho("1"), despacho("2"), despacho("3", { status: "anulado" }), despacho("99")];
      return (where.trozaCode?.in ?? []).filter((c) => c !== "99").map((c) => trozado(c, "plan-1", c === "2" ? "0.7500" : "0.5000"));
    });
    planFindFirst.mockResolvedValue({ planType: "PO", planNumber: "PO-1", titularName: "Blas SA", tituloHabilitante: "TH-1", resolucionNumber: null, region: "Ucayali", arffs: null });
    const { ForestLothDespachoDB } = await import("@/lib/db/forest-loth-despacho.db");
    const g = await ForestLothDespachoDB.guiaPublica("t-qa", "linea-1");
    expect(g?.gtfNumber).toBe("019-001-0000001");
    expect(g?.anulada).toBe(false);
    expect(g?.trozas.map((t) => t.codigo)).toEqual(["1", "2", "99"]);
    expect(g?.trozas[1]).toMatchObject({ especie: "Tornillo", d1: 0.6, d2: 0.5, largo: 4, m3: 0.75 });
    expect(g?.totalM3).toBe(1.25);
    expect(g?.sinMedida).toBe(1);
    expect(g?.plan?.planNumber).toBe("PO-1");
    /* La ancla se busca en ESTE negocio y sólo entre despachos. */
    expect(findFirst.mock.calls[0]?.[0]).toMatchObject({ where: { tenantId: "t-qa", id: "linea-1", section: "despacho_troza", deletedAt: null } });
  });

  it("todas anuladas → anulada; sin N° o de otra sección → null", async () => {
    findFirst.mockResolvedValueOnce({ planId: null, gtfNumber: "001-0000120" });
    findMany.mockResolvedValue([despacho("1", { status: "anulado", planId: null })]);
    const { ForestLothDespachoDB } = await import("@/lib/db/forest-loth-despacho.db");
    const g = await ForestLothDespachoDB.guiaPublica("t-qa", "x");
    expect(g?.anulada).toBe(true);
    expect(g?.trozas).toEqual([]);
    findFirst.mockResolvedValueOnce({ planId: "p", gtfNumber: "  " });
    expect(await ForestLothDespachoDB.guiaPublica("t-qa", "y")).toBeNull();
    findFirst.mockResolvedValueOnce(null);
    expect(await ForestLothDespachoDB.guiaPublica("t-qa", "z")).toBeNull();
  });
});
