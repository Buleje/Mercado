/**
 * Tests — la etapa de cada árbol del censo en el mapa del Libro TH (29-09).
 *
 * Con datos como los reales:
 *   - `main` (QA): el 85-TOR con su tala N° 1, 4 trozas (A-D) y 2 despachadas
 *     en la guía 001-0000120; los despachos SIN `treeCode` (sólo la troza);
 *     el censo lo sigue diciendo «en pie»; y un montón de líneas anuladas
 *     (talas de 1-SHI/2-AZ/50-MIS, trozados y despachos de QA) que no cuentan;
 *   - Blas: talas de 100, 111, 113, 114 y trozado de 111 y 113 (una troza
 *     cada uno); 0 despachos;
 *   - el censo que dice talado sin tala en el libro (QA vieja).
 */

import { describe, expect, it } from "vitest";
import {
  estadoDeArboles,
  etapaEnElMapa,
  opcionesDeEtapa,
  textoCortoEtapa,
  textoLargoEtapa,
  type ArbolParaEtapa,
  type EstadoArbol,
  type LineaParaEtapa,
} from "@/lib/forestal/loth-etapa-arbol";

let n = 0;
const linea = (l: Partial<LineaParaEtapa> & Pick<LineaParaEtapa, "section" | "lineNo">): LineaParaEtapa => ({
  id: `l${++n}`,
  status: "registrado",
  entryDate: "2026-09-28",
  treeCode: null,
  trozaCode: null,
  volumeM3: null,
  gtfNumber: null,
  ...l,
});
const arbol = (treeCode: string, estado = "en_pie", condicion: string | null = "Aprovechable"): ArbolParaEtapa => ({
  id: `t-${treeCode}`,
  treeCode,
  estado,
  condicion,
});
const de = (r: { arboles: EstadoArbol[] }, code: string) => {
  const e = r.arboles.find((a) => a.treeCode === code);
  if (!e) throw new Error(`sin ${code}`);
  return e;
};

// ─── main (QA) ───────────────────────────────────────────────────────────────

const MAIN_CENSO = [arbol("1-SHI", "en_pie", null), arbol("2-AZ", "en_pie", null), arbol("50-MIS", "en_pie", null), arbol("85-TOR", "en_pie", null)];
const TROZADO_A = linea({ section: "trozado", lineNo: 1, treeCode: "85-TOR", trozaCode: "85-TOR-A", volumeM3: 1.471, entryDate: "2026-05-28" });
const MAIN_LINEAS: LineaParaEtapa[] = [
  linea({ section: "tala", lineNo: 1, treeCode: "85-TOR", volumeM3: 5.003, entryDate: "2026-05-28" }),
  TROZADO_A,
  linea({ section: "trozado", lineNo: 2, treeCode: "85-TOR", trozaCode: "85-TOR-B", volumeM3: 1.29, entryDate: "2026-05-28" }),
  linea({ section: "trozado", lineNo: 3, treeCode: "85-TOR", trozaCode: "85-TOR-C", volumeM3: 0.995, entryDate: "2026-05-28" }),
  linea({ section: "trozado", lineNo: 4, treeCode: "85-TOR", trozaCode: "85-TOR-D", volumeM3: 1.131, entryDate: "2026-05-28" }),
  // Los despachos NO traen treeCode: el árbol sale del trozado.
  linea({ section: "despacho_troza", lineNo: 1, trozaCode: "85-TOR-A", gtfNumber: "001-0000120", entryDate: "2026-05-28" }),
  linea({ section: "despacho_troza", lineNo: 2, trozaCode: "85-TOR-B", gtfNumber: "001-0000120", entryDate: "2026-05-28" }),
  // Anuladas: no cuentan.
  linea({ section: "despacho_troza", lineNo: 19, status: "anulado", trozaCode: "85-TOR-C", gtfNumber: "001-0000127" }),
  linea({ section: "despacho_troza", lineNo: 20, status: "anulado", trozaCode: "85-TOR-D", gtfNumber: "001-0000127" }),
  linea({ section: "trozado", lineNo: 1, status: "anulado", treeCode: "85-TOR", trozaCode: "85-TOR-E", volumeM3: 0.0891 }),
  linea({ section: "tala", lineNo: 3, status: "anulado", treeCode: "1-SHI", volumeM3: 9.5426 }),
  linea({ section: "tala", lineNo: 7, status: "anulado", treeCode: "1-SHI", volumeM3: 10.8687, entryDate: "2026-09-29" }),
  linea({ section: "tala", lineNo: 4, status: "anulado", treeCode: "2-AZ", volumeM3: 4.9028 }),
  linea({ section: "tala", lineNo: 9, status: "anulado", treeCode: "QABK-THCTP-1", volumeM3: 3 }),
];

