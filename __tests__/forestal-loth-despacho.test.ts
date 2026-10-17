/**
 * Despacho de trozas del Libro TH (08-10): las medidas salen del trozado de
 * esa troza (mismo permiso), la vista «Por guía» agrupa por GTF y las cifras
 * de la sección (pie, filtros, orden, tarjetas) leen esas medidas. Puro.
 */
import { describe, it, expect } from "vitest";
import type { LothEntryDTO, TrozadoDelDespacho } from "@/lib/forestal/loth-constants";
import {
  comoLineaDeTrozado,
  conTrozado,
  elegirTrozado,
  m3DeDespachos,
  medidasDeLinea,
  type TrozadoCandidato,
} from "@/lib/forestal/loth-despacho-medidas";
import { datosDeGuia, despachosPorGuia, filaAnulada, guiaDeLineas, textoDelDespacho } from "@/lib/forestal/loth-despacho-por-guia";
import { lineasToCsv, ordenarLineas, totalesDe } from "@/lib/forestal/loth-seccion";
import { aplicarFacetas } from "@/lib/admin/filtros-columna";
import { filtrosDeSeccion } from "@/components/admin/forestal/loth-seccion-filtros";
import { cifrasDeLineas, textoTotal } from "@/components/admin/forestal/loth-seccion-cifras";

const P1 = "plan-1";
const P2 = "plan-2";

function cand(p: Partial<TrozadoCandidato>): TrozadoCandidato {
  return {
    id: `t-${p.trozaCode}-${p.planId}-${p.lineNo ?? 1}`,
    planId: P1,
    trozaCode: "85-TOR-A",
    lineNo: 1,
    status: "registrado",
    createdAt: "2026-09-01T10:00:00.000Z",
    treeCode: "85",
    speciesCommon: "Tornillo",
    speciesScientific: "Cedrelinga cateniformis",
    cites: false,
    diamMayorM: "0.6500",
    diamMenorM: "0.6000",
    lengthM: "4.2000",
    volumeM3: "1.2870",
    ...p,
  };
}

let seq = 0;
function linea(p: Partial<LothEntryDTO>): LothEntryDTO {
  seq += 1;
  return {
    id: `d${seq}`, section: "despacho_troza", lineNo: seq, entryDate: "2026-09-10T00:00:00.000Z",
    treeCode: null, trozaCode: "85-TOR-A", despachoCode: null, isRama: false, speciesCommon: null,
    speciesScientific: null, cites: false, diamMayorM: null, diamMenorM: null, lengthM: null, volumeM3: null,
    productType: null, quantity: null, unit: null, pieces: null, gtfNumber: "019-001-0000001", discarded: false,
    consumoInterno: false, observations: null, status: "registrado", annulledReason: null, gpsLat: null,
    gpsLng: null, photoUrl: null, planId: P1, ...p,
  };
}

const trozado = (p: Partial<TrozadoDelDespacho>): TrozadoDelDespacho => ({
  lineaId: "t1", lineNo: 1, treeCode: "85", speciesCommon: "Tornillo", speciesScientific: null, cites: false,
  diamMayorM: "0.6500", diamMenorM: "0.6000", lengthM: "4.2000", volumeM3: "1.2870", anulada: false, ...p,
});

