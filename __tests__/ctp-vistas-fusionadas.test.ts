/**
 * Libro CTP — vistas que se mudaron a pestañas internas (panel unificado, ola 2).
 * Un enlace o un aviso viejo tiene que seguir llegando a la misma pantalla.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  ALIAS_FUSIONADAS,
  TECLAS_FUSIONADAS,
  destinoFusionado,
  plegarAlertasFusionadas,
  subPedidoPorVistaVieja,
} from "@/components/admin/forestal/ctp-vistas-fusionadas";

describe("destinoFusionado", () => {
  it("lleva cada vista vieja a su vista y pestaña nuevas", () => {
    expect(destinoFusionado("rentabilidad")).toEqual({ vista: "tablero", sub: "margen" });
    expect(destinoFusionado("reportes")).toEqual({ vista: "tablero", sub: "produccion" });
    expect(destinoFusionado("analisis")).toEqual({ vista: "tablero", sub: "tendencias" });
    expect(destinoFusionado("gtf-ingresadas")).toEqual({ vista: "ingresos", sub: "recepcionadas" });
  });

  it("una vista que no se mudó (o una clave heredada del objeto) no tiene destino", () => {
    expect(destinoFusionado("tablero")).toBeNull();
    expect(destinoFusionado("toString")).toBeNull();
    expect(destinoFusionado("")).toBeNull();
  });
});

describe("ALIAS_FUSIONADAS y TECLAS_FUSIONADAS", () => {
  it("el alias apunta a la vista que absorbió a la vieja", () => {
    expect(ALIAS_FUSIONADAS).toEqual({
      "gtf-ingresadas": "ingresos",
      reportes: "tablero",
      analisis: "tablero",
      rentabilidad: "tablero",
    });
  });

  it("cada tecla vieja apunta a una vista que se mudó, sin letras repetidas", () => {
    for (const t of TECLAS_FUSIONADAS) expect(destinoFusionado(t.vieja)).not.toBeNull();
    const letras = TECLAS_FUSIONADAS.map((t) => t.tecla);
    expect(new Set(letras).size).toBe(letras.length);
  });
});

describe("plegarAlertasFusionadas", () => {
  it("suma los avisos de la vista vieja en la que la absorbió", () => {
    expect(plegarAlertasFusionadas({ rentabilidad: 2, tablero: 1 })).toEqual({ tablero: 3 });
    expect(plegarAlertasFusionadas({ "gtf-ingresadas": 4, despacho: 1 })).toEqual({ ingresos: 4, despacho: 1 });
  });

  it("sin avisos, nada", () => {
    expect(plegarAlertasFusionadas({})).toEqual({});
  });
});

describe("subPedidoPorVistaVieja", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("una URL vieja abre la pestaña interna sólo en la vista que la absorbió", () => {
    window.history.replaceState(null, "", "/admin?tab=ctp-libro-operaciones&vista=reportes");
    expect(subPedidoPorVistaVieja("tablero")).toBe("produccion");
    expect(subPedidoPorVistaVieja("ingresos")).toBeUndefined();
  });

  it("una vista de hoy no pide pestaña", () => {
    window.history.replaceState(null, "", "/admin?tab=ctp-libro-operaciones&vista=tablero");
    expect(subPedidoPorVistaVieja("tablero")).toBeUndefined();
  });
});
