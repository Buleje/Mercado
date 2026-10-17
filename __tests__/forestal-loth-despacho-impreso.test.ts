// @vitest-environment jsdom
/**
 * El Excel y el impreso del Libro TH traen las medidas del despacho de trozas
 * (08-10): la línea de despacho sólo guarda código y GTF; especie, Ø, largo y
 * m³ son los de SU trozado. La ruta del Excel los pega con `conTrozado` (la
 * misma lectura que la lista) y el impreso los lee de la lista.
 */

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PLAN = "plan-po12";
const DESPACHO = {
  id: "d1",
  section: "despacho_troza",
  lineNo: 1,
  planId: PLAN,
  status: "registrado",
  entryDate: "2026-05-28T12:00:00.000Z",
  createdAt: "2026-05-28T15:00:00.000Z",
  trozaCode: "85-TOR-C",
  gtfNumber: "019-001-0000066",
  speciesCommon: null,
  volumeM3: null,
};
const TROZADO = {
  id: "t1",
  planId: PLAN,
  trozaCode: "85-TOR-C",
  lineNo: 7,
  status: "registrado",
  createdAt: new Date("2026-05-27T15:00:00.000Z"),
  treeCode: "85-TOR",
  speciesCommon: "Tornillo",
  speciesScientific: "Cedrelinga cateniformis",
  cites: false,
  diamMayorM: "0.62",
  diamMenorM: "0.55",
  lengthM: "3.20",
  volumeM3: "0.8590",
};

describe("Excel del LO-TH: despacho con las medidas de su trozado (ruta real)", () => {
  const findMany = vi.fn(async () => [TROZADO]);
  beforeEach(() => {
    vi.resetModules();
    findMany.mockClear();
    vi.doMock("@/lib/require-admin", () => ({ requireAdmin: async () => ({ tenantId: "t-qa", role: "admin" }) }));
    vi.doMock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
    vi.doMock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
    vi.doMock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
    vi.doMock("@/lib/prisma", () => ({ prisma: { forestLothEntry: { findMany } } }));
    vi.doMock("@/lib/db/forest-loth.db", () => ({
      ForestLothDB: {
        list: async () => ({ entries: [DESPACHO], total: 1 }),
        getActiveCaratula: async () => ({ titularName: "QA Forestal" }),
      },
    }));
  });
  afterEach(() => {
    vi.doUnmock("@/lib/prisma");
    vi.doUnmock("@/lib/db/forest-loth.db");
  });

  it("la hoja «3. Despacho de trozas» trae especie, Ø, largo y m³; el Resumen suma su m³", async () => {
    const { GET } = await import("@/app/api/admin/forestal/loth/export/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/forestal/loth/export?format=xlsx"));
    expect(res.status).toBe(200);
    // Buscó el trozado de ESA troza, en este negocio.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "t-qa", section: "trozado", trozaCode: { in: ["85-TOR-C"] } }) }),
    );
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as unknown as ArrayBuffer);
    const ws = wb.worksheets.find((w) => w.name.startsWith("3. Despacho"));
    expect(ws).toBeTruthy();
    const cabecera = (ws?.getRow(2).values as unknown[]).slice(1);
    const fila = (ws?.getRow(3).values as unknown[]).slice(1);
    const celda = (h: string) => fila[cabecera.indexOf(h)];
    expect(celda("Cód. troza")).toBe("85-TOR-C");
    expect(celda("N° GTF")).toBe("019-001-0000066");
    expect(celda("Especie")).toBe("Tornillo");
    expect(celda("Nombre científico")).toBe("Cedrelinga cateniformis");
    expect(celda("Ø mayor (m)")).toBe(0.62);
    expect(celda("Ø menor (m)")).toBe(0.55);
    expect(celda("Longitud (m)")).toBe(3.2);
    expect(celda("Volumen (m³)")).toBe(0.859);
    const resumen = wb.getWorksheet("Resumen");
    const filaDespacho = [3, 4, 5, 6, 7, 8].map((r) => resumen?.getRow(r)).find((r) => String(r?.getCell(1).value).startsWith("3."));
    expect(filaDespacho?.getCell(5).value).toBe(0.859);
  });
});

describe("Libro LO-TH impreso: despacho con las medidas de su trozado", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = new URL(url, "http://localhost");
        if (u.pathname.endsWith("/caratula")) return new Response(JSON.stringify({ active: null }), { status: 200 });
        // La lista ya trae `trozado` pegado (`conTrozado` en GET /loth).
        const trozado = {
          lineaId: "t1", lineNo: 7, treeCode: "85-TOR", speciesCommon: "Tornillo", speciesScientific: "Cedrelinga cateniformis",
          cites: false, diamMayorM: "0.62", diamMenorM: "0.55", lengthM: "3.20", volumeM3: "0.8590", anulada: false,
        };
        return new Response(JSON.stringify({ entries: [{ ...DESPACHO, trozado }], total: 1 }), { status: 200 });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("la tabla del despacho dice especie, Ø mayor/menor, largo y m³", async () => {
    const escrito: string[] = [];
    const w = {
      print: vi.fn(),
      focus: vi.fn(),
      close: vi.fn(),
      document: {
        open: vi.fn(() => { escrito.length = 0; }),
        write: vi.fn((h: string) => { escrito.push(h); }),
        close: vi.fn(),
        getElementById: vi.fn(() => null),
      },
    };
    const { printLothLibro } = await import("@/lib/forestal/loth-print");
    await printLothLibro({ ventana: w as unknown as Window });
    const html = escrito.join("");
    const seccion = html.slice(html.indexOf("3 · Despacho de trozas"), html.indexOf("4 · Consumo de trozas"));
    for (const h of ["Especie", "Ø may", "Ø men", "Long.", "Vol. m³"]) expect(seccion).toContain(`>${h}</th>`);
    expect(seccion).toContain("Tornillo");
    expect(seccion).toContain("Cedrelinga cateniformis");
    expect(seccion).toContain(">0.62<");
    expect(seccion).toContain(">0.55<");
    expect(seccion).toContain(">3.20<");
    expect(seccion).toContain("<b>0.8590</b>");
  });
});
