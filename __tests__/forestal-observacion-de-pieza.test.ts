/**
 * La observación de la carga del cubicador (Brandon, 2026-09-23): suelta va a
 * la PRÓXIMA pieza y se borra; con candado, a todas las que siguen. Y como el
 * código de la troza, no cambia lo que se declara.
 */
import { describe, expect, it } from "vitest";
import {
  leerObservacionGuardada,
  OBSERVACION_MAX,
  OBSERVACION_VACIA,
  tomarObservacion,
} from "@/lib/forestal/observacion-de-pieza";
import { unificarPorMedida, type PiezaCubicada } from "@/lib/forestal/cubicacion";

describe("tomarObservacion", () => {
  it("suelta: la lleva la próxima pieza y el campo queda vacío", () => {
    const primera = tomarObservacion({ texto: "rajada", fija: false });
    expect(primera.valor).toBe("rajada");
    expect(primera.siguiente).toEqual({ texto: "", fija: false });
    /* La segunda pieza de la misma frase dictada ya no la lleva. */
    expect(tomarObservacion(primera.siguiente).valor).toBeUndefined();
  });

  it("fija: la llevan todas y el estado no cambia (misma referencia)", () => {
    const estado = { texto: "para López", fija: true };
    const a = tomarObservacion(estado);
    const b = tomarObservacion(a.siguiente);
    expect([a.valor, b.valor]).toEqual(["para López", "para López"]);
    expect(b.siguiente).toBe(estado);
  });

  it("puros espacios no son una observación, y se recorta", () => {
    expect(tomarObservacion({ texto: "   ", fija: false }).valor).toBeUndefined();
    expect(tomarObservacion({ texto: "  canto  ", fija: false }).valor).toBe("canto");
  });

  it("no pasa del tope", () => {
    expect(tomarObservacion({ texto: "x".repeat(500), fija: true }).valor).toHaveLength(OBSERVACION_MAX);
  });
});

describe("leerObservacionGuardada", () => {
  it("sólo vuelve la fija con texto", () => {
    expect(leerObservacionGuardada(JSON.stringify({ texto: "segunda", fija: true }))).toEqual({ texto: "segunda", fija: true });
    expect(leerObservacionGuardada(JSON.stringify({ texto: "segunda", fija: false }))).toEqual(OBSERVACION_VACIA);
    expect(leerObservacionGuardada(JSON.stringify({ texto: " ", fija: true }))).toEqual(OBSERVACION_VACIA);
  });

  it("lo roto o ajeno vuelve vacío, sin tirar", () => {
    for (const raw of [null, "", "{", "[]", "3", JSON.stringify({ texto: 5, fija: true })]) {
      expect(leerObservacionGuardada(raw)).toEqual(OBSERVACION_VACIA);
    }
  });
});

describe("la observación no cambia lo que se declara", () => {
  const pieza = (id: string, observacion?: string): PiezaCubicada => ({
    id, cantidad: 8, espesor: 2, ancho: 8, largo: 10,
    uEspesor: "pulg", uAncho: "pulg", uLargo: "pies",
    especie: "Tornillo", pieTablar: 106.67, m3: 0.2516,
    ...(observacion ? { observacion } : {}),
  });

  it("dos piezas iguales con observaciones distintas se unen en UNA fila, sin observación", () => {
    const r = unificarPorMedida([pieza("a", "rajada"), pieza("b", "para López")]);
    expect(r).toHaveLength(1);
    expect(r[0]!.cantidad).toBe(16);
    expect(r[0]).not.toHaveProperty("observacion");
  });

  it("con o sin observaciones, unificarPorMedida da lo mismo", () => {
    expect(unificarPorMedida([pieza("a", "rajada"), pieza("b")])).toEqual(unificarPorMedida([pieza("a"), pieza("b")]));
  });
});
