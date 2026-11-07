import { describe, expect, it } from "vitest";
import {
  describirRango,
  dentroDelRango,
  estadisticas,
  estadisticasDelRango,
  filasARellenar,
  normalizarRango,
  rangoATsv,
  tamañoRango,
} from "@/lib/forestal/seleccion-celdas";

describe("normalizarRango · arrastrar en las cuatro direcciones", () => {
  it("de arriba hacia abajo", () => {
    expect(normalizarRango({ fila: 1, col: 2 }, { fila: 5, col: 4 })).toEqual({
      filaIni: 1, filaFin: 5, colIni: 2, colFin: 4,
    });
  });

  it("de abajo hacia arriba da el MISMO rectángulo", () => {
    // Sin normalizar, `filaIni > filaFin` hace que el recorrido salga vacío: la
    // selección "no hacía nada" y parecía un bug del mouse.
    expect(normalizarRango({ fila: 5, col: 4 }, { fila: 1, col: 2 })).toEqual({
      filaIni: 1, filaFin: 5, colIni: 2, colFin: 4,
    });
  });

  it("una sola celda es un rango de 1×1", () => {
    const r = normalizarRango({ fila: 3, col: 3 }, { fila: 3, col: 3 });
    expect(tamañoRango(r)).toBe(1);
  });
});

describe("dentroDelRango", () => {
  const r = normalizarRango({ fila: 2, col: 1 }, { fila: 4, col: 3 });
  it("incluye los bordes", () => {
    expect(dentroDelRango(r, { fila: 2, col: 1 })).toBe(true);
    expect(dentroDelRango(r, { fila: 4, col: 3 })).toBe(true);
  });
  it("deja afuera lo de al lado", () => {
    expect(dentroDelRango(r, { fila: 1, col: 2 })).toBe(false);
    expect(dentroDelRango(r, { fila: 3, col: 4 })).toBe(false);
  });
  it("sin rango no hay nada seleccionado", () => {
    expect(dentroDelRango(null, { fila: 0, col: 0 })).toBe(false);
  });
});

describe("estadisticas · lo que muestra la barra", () => {
  it("suma, promedio, mínimo y máximo", () => {
    const s = estadisticas([10, 20, 30]);
    expect(s).toMatchObject({ celdas: 3, numeros: 3, suma: 60, promedio: 20, minimo: 10, maximo: 30 });
  });

  it("distingue celdas de números: una especie vacía no es un cero", () => {
    // Excel separa «Recuento» de «Cuenta numérica» por esto mismo: diez filas
    // de las que dos no tienen dato no son diez valores.
    const s = estadisticas([10, null, 20, undefined]);
    expect(s.celdas).toBe(4);
    expect(s.numeros).toBe(2);
    expect(s.suma).toBe(30);
    expect(s.promedio).toBe(15);
  });

  it("sin números devuelve null, NO cero", () => {
    // Un mínimo de 0 sobre una selección vacía haría creer que hay una pieza
    // que mide nada.
    const s = estadisticas([null, null]);
    expect(s.suma).toBe(0);
    expect(s.promedio).toBeNull();
    expect(s.minimo).toBeNull();
    expect(s.maximo).toBeNull();
  });

  it("descarta NaN e Infinity, que no son medidas", () => {
    const s = estadisticas([1, Number.NaN, Number.POSITIVE_INFINITY, 3]);
    expect(s.numeros).toBe(2);
    expect(s.suma).toBe(4);
  });

  it("no arrastra la cola de float al sumar muchos decimales", () => {
    // 300 piezas de 0.3 daban "89,99999999999999" en pantalla.
    const s = estadisticas(Array.from({ length: 300 }, () => 0.3));
    expect(s.suma).toBe(90);
  });
});

describe("estadisticasDelRango", () => {
  // Grilla de prueba: fila × 10 en la col 0, fila × 100 en la col 1.
  const leer = (fila: number, col: number) => (col === 0 ? fila * 10 : fila * 100);

  it("recorre el rectángulo completo", () => {
    const r = normalizarRango({ fila: 1, col: 0 }, { fila: 3, col: 1 });
    const s = estadisticasDelRango(r, leer);
    expect(s.celdas).toBe(6);
    // (10+100) + (20+200) + (30+300)
    expect(s.suma).toBe(660);
  });

  it("una sola columna suma sólo esa", () => {
    const r = normalizarRango({ fila: 1, col: 0 }, { fila: 3, col: 0 });
    expect(estadisticasDelRango(r, leer).suma).toBe(60);
  });
});

describe("filasARellenar · el arrastre del asa", () => {
  it("hacia abajo, sin incluir el origen", () => {
    // El origen aporta el valor: volver a escribirlo sería un cambio de estado
    // que no cambia nada.
    expect(filasARellenar(0, 4)).toEqual([1, 2, 3, 4]);
  });

  it("hacia arriba también rellena", () => {
    expect(filasARellenar(4, 1)).toEqual([3, 2, 1]);
  });

  it("soltar en el mismo lugar no rellena nada", () => {
    expect(filasARellenar(2, 2)).toEqual([]);
  });
});

describe("rangoATsv · pegar en Excel", () => {
  it("separa con tabulación y salto de línea reales", () => {
    // Con `;` o `,` Excel pega todo en una sola columna — el mismo error que ya
    // se corrigió en las plantillas descargables.
    const r = normalizarRango({ fila: 0, col: 0 }, { fila: 1, col: 1 });
    const tsv = rangoATsv(r, (f, c) => `f${f}c${c}`);
    expect(tsv).toBe("f0c0\tf0c1\nf1c0\tf1c1");
  });
});

describe("describirRango", () => {
  it("una columna se describe sólo por filas", () => {
    expect(describirRango(normalizarRango({ fila: 0, col: 1 }, { fila: 7, col: 1 }))).toBe("8 filas");
  });
  it("una sola celda va en singular", () => {
    expect(describirRango(normalizarRango({ fila: 2, col: 1 }, { fila: 2, col: 1 }))).toBe("1 fila");
  });
  it("varias columnas se nombran", () => {
    expect(describirRango(normalizarRango({ fila: 0, col: 0 }, { fila: 2, col: 2 }))).toBe("3 filas × 3 columnas");
  });
});
