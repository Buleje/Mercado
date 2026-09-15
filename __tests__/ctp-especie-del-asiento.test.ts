/**
 * __tests__/ctp-especie-del-asiento.test.ts
 *
 * La corrida N.º 28 del tenant real (10/09: 6 paquetes, 0,2417 m³) se registró
 * sin especie y sin permiso porque el modal dejaba declarar con «Sin especie
 * declarada». Acá se fija la regla que lo impide.
 */
import { describe, expect, it } from "vitest";

import { avisoDeEspecie, especieDelAsiento } from "@/lib/forestal/especie-del-asiento";

describe("especieDelAsiento", () => {
  it("con una sola especie cubicada, esa declara y no se pregunta nada", () => {
    expect(especieDelAsiento(["Tornillo"], null)).toEqual({ estado: "de-lo-cubicado", especie: "Tornillo" });
  });

  it("sin especie en lo cubicado, falta: es el caso de la corrida 28", () => {
    const r = especieDelAsiento([], null);
    expect(r).toEqual({ estado: "falta", especie: null, motivo: "sin-especie" });
    expect(r.especie).toBeNull();
  });

  it("con varias cubicadas hay que elegir cuál declara el asiento", () => {
    expect(especieDelAsiento(["Tornillo", "Copaiba"], null)).toEqual({
      estado: "falta",
      especie: null,
      motivo: "varias",
    });
    expect(especieDelAsiento(["Tornillo", "Copaiba"], "Copaiba")).toEqual({ estado: "elegida", especie: "Copaiba" });
  });

  it("lo cubicado gana sobre lo elegido: corregir la especie al volver a cubicar tiene efecto", () => {
    expect(especieDelAsiento(["Tornillo"], "Copaiba")).toEqual({ estado: "de-lo-cubicado", especie: "Tornillo" });
  });

  it("«Tornillo» y « Tornillo » son la misma, y el vacío no cuenta como especie", () => {
    expect(especieDelAsiento(["Tornillo", " Tornillo "], null).estado).toBe("de-lo-cubicado");
    const vacias = especieDelAsiento(["", "  "], null);
    expect(vacias.estado === "falta" && vacias.motivo).toBe("sin-especie");
    expect(especieDelAsiento([], "   ")).toMatchObject({ estado: "falta" });
  });

  it("el aviso explica el caso, y calla cuando no hay nada que aclarar", () => {
    expect(avisoDeEspecie(especieDelAsiento(["Tornillo"], null), 20)).toBe("");
    expect(avisoDeEspecie(especieDelAsiento([], null), 20)).toContain("no dice de qué especie");
    expect(avisoDeEspecie(especieDelAsiento(["A", "B"], null), 20)).toContain("20 piezas");
  });
});
