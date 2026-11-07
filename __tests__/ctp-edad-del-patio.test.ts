/**
 * La edad del patio (Libro CTP · «Productos disponibles»).
 *
 * Los números son los del patio de Blas al 2026-09-15: un paquete de 331 días,
 * dos de 95, veinticuatro de 45 (77,875 m³) y seis de 5. Lo que se prueba es
 * que el borde de los tramos esté donde dice la etiqueta, que una fecha
 * imposible no genere un número imposible, y que los m³ del resumen cuadren.
 */
import { describe, expect, it } from "vitest";
import {
  DIAS_MADURO,
  DIAS_VIEJO,
  ETIQUETA_TRAMO,
  TONO_TRAMO,
  edadEnDias,
  fmtEdad,
  resumenDeEdad,
  tramoDeEdad,
  type FilaConEdad,
} from "@/lib/forestal/edad-del-patio";

/** Un instante de la tarde en Lima: la hora entra por parámetro, siempre. */
const AHORA = new Date("2026-09-15T14:30:00-05:00");

describe("edadEnDias · cuántos días lleva parada", () => {
  it("el paquete más viejo de Blas da 331 días", () => {
    expect(edadEnDias("2025-10-19", AHORA)).toBe(331);
  });

  it("no cambia con la hora del día: al anochecer en Lima ya es otro día en UTC", () => {
    // Sin leer `ahora` en el calendario de Lima, a las 23:00 del 15 (= 04:00
    // UTC del 16) la columna entera sumaba un día sola.
    expect(edadEnDias("2026-08-01", new Date("2026-09-15T07:00:00-05:00"))).toBe(45);
    expect(edadEnDias("2026-08-01", new Date("2026-09-15T23:00:00-05:00"))).toBe(45);
    expect(edadEnDias("2026-08-01", new Date("2026-09-15T00:10:00-05:00"))).toBe(45);
  });

  it("una fecha FUTURA da 0, nunca un negativo", () => {
    // Un dedazo al cargar la corrida no puede pintar «hace −12 días»: el
    // operador deja de creerle a toda la columna.
    expect(edadEnDias("2026-12-31", AHORA)).toBe(0);
  });

  it("una fecha basura o ausente da null, no 0", () => {
    expect(edadEnDias("no-es-una-fecha", AHORA)).toBeNull();
    expect(edadEnDias("", AHORA)).toBeNull();
    expect(edadEnDias(null, AHORA)).toBeNull();
    expect(edadEnDias(undefined, AHORA)).toBeNull();
    expect(edadEnDias("2026-08-01", new Date("caca"))).toBeNull();
  });
});

describe("tramoDeEdad · el borde pertenece al tramo de abajo", () => {
  it("331 días es «viejo»", () => {
    expect(tramoDeEdad(331)).toBe("viejo");
  });

  it("exactamente 30 es «fresco» y 31 ya es «maduro»", () => {
    // La etiqueta dice «Hasta 30 días»: si el día 30 saltara a naranja, el
    // color contradiría al texto de su propia leyenda.
    expect(tramoDeEdad(DIAS_MADURO)).toBe("fresco");
    expect(tramoDeEdad(DIAS_MADURO + 1)).toBe("maduro");
  });

  it("exactamente 90 es «maduro» y 91 ya es «viejo»", () => {
    expect(tramoDeEdad(DIAS_VIEJO)).toBe("maduro");
    expect(tramoDeEdad(DIAS_VIEJO + 1)).toBe("viejo");
  });

  it("sin días no hay tramo: null, no «fresco»", () => {
    expect(tramoDeEdad(null)).toBeNull();
    expect(tramoDeEdad(Number.NaN)).toBeNull();
  });

  it("cada tramo dice su rango y trae su tono del DS", () => {
    expect(ETIQUETA_TRAMO.fresco).toBe("Hasta 30 días");
    expect(ETIQUETA_TRAMO.maduro).toBe("30 a 90 días");
    expect(ETIQUETA_TRAMO.viejo).toBe("Más de 90 días");
    expect(TONO_TRAMO).toEqual({ fresco: "success", maduro: "warning", viejo: "danger" });
  });
});

/**
 * El patio real de Blas: 33 filas.
 *   1 fila  a 331 d →  3,8140 m³
 *   2 filas a  95 d →  6,2500 m³
 *  24 filas a  45 d → 77,8750 m³
 *   6 filas a   5 d →  7,4070 m³
 */
const PATIO_BLAS: FilaConEdad[] = [
  { dias: 331, volumenM3: 3.814 },
  { dias: 95, volumenM3: 2.5 },
  { dias: 95, volumenM3: 3.75 },
  ...Array.from({ length: 23 }, () => ({ dias: 45, volumenM3: 3.2448 })),
  { dias: 45, volumenM3: 3.2446 },
  ...Array.from({ length: 6 }, () => ({ dias: 5, volumenM3: 1.2345 })),
];

describe("resumenDeEdad · el patio de Blas al 2026-09-15", () => {
  it("son 33 filas repartidas 6 / 24 / 3", () => {
    expect(PATIO_BLAS).toHaveLength(33);
    const r = resumenDeEdad(PATIO_BLAS);
    expect(r.porTramo.fresco.filas).toBe(6);
    expect(r.porTramo.maduro.filas).toBe(24);
    expect(r.porTramo.viejo.filas).toBe(3);
    expect(r.sinFecha.filas).toBe(0);
  });

  it("los m³ por tramo salen redondeados a 4 decimales AL FINAL", () => {
    // Redondeando en cada paso, las 24 filas de 3,2448 no darían 77,875.
    const r = resumenDeEdad(PATIO_BLAS);
    expect(r.porTramo.maduro.volumenM3).toBe(77.875);
    expect(r.porTramo.viejo.volumenM3).toBe(10.064); // 3,814 + 2,5 + 3,75
    expect(r.porTramo.fresco.volumenM3).toBe(7.407); // 6 × 1,2345
  });

  it("el récord del patio es 331 días", () => {
    expect(resumenDeEdad(PATIO_BLAS).masViejoDias).toBe(331);
  });

  it("lo que no tiene fecha va a `sinFecha`, no a «fresco»", () => {
    // Pintar de verde una fila sin fecha es afirmar que es reciente.
    const r = resumenDeEdad([
      { dias: null, volumenM3: 2.5 },
      { dias: null, volumenM3: 1.25 },
      { dias: 5, volumenM3: 1 },
    ]);
    expect(r.sinFecha).toEqual({ filas: 2, volumenM3: 3.75 });
    expect(r.porTramo.fresco).toEqual({ filas: 1, volumenM3: 1 });
  });

  it("un patio vacío no tiene récord", () => {
    const r = resumenDeEdad([]);
    expect(r.masViejoDias).toBeNull();
    expect(r.porTramo.viejo).toEqual({ filas: 0, volumenM3: 0 });
  });
});

describe("fmtEdad · cómo se lee en la celda", () => {
  it("castellano, con el singular donde va", () => {
    expect(fmtEdad(45)).toBe("hace 45 días");
    expect(fmtEdad(1)).toBe("hace 1 día");
    expect(fmtEdad(0)).toBe("hoy");
    expect(fmtEdad(331)).toBe("hace 331 días");
  });

  it("sin fecha es un guion, no «0 días»", () => {
    expect(fmtEdad(null)).toBe("—");
  });
});
