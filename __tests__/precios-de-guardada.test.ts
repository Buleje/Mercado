import { describe, expect, it } from "vitest";
import { preciosParejosPorEspecie } from "@/lib/forestal/precios-de-guardada";

const p = (especie: string | undefined, precio?: number) => ({ especie, precio });

describe("preciosParejosPorEspecie (reabrir una guardada con sus precios)", () => {
  it("una especie a otro precio que el general → su precio en el editor «A mano»", () => {
    expect(preciosParejosPorEspecie([p("Tornillo", 2.5), p("Tornillo", 2.5), p("Cumala", 1.8)], 1.8)).toEqual({ tornillo: "2.5" });
  });

  it("todas al general → null (no hay nada que restaurar)", () => {
    expect(preciosParejosPorEspecie([p("Tornillo", 2), p("Cumala", 2)], 2)).toBeNull();
  });

  it("la misma especie a dos precios (dos tratos) → null: queda como hoy", () => {
    expect(preciosParejosPorEspecie([p("Tornillo", 2.5), p("Tornillo", 3)], 2)).toBeNull();
  });

  it("una pieza sin precio propio vale el general (como su importe guardado), no apaga la reposición", () => {
    expect(preciosParejosPorEspecie([p("Tornillo", 2.5), p("Cumala")], 2)).toEqual({ tornillo: "2.5" });
    /* La misma especie con y sin precio propio no es pareja. */
    expect(preciosParejosPorEspecie([p("Tornillo", 2.5), p("Tornillo")], 2)).toBeNull();
  });

  it("una cubicación vieja sin ningún precio por pieza → null (queda el general)", () => {
    expect(preciosParejosPorEspecie([p("Tornillo"), p("Cumala")], 2)).toBeNull();
  });

  it("una pieza sin especie con otro precio que el general → null", () => {
    expect(preciosParejosPorEspecie([p(undefined, 3), p("Tornillo", 2.5)], 2)).toBeNull();
  });

  it("una especie a S/ 0 con general puesto → null (el editor la mandaría al general)", () => {
    expect(preciosParejosPorEspecie([p("Tornillo", 0), p("Cumala", 2)], 2)).toBeNull();
  });

  it("compara en céntimos y junta mayúsculas y espacios", () => {
    expect(preciosParejosPorEspecie([p(" tornillo ", 2.5), p("TORNILLO", 2.5000001)], 0)).toEqual({ tornillo: "2.5" });
  });

  it("sin piezas → null", () => {
    expect(preciosParejosPorEspecie([], 2)).toBeNull();
  });
});