describe("estadoDeArboles · main (QA)", () => {
  const r = estadoDeArboles(MAIN_CENSO, MAIN_LINEAS);

  it("85-TOR: 4 trozas, 2 despachadas sin treeCode en el despacho → despacho parcial 2/4", () => {
    const e = de(r, "85-TOR");
    expect(e.etapa).toBe("despachado_parcial");
    expect(e.trozas).toEqual({ total: 4, despachadas: 2, consumidas: 0, enMonte: 2, enCtp: 0 });
    expect(e.tala).toEqual({ lineNo: 1, fecha: "2026-05-28", volumeM3: 5.003 });
    expect(e.m3).toEqual({ talado: 5.003, trozado: 4.887, despachado: 2.761, consumido: 0 });
    expect(e.guias).toEqual(["001-0000120"]);
    expect(textoCortoEtapa(e.etapa, e)).toBe("Despacho 2/4");
  });

  it("85-TOR: el censo lo dice en pie y el libro lo taló → aviso, sin esconderlo", () => {
    const e = de(r, "85-TOR");
    expect(e.estadoCenso).toBe("en_pie");
    expect(e.avisos.map((a) => a.tipo)).toEqual(["censo_no_dice_talado"]);
    expect(e.avisos[0].texto).toContain("línea N° 1");
  });

  it("las talas anuladas no talan: 1-SHI y 2-AZ siguen en pie, sin aviso", () => {
    expect(de(r, "1-SHI").etapa).toBe("en_pie");
    expect(de(r, "1-SHI").tala).toBeNull();
    expect(de(r, "1-SHI").avisos).toEqual([]);
    expect(de(r, "2-AZ").etapa).toBe("en_pie");
    expect(de(r, "50-MIS").ultimaFecha).toBeNull();
  });

  it("una tala anulada de un árbol que NO está en el censo no aparece en «sin censo»", () => {
    expect(r.sinCenso).toEqual([]);
  });

  it("la troza recibida en el CTP (ADR-450) cuenta; en_ctp sólo cuando salió todo y llegó lo despachado", () => {
    const parcial = estadoDeArboles(MAIN_CENSO, MAIN_LINEAS, new Set([TROZADO_A.id]));
    expect(de(parcial, "85-TOR").trozas.enCtp).toBe(1);
    expect(de(parcial, "85-TOR").etapa).toBe("despachado_parcial");

    const todas = MAIN_LINEAS.filter((l) => l.section === "trozado" && l.status === "registrado");
    const salenTodas = [
      ...MAIN_LINEAS,
      linea({ section: "despacho_troza", lineNo: 3, trozaCode: "85-TOR-C", gtfNumber: "001-0000130" }),
      linea({ section: "despacho_troza", lineNo: 4, trozaCode: "85-TOR-D", gtfNumber: "001-0000130" }),
    ];
    const despachado = estadoDeArboles(MAIN_CENSO, salenTodas, new Set([todas[0].id, todas[1].id]));
    expect(de(despachado, "85-TOR").etapa).toBe("despachado");
    expect(de(despachado, "85-TOR").guias).toEqual(["001-0000120", "001-0000130"]);
    const enCtp = estadoDeArboles(MAIN_CENSO, salenTodas, new Set(todas.map((l) => l.id)));
    expect(de(enCtp, "85-TOR").etapa).toBe("en_ctp");
    expect(textoLargoEtapa("en_ctp", de(enCtp, "85-TOR"))).toBe("en el CTP, 4 de 4 trozas recibidas");
  });
});

// ─── Blas ────────────────────────────────────────────────────────────────────