describe("elegirTrozado — la medida es la del trozado del MISMO permiso", () => {
  it("un código repetido en otro permiso no se mezcla", () => {
    const otros = [cand({ planId: P2, volumeM3: "9.9990" }), cand({ planId: P1, volumeM3: "1.2870" })];
    expect(elegirTrozado({ planId: P1, trozaCode: "85-TOR-A" }, otros)?.volumeM3).toBe("1.2870");
    expect(elegirTrozado({ planId: P2, trozaCode: "85-TOR-A" }, otros)?.volumeM3).toBe("9.9990");
  });

  it("sin trozado en su permiso usa el trozado sin plan (líneas viejas); nunca el de otro permiso", () => {
    expect(elegirTrozado({ planId: P1, trozaCode: "85-TOR-A" }, [cand({ planId: null })])?.planId).toBeNull();
    expect(elegirTrozado({ planId: P1, trozaCode: "85-TOR-A" }, [cand({ planId: P2 })])).toBeNull();
  });

  it("despacho sin plan: sólo si todas las candidatas son de un mismo plan", () => {
    expect(elegirTrozado({ planId: null, trozaCode: "85-TOR-A" }, [cand({ planId: P2 })])?.planId).toBe(P2);
    expect(elegirTrozado({ planId: null, trozaCode: "85-TOR-A" }, [cand({ planId: P1 }), cand({ planId: P2 })])).toBeNull();
  });

  it("gana la vigente y, entre vigentes, la más nueva (la que corrige)", () => {
    const vieja = cand({ lineNo: 1, createdAt: "2026-09-01T00:00:00.000Z", volumeM3: "1.0000" });
    const nueva = cand({ lineNo: 7, createdAt: "2026-09-05T00:00:00.000Z", volumeM3: "1.1000" });
    const anulada = cand({ lineNo: 9, createdAt: "2026-09-09T00:00:00.000Z", status: "anulado", volumeM3: "5.0000" });
    expect(elegirTrozado({ planId: P1, trozaCode: " 85-TOR-A " }, [vieja, anulada, nueva])?.volumeM3).toBe("1.1000");
    // Sólo la anulada: se lee igual, marcada.
    const [d] = conTrozado([linea({})], [anulada]);
    expect(d.trozado?.anulada).toBe(true);
  });

  it("conTrozado pega sólo la lista blanca y deja las otras secciones tal cual", () => {
    const tala = linea({ section: "tala", trozaCode: null });
    const [d, t] = conTrozado([linea({}), tala], [cand({})]);
    expect(Object.keys(d.trozado ?? {}).sort()).toEqual(
      ["anulada", "cites", "diamMayorM", "diamMenorM", "lengthM", "lineNo", "lineaId", "speciesCommon", "speciesScientific", "treeCode", "volumeM3"].sort(),
    );
    expect(t).toBe(tala);
    // La línea de despacho sigue sin medidas propias: el formulario de corrección no las hereda.
    expect(d.volumeM3).toBeNull();
  });

  it("m3DeDespachos suma a 4 decimales y lo que no tiene trozado no suma", () => {
    const c = [cand({ trozaCode: "A", volumeM3: "1.2870" }), cand({ trozaCode: "B", volumeM3: "0.3333" })];
    expect(m3DeDespachos([{ planId: P1, trozaCode: "A" }, { planId: P1, trozaCode: "B" }, { planId: P1, trozaCode: "Z" }], c)).toBe(1.6203);
  });
});

describe("la tabla de la sección lee las medidas del trozado", () => {
  const a = linea({ trozaCode: "A", trozado: trozado({ volumeM3: "1.2870", speciesCommon: "Tornillo" }) });
  const b = linea({ trozaCode: "B", trozado: trozado({ volumeM3: "0.5000", speciesCommon: "Cumala", diamMayorM: "0.4000" }) });
  const anulada = linea({ trozaCode: "C", status: "anulado", trozado: trozado({ volumeM3: "3.0000" }) });

  it("medidasDeLinea: lo de la línea primero, si no lo del trozado", () => {
    expect(medidasDeLinea(a)).toMatchObject({ especie: "Tornillo", arbol: "85", d1: "0.6500", m3: "1.2870", delTrozado: true });
    expect(medidasDeLinea(linea({ trozado: null }))).toMatchObject({ especie: null, m3: null, delTrozado: false });
  });

  it("el pie suma el m³ del trozado (sin las anuladas) y dice «m³»", () => {
    const t = totalesDe([a, b, anulada]);
    expect(t.volumenM3).toBe(1.787);
    expect(textoTotal("despacho_troza", t)).toMatch(/1[.,]787 m³/);
  });

  it("filtros de cabecera: Especie y m³ del trozado; el filtro se llama como la columna", () => {
    const cols = filtrosDeSeccion([{ key: "esp", label: "Especie" }, { key: "dM", label: "D1" }, { key: "vol", label: "m³" }], new Map());
    expect(cols.find((c) => c.id === "dM")?.label).toBe("D1");
    expect(aplicarFacetas([a, b], cols, { esp: ["Cumala"] }).map((e) => e.trozaCode)).toEqual(["B"]);
    expect(aplicarFacetas([a, b], cols, { vol: { min: 1, max: null } }).map((e) => e.trozaCode)).toEqual(["A"]);
  });

  it("ordenar por volumen y por especie usa el trozado", () => {
    expect(ordenarLineas([b, a], "volumen", "desc").map((e) => e.trozaCode)).toEqual(["A", "B"]);
    expect(ordenarLineas([a, b], "especie", "asc").map((e) => e.trozaCode)).toEqual(["B", "A"]);
  });

  it("las tarjetas: reparto por guía con su m³", () => {
    const c = cifrasDeLineas("despacho_troza", [a, b, linea({ trozaCode: "D", gtfNumber: "019-001-0000002", trozado: trozado({ volumeM3: "2.0000" }) })]);
    expect(c.guias).toBe(2);
    expect(c.porGuia.find((g) => g.value === "019-001-0000001")).toMatchObject({ count: 2, volumeM3: 1.787 });
  });

  it("el CSV de la sección lleva árbol, especie y medidas del trozado", () => {
    const fila = lineasToCsv([a]).split("\n")[1];
    expect(fila).toContain(",85,A,Tornillo,");
    expect(fila).toContain(",0.6500,0.6000,4.2000,1.2870,");
  });

  it("la etiqueta de una troza despachada lleva las medidas de su trozado", () => {
    const e = comoLineaDeTrozado(a);
    expect(e).toMatchObject({ section: "trozado", treeCode: "85", speciesCommon: "Tornillo", volumeM3: "1.2870", trozaCode: "A" });
  });
});

