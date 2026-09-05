/**
 * Cotejo público: el ANEXO N° 04 que viaja contra la línea del Libro CTP.
 */
import { describe, expect, it } from "vitest";
import { cotejarAnexoConLibro, normalizarGuia } from "@/lib/forestal/ctp-verificacion";

const LINEA = { gtfNumber: "19-001-0000052", pieces: 79, quantity: 12.5, unit: "m3" };

describe("cotejarAnexoConLibro", () => {
  it("todo coincide: la guía tipeada distinta no es discrepancia", () => {
    const r = cotejarAnexoConLibro({ gtf: "19 - 001 - 0000052", totalPiezas: 79, totalM3: 12.5 }, LINEA);
    expect(r.discrepancias).toEqual([]);
    expect(r.coincide).toBe(true);
  });

  it("guía distinta: es el caso que un anexo adulterado aprovecha", () => {
    const r = cotejarAnexoConLibro({ gtf: "19-001-0000053", totalPiezas: 79, totalM3: 12.5 }, LINEA);
    expect(r.coincide).toBe(false);
    expect(r.discrepancias[0]).toMatch(/ampara la guía 19-001-0000053/);
  });

  it("piezas de más en el papel", () => {
    const r = cotejarAnexoConLibro({ gtf: LINEA.gtfNumber, totalPiezas: 95, totalM3: 12.5 }, LINEA);
    expect(r.discrepancias).toEqual(["El anexo declara 95 piezas y el libro registra 79."]);
  });

  it("volumen: tolera el redondeo (0,5 %) y acusa la diferencia real", () => {
    expect(cotejarAnexoConLibro({ gtf: LINEA.gtfNumber, totalPiezas: 79, totalM3: 12.53 }, LINEA).discrepancias).toEqual([]);
    expect(cotejarAnexoConLibro({ gtf: LINEA.gtfNumber, totalPiezas: 79, totalM3: 14 }, LINEA).discrepancias[0]).toMatch(/14\.000 m³/);
  });

  it("unidades distintas no se comparan: un cotejo aproximado acusaría en falso", () => {
    const enPt = { gtfNumber: "19-001-0000052", pieces: 79, quantity: 5300, unit: "pt" };
    const r = cotejarAnexoConLibro({ gtf: enPt.gtfNumber, totalPiezas: 79, totalM3: 12.5 }, enPt);
    expect(r.discrepancias).toEqual([]);
    expect(r.coincide).toBe(true);
  });

  it("sin anexo, o con campos vacíos, no se inventa un veredicto", () => {
    expect(cotejarAnexoConLibro(null, LINEA)).toEqual({ discrepancias: [], coincide: false });
    const r = cotejarAnexoConLibro({ gtf: "", totalPiezas: 0, totalM3: 0 }, LINEA);
    expect(r.discrepancias).toEqual([]);
    expect(r.coincide).toBe(false);
  });

  it("normalizarGuia limpia espacios, puntos y guiones repetidos", () => {
    expect(normalizarGuia(" 19-001 . 0000052 ")).toBe("19-0010000052");
    expect(normalizarGuia("19--001")).toBe("19-001");
    expect(normalizarGuia(null)).toBe("");
  });
});
