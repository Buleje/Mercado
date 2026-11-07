import { describe, expect, it } from "vitest";
import { agruparCandidatosPorGuia, type CandidatoFlete } from "@/lib/forestal/fletes";

/**
 * El bug real (2026-09-19): la bandeja de fletes ofrecía anotar el mismo viaje
 * una vez por ASIENTO. Una GTF con dos especies son dos asientos del libro
 * —el formato oficial pide una línea por especie— pero un solo camión.
 *
 * Se vio primero como un warning de React («two children with the same key»,
 * porque la lista usa el N° de guía como clave) y resultó ser peor: el volumen
 * de cada fila era el de UN asiento. En el tenant real, la guía
 * 010-001-0000008 son 13.845 m³ repartidos en 4 asientos y la bandeja mostraba
 * 6.049 — un flete cobrado por m³ se cobraba de menos.
 */

const base = (over: Partial<CandidatoFlete> = {}): CandidatoFlete => ({
  gtfNumber: "010-001-0000008",
  fecha: "2026-07-15",
  proveedorNombre: "Maderera Amazónica SAC",
  volumenM3: 6.049,
  placa: "B9X-777",
  transportistaNombre: "Transportes del Río EIRL",
  conductorNombre: "Juan Pérez",
  tipoTransporte: "publico",
  originCode: "10-HUA-PUE/PER-FMP-2026-007",
  ...over,
});

describe("agruparCandidatosPorGuia", () => {
  it("una guía con cuatro asientos ofrece UN viaje, no cuatro", () => {
    const r = agruparCandidatosPorGuia([base(), base(), base(), base()]);
    expect(r).toHaveLength(1);
    expect(r[0].gtfNumber).toBe("010-001-0000008");
  });

  it("suma el volumen de todos los asientos de la guía", () => {
    const r = agruparCandidatosPorGuia([
      base({ volumenM3: 6.049 }),
      base({ volumenM3: 4.5 }),
      base({ volumenM3: 3.296 }),
    ]);
    // 13.845 m³ — el total de la guía, no el del primer renglón
    expect(r[0].volumenM3).toBeCloseTo(13.845, 3);
  });

  it("sin ningún volumen cargado deja null, no cero (un flete sin m³ no es un flete de cero)", () => {
    const r = agruparCandidatosPorGuia([base({ volumenM3: null }), base({ volumenM3: null })]);
    expect(r[0].volumenM3).toBeNull();
  });

  it("un asiento con volumen y otro sin él suma sólo lo que hay", () => {
    const r = agruparCandidatosPorGuia([base({ volumenM3: null }), base({ volumenM3: 2.5 })]);
    expect(r[0].volumenM3).toBe(2.5);
  });

  it("se queda con la fecha del asiento MÁS VIEJO: el camión llegó ese día", () => {
    const r = agruparCandidatosPorGuia([
      base({ fecha: "2026-07-20" }),
      base({ fecha: "2026-07-15" }),
      base({ fecha: "2026-07-18" }),
    ]);
    expect(r[0].fecha).toBe("2026-07-15");
  });

  it("completa los datos del papel que le falten al primer asiento", () => {
    const r = agruparCandidatosPorGuia([
      base({ placa: null, transportistaNombre: null, originCode: null }),
      base({ placa: "ABC-123", transportistaNombre: "Otro EIRL", originCode: "19-SEC/REG-PLT-2018-020" }),
    ]);
    expect(r[0].placa).toBe("ABC-123");
    expect(r[0].transportistaNombre).toBe("Otro EIRL");
    expect(r[0].originCode).toBe("19-SEC/REG-PLT-2018-020");
  });

  it("no mezcla guías distintas", () => {
    const r = agruparCandidatosPorGuia([
      base({ gtfNumber: "010-001-0000008" }),
      base({ gtfNumber: "010-001-0000006" }),
      base({ gtfNumber: "010-001-0000008" }),
    ]);
    expect(r).toHaveLength(2);
    expect(r.map((c) => c.gtfNumber).sort()).toEqual(["010-001-0000006", "010-001-0000008"]);
  });

  it("no toca los candidatos de entrada (el que llama puede seguir usando su lista)", () => {
    const entrada = [base({ volumenM3: 1 }), base({ volumenM3: 2 })];
    agruparCandidatosPorGuia(entrada);
    expect(entrada[0].volumenM3).toBe(1);
  });
});