describe("«Por guía»", () => {
  const g1 = datosDeGuia({
    id: "g1", gtfNumber: "019-001-0000001", gtfDate: "2026-09-10T00:00:00.000Z", planId: P1, status: "emitida",
    destino: "texto viejo", gtfDatos: {
      destinatario: { nombre: "Aserradero Oxapampa SAC", distrito: "Oxapampa", provincia: "Oxapampa" },
      vehiculo: { placa: "ABC-123", conductor: "Juan Pérez" },
      transportista: { nombre: "Transportes Selva" },
    }, ctp: "por_ingresar",
  });
  const corta = datosDeGuia({ id: "g2", gtfNumber: "019-001-0000002", gtfDate: null, planId: P1, status: "anulada", destino: "Pucallpa", placaVehiculo: "XYZ-999", ctp: "ingresada" });

  it("datosDeGuia: casilleros primero, guía corta de respaldo; la anulada no dice CTP", () => {
    expect(g1).toMatchObject({ destino: "Aserradero Oxapampa SAC", llegada: "Oxapampa, Oxapampa", placa: "ABC-123", conductor: "Juan Pérez", transportista: "Transportes Selva", ctp: "por_ingresar", anulada: false });
    expect(corta).toMatchObject({ destino: "Pucallpa", placa: "XYZ-999", anulada: true, ctp: null });
  });

  it("guiaDeLineas: mismo N° sin mirar ceros; del mismo permiso; nunca adivina entre dos permisos", () => {
    expect(guiaDeLineas("019-001-1", P1, [g1])?.id).toBe("g1");
    const otraDeP2 = { ...g1, id: "g9", planId: P2 };
    expect(guiaDeLineas("019-001-0000001", P2, [g1, otraDeP2])?.id).toBe("g9");
    expect(guiaDeLineas("019-001-0000001", "plan-3", [g1, otraDeP2])).toBeNull();
  });

  it("agrupa por guía: trozas, m³ del trozado, anuladas aparte, sin medida contada", () => {
    const filas = despachosPorGuia(
      [
        linea({ trozaCode: "B", trozado: trozado({ volumeM3: "0.5000", speciesCommon: "Cumala" }) }),
        linea({ trozaCode: "A", trozado: trozado({ volumeM3: "1.2870" }) }),
        linea({ trozaCode: "S", trozado: null }),
        linea({ trozaCode: "X", status: "anulado", trozado: trozado({ volumeM3: "2.0000" }) }),
        linea({ trozaCode: "Q", gtfNumber: "019-001-0000002", status: "anulado", entryDate: "2026-09-01T00:00:00.000Z", trozado: trozado({ volumeM3: "0.7000" }) }),
      ],
      [g1, corta],
    );
    expect(filas.map((f) => f.gtfNumber)).toEqual(["019-001-0000001", "019-001-0000002"]);
    const [f1, f2] = filas;
    expect(f1).toMatchObject({ trozas: 3, anuladas: 1, m3: 1.787, m3Anuladas: 2, sinMedida: 1, fecha: "2026-09-10" });
    expect(f1.especies).toEqual(["Cumala", "Tornillo"]);
    expect(f1.lineas.map((e) => e.trozaCode)).toEqual(["A", "B", "S", "X"]);
    expect(f1.guia?.id).toBe("g1");
    expect(filaAnulada(f1)).toBe(false);
    expect(filaAnulada(f2)).toBe(true);
  });

  it("«Copiar datos» arma un texto para pegar", () => {
    const e = linea({ trozaCode: "A", trozado: trozado({}) });
    const texto = textoDelDespacho(e, g1, medidasDeLinea(e));
    expect(texto).toContain("Troza A (árbol 85)");
    expect(texto).toContain("D1 65 cm · D2 60 cm · Largo 4.20 m");
    expect(texto).toContain("Placa: ABC-123");
  });
});
