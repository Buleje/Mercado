/**
 * Hoja del árbol imprimible — el HTML que se firma. Puro, sin DOM.
 * Caso real: árbol 111 Copaiba, talado 28/09/2026 (10,37 m³), troza 111-A de
 * 4,951 m³ despachada el 29/09 en la GTF 019-0000002.
 */
import { describe, it, expect } from "vitest";
import { buildTraceOperations } from "@/lib/forestal/loth-trace";
import { construirFilasTrace, type TraceFila } from "@/lib/forestal/loth-trace-tabla";
import { hojaArbolHtml } from "@/lib/forestal/loth-hoja-arbol-print";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";

let seq = 0;
function entry(partial: Partial<LothEntryDTO>): LothEntryDTO {
  return {
    id: `e${seq++}`, section: "tala", lineNo: seq, entryDate: "2026-09-28", treeCode: null, trozaCode: null,
    despachoCode: null, isRama: false, speciesCommon: "Copaiba", speciesScientific: "Copaifera paupera", cites: false,
    diamMayorM: null, diamMenorM: null, lengthM: null, volumeM3: null, productType: null, quantity: null, unit: null,
    pieces: null, gtfNumber: null, discarded: false, consumoInterno: false, observations: null, status: "registrado",
    annulledReason: null, gpsLat: null, gpsLng: null, photoUrl: null, ...partial,
  };
}

const CARATULA = { titularName: "Inversiones Agroforestales Blas S.A.", tituloHabilitante: "TH-001", registroNumber: "R-1", tomo: "I" };
const HOY = new Date("2026-09-30T15:00:00Z");

function fila(entries: LothEntryDTO[]): TraceFila {
  return construirFilasTrace(buildTraceOperations(entries, { hoy: HOY }), [])[0];
}

const real = fila([
  entry({ section: "tala", treeCode: "111", volumeM3: "10.37", gpsLat: "-8.3791", gpsLng: "-74.5539" }),
  entry({ section: "trozado", treeCode: "111", trozaCode: "111-A", volumeM3: "4.951", lengthM: "3.5", entryDate: "2026-09-28" }),
  entry({ section: "despacho_troza", trozaCode: "111-A", gtfNumber: "019-0000002", entryDate: "2026-09-29" }),
]);

describe("hojaArbolHtml", () => {
  it("imprime el caso real: rendimiento, troza despachada con GTF y fecha", () => {
    const html = hojaArbolHtml(real, CARATULA, { hoy: HOY });
    expect(html).toContain("Hoja del árbol 111");
    expect(html).toContain("10.370 m³");
    expect(html).toContain("<b>111-A</b>");
    expect(html).toContain("Despachada · GTF 019-0000002 · 29 sep 2026");
    expect(html).toContain("47.7%"); // 4,951 / 10,37 — la cifra de la pantalla
    expect(html).toContain("Inversiones Agroforestales Blas S.A.");
    expect(html).toContain("Impreso el 30 sep 2026");
    expect(html).toContain("Regente forestal");
  });

  it("escapa cada dato: un <script> en la especie, la troza o la carátula no sale crudo", () => {
    const x = "<script>alert(1)</script>";
    const f = fila([
      entry({ section: "tala", treeCode: "9", volumeM3: "5", speciesCommon: x }),
      entry({ section: "trozado", treeCode: "9", trozaCode: x, volumeM3: "2" }),
    ]);
    const html = hojaArbolHtml(f, { titularName: x, tituloHabilitante: x }, { hoy: HOY });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("sin datos imprime «—», nunca «0»", () => {
    const f = fila([entry({ section: "tala", treeCode: "7", volumeM3: null })]);
    const html = hojaArbolHtml(f, null, { hoy: HOY });
    expect(html).toContain("—");
    expect(html).toContain("— (sin trozar)");
    expect(html).not.toMatch(/0\.000 m³/);
    expect(html).not.toMatch(/>0(\.0)?%</);
    expect(html).toContain("sin trozado registrado");
  });

  it("árbol en pie (sin operación) no rompe y no inventa tala", () => {
    const enPie: TraceFila = { ...real, op: null, enPie: true, taladoM3: null, trozadoM3: 0, rendimientoPct: null, mermaM3: null, mermaPct: null, diasTalaSalida: null, gtfs: [], flags: [], motivos: [] };
    const html = hojaArbolHtml(enPie, CARATULA, { hoy: HOY });
    expect(html).toContain("en pie");
    expect(html).not.toContain("GTF 019");
  });
});
