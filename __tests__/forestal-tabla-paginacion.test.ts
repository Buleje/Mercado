import { describe, expect, it } from "vitest";
import {
  etiquetaFilasPorPagina,
  numerosDePagina,
  rangoDePagina,
  rotuloRango,
} from "@/lib/forestal/tabla-paginacion";

/**
 * La paginación de las tablas del libro (ADR-344).
 *
 * Lo que se prueba es lo que el operador ve escrito —«mostrando 26–50 de 340»—
 * y el caso que rompe todas las tablas paginadas: filtrar estando en la página 7
 * y quedarse mirando una pantalla vacía.
 */

describe("rango de la página", () => {
  it("corta de a tamaños exactos", () => {
    const r = rangoDePagina(340, 25, 1);
    expect(r).toMatchObject({ pagina: 1, paginas: 14, desde: 26, hasta: 50, inicio: 25, fin: 50 });
  });

  it("la última página trae el resto, no un tamaño completo", () => {
    const r = rangoDePagina(52, 25, 2);
    expect(r).toMatchObject({ desde: 51, hasta: 52, inicio: 50, fin: 52 });
  });

  it("acota la página cuando el filtro achicó la lista", () => {
    // Estaba en la 7 y ahora hay 30 filas: vuelve sola a la última con datos.
    const r = rangoDePagina(30, 25, 7);
    expect(r.pagina).toBe(1);
    expect(r.desde).toBe(26);
    expect(r.hasta).toBe(30);
  });

  it("sin filas no inventa un rango", () => {
    const r = rangoDePagina(0, 25, 3);
    expect(r).toMatchObject({ pagina: 0, paginas: 1, desde: 0, hasta: 0, total: 0 });
  });

  it("«todas» (0) es una sola página con todo", () => {
    const r = rangoDePagina(340, 0, 5);
    expect(r).toMatchObject({ pagina: 0, paginas: 1, desde: 1, hasta: 340 });
  });

  it("no acepta páginas negativas ni fraccionarias", () => {
    expect(rangoDePagina(100, 25, -3).pagina).toBe(0);
    expect(rangoDePagina(100, 25, 1.9).pagina).toBe(1);
  });
});

describe("números que se dibujan", () => {
  it("con pocas páginas se muestran todas", () => {
    expect(numerosDePagina(4, 1)).toEqual([0, 1, 2, 3]);
  });

  it("con muchas, primera, última y las vecinas de la actual", () => {
    expect(numerosDePagina(20, 9)).toEqual([0, null, 8, 9, 10, null, 19]);
  });

  it("en los extremos no deja huecos falsos", () => {
    expect(numerosDePagina(20, 0)).toEqual([0, 1, null, 19]);
    expect(numerosDePagina(20, 19)).toEqual([0, null, 18, 19]);
  });

  it("una sola página no dibuja navegación", () => {
    expect(numerosDePagina(1, 0)).toEqual([0]);
  });
});

describe("el rótulo", () => {
  it("dice el rango cuando hay más de una página", () => {
    expect(rotuloRango(rangoDePagina(340, 25, 1), "troza")).toBe("Mostrando 26–50 de 340 trozas");
  });

  it("con todo a la vista dice sólo el total", () => {
    expect(rotuloRango(rangoDePagina(12, 25, 0), "troza")).toBe("12 trozas");
  });

  it("respeta el singular y el plural irregular", () => {
    expect(rotuloRango(rangoDePagina(1, 25, 0), "troza")).toBe("1 troza");
    expect(rotuloRango(rangoDePagina(0, 25, 0), "consumo", "consumos")).toBe("Sin consumos");
  });

  it("la etiqueta del selector nombra «Todas»", () => {
    expect(etiquetaFilasPorPagina(0)).toBe("Todas");
    expect(etiquetaFilasPorPagina(50)).toBe("50 por página");
  });
});
