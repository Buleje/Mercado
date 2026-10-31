/**
 * loth-chequeo-guias — guías, fechas y preliminares del chequeo avanzado del
 * Libro TH (26-10). Puro, sin DB.
 */
import { describe, it, expect } from "vitest";
import {
  despachosSinGuia,
  diasEntre,
  fechaDelCaso,
  fechasFueraDeOrden,
  guiasFueraDeVigencia,
  guiasRepetidas,
  guiasSinTransporte,
  preliminaresViejas,
  sinDato,
} from "@/lib/forestal/loth-chequeo-guias";
import type { GuiaChequeo, LineaChequeo, PlanChequeo } from "@/lib/forestal/loth-chequeo-tipos";

const guia = (o: Partial<GuiaChequeo>): GuiaChequeo => ({
  id: o.gtfNumber ?? "g",
  gtfNumber: "019-001-0000771",
  fecha: "2026-10-05",
  tipo: "trozas",
  status: "emitida",
  planId: "p1",
  placa: "ABC-123",
  conductor: "Juan Pérez",
  licencia: "Q12345678",
  ...o,
});

const linea = (o: Partial<LineaChequeo>): LineaChequeo => ({
  section: "tala",
  lineNo: 1,
  fecha: "2026-10-05",
  planId: "p1",
  treeCode: null,
  trozaCode: null,
  gtfNumber: null,
  gps: false,
  ...o,
});

const PLAN: PlanChequeo = { id: "p1", nombre: "PO 12", planType: "PO", vigenciaDesde: "2026-01-15", vigenciaHasta: "2027-01-14" };

describe("fechas", () => {
  it("fechaDelCaso dice el día de la semana y dd/mm, sin correrse un día", () => {
    expect(fechaDelCaso("2026-09-10")).toBe("jueves 10/09");
    expect(fechaDelCaso("2026-10-05T00:00:00.000Z")).toBe("lunes 05/10");
    expect(fechaDelCaso(null)).toBe("sin fecha");
  });
  it("diasEntre cuenta días enteros en UTC", () => {
    expect(diasEntre("2026-10-16", "2026-10-26")).toBe(10);
    expect(diasEntre("x", "2026-10-26")).toBeNull();
  });
  it("sinDato: vacío o relleno", () => {
    expect(sinDato("")).toBe(true);
    expect(sinDato(" - ")).toBe(true);
    expect(sinDato("---")).toBe(true);
    expect(sinDato("ABC-123")).toBe(false);
  });
});

describe("guiasRepetidas", () => {
  it("dos vivas con el mismo número (escrito distinto) son un caso", () => {
    const r = guiasRepetidas([guia({ id: "a", gtfNumber: "19-1-771" }), guia({ id: "b", gtfNumber: "019-001-0000771" })]);
    expect(r).toHaveLength(1);
    expect(r[0]).toContain("2 guías");
  });
  it("una anulada y su reemisión no cuentan", () => {
    expect(guiasRepetidas([guia({ id: "a", status: "anulada" }), guia({ id: "b" })])).toEqual([]);
  });
});

describe("guiasFueraDeVigencia", () => {
  it("antes de que empiece y después de que venció", () => {
    const r = guiasFueraDeVigencia(
      [guia({ fecha: "2026-01-10" }), guia({ fecha: "2027-01-15" }), guia({ fecha: "2027-01-14" })],
      [PLAN],
    );
    expect(r).toHaveLength(2);
    expect(r[0]).toContain("antes de que empiece PO 12");
    expect(r[1]).toContain("después de que venció PO 12");
  });
  it("sin plan, sin fecha o anulada: no se juzga", () => {
    expect(guiasFueraDeVigencia([guia({ planId: null, fecha: "2020-01-01" }), guia({ fecha: null }), guia({ status: "anulada", fecha: "2020-01-01" })], [PLAN])).toEqual([]);
  });
});

describe("guiasSinTransporte", () => {
  it("dice qué falta, y la licencia sólo si se pide", () => {
    const g = guia({ placa: "", conductor: null, licencia: "-" });
    expect(guiasSinTransporte([g], true)[0]).toContain("falta la placa, el conductor y la licencia");
    expect(guiasSinTransporte([g], false)[0]).toContain("falta la placa y el conductor");
    expect(guiasSinTransporte([guia({ licencia: null })], false)).toEqual([]);
  });
});

describe("despachosSinGuia", () => {
  it("sólo los despachos sin N.º de GTF", () => {
    const r = despachosSinGuia([
      linea({ section: "despacho_troza", lineNo: 3, gtfNumber: "" }),
      linea({ section: "despacho_producto", lineNo: 4, gtfNumber: "019-001-1" }),
      linea({ section: "trozado", lineNo: 5 }),
    ]);
    expect(r).toEqual(["Despacho de trozas #3 (lunes 05/10): sin N.º de GTF"]);
  });
});

describe("fechasFueraDeOrden", () => {
  it("trozado antes de su tala y despacho antes de su trozado", () => {
    const r = fechasFueraDeOrden([
      linea({ section: "tala", treeCode: "85-TOR", fecha: "2026-10-05" }),
      linea({ section: "trozado", lineNo: 2, treeCode: "85-tor", trozaCode: "85-TOR-1", fecha: "2026-10-04" }),
      linea({ section: "despacho_troza", lineNo: 3, trozaCode: "85-TOR-1", fecha: "2026-10-03" }),
    ]);
    expect(r).toHaveLength(2);
    expect(r[0]).toContain("Trozado #2");
    expect(r[1]).toContain("Despacho de trozas #3");
  });
  it("mismo día = en orden; el mismo código de OTRO plan no cuenta", () => {
    expect(
      fechasFueraDeOrden([
        linea({ section: "tala", treeCode: "1", fecha: "2026-10-05" }),
        linea({ section: "trozado", treeCode: "1", fecha: "2026-10-05" }),
        linea({ section: "tala", planId: "p2", treeCode: "7", fecha: "2026-10-09" }),
        linea({ section: "trozado", planId: "p1", treeCode: "7", fecha: "2026-10-01" }),
      ]),
    ).toEqual([]);
  });
  it("una tala vieja sin plan sí vale para el trozado de un plan", () => {
    const r = fechasFueraDeOrden([
      linea({ section: "tala", planId: null, treeCode: "9", fecha: "2026-10-09" }),
      linea({ section: "trozado", planId: "p1", treeCode: "9", fecha: "2026-10-01" }),
    ]);
    expect(r).toHaveLength(1);
  });
});

describe("preliminaresViejas", () => {
  const p = (fecha: string | null, anotadaEl = "2026-10-26") => ({ numeroGtf: "19-000003", fecha, anotadaEl, plan: "PO1" });
  it("desde los días de aviso: por vencer, último día y fuera de plazo", () => {
    const r = preliminaresViejas([p("2026-10-16"), p("2026-10-11"), p("2026-10-01"), p("2026-10-20")], "2026-10-26", 10);
    expect(r.porVencer).toEqual(["GTF 19-000003 (PO1): guía del viernes 16/10, te quedan 5 días", "GTF 19-000003 (PO1): guía del domingo 11/10, hoy es el último día"]);
    expect(r.vencidas).toEqual(["GTF 19-000003 (PO1): guía del jueves 01/10, fuera de plazo por 10 días"]);
  });
  it("sin fecha de guía cuenta desde que se anotó", () => {
    const r = preliminaresViejas([p(null, "2026-10-12")], "2026-10-26", 10);
    expect(r.porVencer[0]).toContain("anotada el lunes 12/10, te queda 1 día");
  });
});