const BLAS_CENSO = ["100", "102", "103", "111", "113", "114"].map((c) => arbol(c, ["100", "111", "113", "114"].includes(c) ? "talado" : "en_pie"));
const BLAS_LINEAS: LineaParaEtapa[] = [
  linea({ section: "tala", lineNo: 3, treeCode: "100", volumeM3: 2.8368 }),
  linea({ section: "tala", lineNo: 4, treeCode: "111", volumeM3: 10.3697 }),
  linea({ section: "tala", lineNo: 5, treeCode: "113", volumeM3: 4.1418 }),
  linea({ section: "tala", lineNo: 6, treeCode: "114", volumeM3: 15.5863 }),
  linea({ section: "trozado", lineNo: 3, treeCode: "111", trozaCode: "111-A", volumeM3: 4.951 }),
  linea({ section: "trozado", lineNo: 4, treeCode: "113", trozaCode: "113-A", volumeM3: 1.6592 }),
];

describe("estadoDeArboles · Blas", () => {
  const r = estadoDeArboles(BLAS_CENSO, BLAS_LINEAS);

  it("cuenta como el pedido: en pie 2 · talado 2 · trozado 2 · despachado 0", () => {
    const porEtapa = (e: string) => r.arboles.filter((a) => a.etapa === e).map((a) => a.treeCode);
    expect(porEtapa("en_pie")).toEqual(["102", "103"]);
    expect(porEtapa("talado")).toEqual(["100", "114"]);
    expect(porEtapa("trozado")).toEqual(["111", "113"]);
    expect(r.arboles.every((a) => a.avisos.length === 0)).toBe(true);
  });

  it("el trozado dice cuántas trozas y cuánto m³, todas en el monte", () => {
    const e = de(r, "111");
    expect(e.trozas).toEqual({ total: 1, despachadas: 0, consumidas: 0, enMonte: 1, enCtp: 0 });
    expect(e.m3.trozado).toBe(4.951);
    expect(textoCortoEtapa(e.etapa, e)).toBe("Trozado ×1");
    expect(textoLargoEtapa(e.etapa, e)).toBe("trozado en 1 troza, en el monte");
  });

  it("el talado dice el día y la línea, como el libro («lunes 28/09»)", () => {
    const e = de(r, "114");
    expect(textoLargoEtapa(e.etapa, e)).toMatch(/^talado el lunes 28\/09, línea N° 6$/);
  });

  it("opciones del filtro: la cadena siempre (también «Despachado 0»), lo demás sólo si hay", () => {
    const conEtapa = r.arboles.map((a) => ({ etapa: a.etapa, conAviso: a.avisos.length > 0 }));
    expect(opcionesDeEtapa(conEtapa).map((o) => `${o.label} ${o.n}`)).toEqual(["En pie 2", "Talado 2", "Trozado 2", "Despachado 0"]);
  });
});

// ─── Desfases ────────────────────────────────────────────────────────────────

