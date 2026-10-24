/**
 * Métricas de texto: por qué la planilla se veía descuadrada.
 *
 * El ancho de columna de un .xlsx está en "caracteres" de Calibri 11, donde un
 * dígito mide 7 px. Si el navegador dibuja con otra fuente —Calibri no existe
 * en Linux— el mismo texto ocupa más y ya no entra: columnas apretadas, títulos
 * cortados, todo corrido. Acá se blinda la conversión en las dos direcciones.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANCHO_DIGITO_EXCEL, anchoEnPantalla, anchoParaArchivo, factorAncho,
  ptAPx, reiniciarMetricas, TAMANO_BASE_PX,
} from "@/lib/documentos/hoja-metricas";

/** Simula un navegador cuya fuente mide `porDigito` píxeles por dígito. */
function fingirFuente(porDigito: number) {
  reiniciarMetricas();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    font: "",
    measureText: (t: string) => ({ width: t.length * porDigito }),
  } as unknown as CanvasRenderingContext2D);
}

beforeEach(() => {
  vi.restoreAllMocks();
  reiniciarMetricas();
});

describe("puntos a píxeles", () => {
  it("11 pt es el tamaño base de Excel", () => {
    expect(TAMANO_BASE_PX).toBeCloseTo(14.67, 1);
  });

  it("un título de 16 pt es bastante más grande que el texto normal", () => {
    // Aplicar los puntos como si fueran píxeles dejaba el título igual de chico.
    expect(ptAPx(16)).toBeCloseTo(21.33, 1);
    expect(ptAPx(16)).toBeGreaterThan(TAMANO_BASE_PX);
  });

  it("10 pt es más chico que el base", () => {
    expect(ptAPx(10)).toBeLessThan(TAMANO_BASE_PX);
  });
});

describe("factor de ancho", () => {
  it("con las métricas de Calibri no cambia nada", () => {
    fingirFuente(ANCHO_DIGITO_EXCEL);
    expect(factorAncho()).toBeCloseTo(1, 2);
    expect(anchoEnPantalla(100)).toBe(100);
  });

  it("EL CASO REAL: sin Calibri, las columnas se agrandan a la fuente que hay", () => {
    // Medido en el navegador de esta máquina: 9,32 px por dígito.
    fingirFuente(9.32);
    expect(factorAncho()).toBeCloseTo(1.33, 1);
    // Una columna de 8 caracteres (61 px en Excel) necesita ~81 en pantalla.
    expect(anchoEnPantalla(61)).toBeGreaterThan(78);
  });

  it("nunca achica una columna, aunque la fuente sea más angosta", () => {
    // Achicar rompería más de lo que arregla: el texto del archivo dejaría de
    // entrar en su propia columna.
    fingirFuente(5);
    expect(factorAncho()).toBe(1);
  });

  it("una fuente disparatada no desarma la vista", () => {
    fingirFuente(40);
    expect(factorAncho()).toBeLessThanOrEqual(2);
  });

  it("se mide una sola vez y después sale de la caché", () => {
    fingirFuente(9.32);
    const espia = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    factorAncho();                    // la primera mide
    factorAncho(); factorAncho();     // las siguientes, no
    expect(espia).toHaveBeenCalledTimes(1);
  });
});

describe("ida y vuelta del ancho", () => {
  it("EL CASO QUE IMPORTA: arrastrar y guardar no infla la columna", () => {
    // Sin la vuelta, cada abrir-guardar en una máquina sin Calibri agrandaba
    // la columna un 33% más, hasta dejar el archivo irreconocible.
    fingirFuente(9.32);
    const original = 100;
    const enPantalla = anchoEnPantalla(original);
    expect(anchoParaArchivo(enPantalla)).toBeCloseTo(original, 0);
  });

  it("estable después de varias vueltas", () => {
    fingirFuente(9.32);
    let ancho = 120;
    for (let i = 0; i < 5; i++) ancho = anchoParaArchivo(anchoEnPantalla(ancho));
    expect(Math.abs(ancho - 120)).toBeLessThanOrEqual(1);
  });

  it("con Calibri la vuelta es exacta", () => {
    fingirFuente(ANCHO_DIGITO_EXCEL);
    expect(anchoParaArchivo(anchoEnPantalla(137))).toBe(137);
  });
});