describe("estadoDeArboles · el censo y el libro no coinciden", () => {
  it("talado en el censo SIN tala en el libro → talado con aviso", () => {
    const r = estadoDeArboles([arbol("001-TOR", "talado", null)], []);
    const e = de(r, "001-TOR");
    expect(e.etapa).toBe("talado");
    expect(e.tala).toBeNull();
    expect(e.avisos).toEqual([{ tipo: "censo_talado_sin_tala", texto: "El censo lo marca talado, pero el libro no tiene su tala." }]);
    expect(textoLargoEtapa(e.etapa, e)).toBe("talado según el censo");
  });

  it("…y si su tala se anuló, el aviso lo dice", () => {
    const r = estadoDeArboles([arbol("7", "talado")], [linea({ section: "tala", lineNo: 9, status: "anulado", treeCode: "7" })]);
    expect(de(r, "7").avisos[0].texto).toContain("línea N° 9) se anuló");
    expect(de(r, "7").talaAnulada).toEqual({ lineNo: 9, fecha: "2026-09-28" });
  });

  it("los códigos se comparan por su clave: «0114» del libro es el «114» del censo", () => {
    const r = estadoDeArboles([arbol("114", "talado")], [linea({ section: "tala", lineNo: 6, treeCode: "0114", volumeM3: 15.5863 })]);
    expect(de(r, "114").tala?.lineNo).toBe(6);
    expect(r.sinCenso).toEqual([]);
  });

  it("tala vigente de un árbol que no está en el censo del plan → «sin censo»", () => {
    const r = estadoDeArboles([arbol("100")], [linea({ section: "tala", lineNo: 1, treeCode: "QA-9" })]);
    expect(r.sinCenso).toEqual(["QA-9"]);
  });

  it("un semillero del regente: en pie es «semillero»; talado lleva aviso", () => {
    const enPie = estadoDeArboles([arbol("5", "en_pie", "Semillero")], []);
    expect(de(enPie, "5").etapa).toBe("semillero");
    const talado = estadoDeArboles([arbol("5", "en_pie", "Semillero")], [linea({ section: "tala", lineNo: 1, treeCode: "5" })]);
    expect(de(talado, "5").etapa).toBe("talado");
    expect(de(talado, "5").avisos.map((a) => a.tipo)).toEqual(["censo_no_dice_talado", "semillero_talado"]);
  });

  it("trozas sin tala vigente y despacho sin trozado: cuentan y avisan", () => {
    const r = estadoDeArboles(
      [arbol("9", "talado")],
      [
        linea({ section: "tala", lineNo: 1, status: "anulado", treeCode: "9" }),
        linea({ section: "trozado", lineNo: 1, treeCode: "9", trozaCode: "9-A", volumeM3: 1 }),
        linea({ section: "despacho_troza", lineNo: 1, trozaCode: "9-B", gtfNumber: "G1", volumeM3: 0.5 }),
      ],
    );
    const e = de(r, "9");
    expect(e.trozas.total).toBe(2);
    expect(e.trozas.despachadas).toBe(1);
    expect(e.etapa).toBe("despachado_parcial");
    expect(e.avisos.map((a) => a.tipo)).toEqual(["censo_talado_sin_tala", "trozas_sin_tala", "despacho_sin_trozado"]);
  });

  it("una troza despachada dos veces (T1) cuenta una; el consumo también es salida", () => {
    const r = estadoDeArboles(
      [arbol("3")],
      [
        linea({ section: "tala", lineNo: 1, treeCode: "3" }),
        linea({ section: "trozado", lineNo: 1, treeCode: "3", trozaCode: "3-A", volumeM3: 1 }),
        linea({ section: "trozado", lineNo: 2, treeCode: "3", trozaCode: "3-B", volumeM3: 2 }),
        linea({ section: "despacho_troza", lineNo: 1, trozaCode: "3-A", gtfNumber: "G1" }),
        linea({ section: "despacho_troza", lineNo: 2, trozaCode: "3-A", gtfNumber: "G2" }),
        linea({ section: "consumo_troza", lineNo: 1, trozaCode: "3-B" }),
      ],
    );
    const e = de(r, "3");
    expect(e.trozas).toEqual({ total: 2, despachadas: 1, consumidas: 1, enMonte: 0, enCtp: 0 });
    expect(e.guias).toEqual(["G1"]);
    expect(e.etapa).toBe("despachado");
    expect(e.m3).toMatchObject({ despachado: 1, consumido: 2 });
  });

  it("descartado en el censo, sin nada en el libro → descartado", () => {
    expect(de(estadoDeArboles([arbol("8", "descartado")], []), "8").etapa).toBe("descartado");
  });
});

describe("etapaEnElMapa", () => {
  it("el POA reserva un árbol en pie como semillero → «Semillero» en el mapa", () => {
    expect(etapaEnElMapa({ etapa: "en_pie" }, { estado: "en_pie", clase: "semillero" })).toBe("semillero");
    expect(etapaEnElMapa({ etapa: "trozado" }, { estado: "en_pie", clase: "semillero" })).toBe("trozado");
  });

  it("sin estado del servidor, sale del censo", () => {
    expect(etapaEnElMapa(null, { estado: "talado", clase: "aprovechable" })).toBe("talado");
    expect(etapaEnElMapa(undefined, { estado: "descartado", clase: "aprovechable" })).toBe("descartado");
    expect(etapaEnElMapa(null, { estado: "en_pie", clase: "aprovechable" })).toBe("en_pie");
  });
});
