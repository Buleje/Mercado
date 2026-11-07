import { describe, expect, it } from "vitest";
import { cubicarPieza } from "@/lib/forestal/cubicacion";
import type { TipoComercial } from "@/lib/forestal/cubicacion-tipo";
import { precioDePieza } from "@/lib/forestal/precio-de-pieza";
import { preciosAManoDeGuardada, preciosParejosPorEspecie } from "@/lib/forestal/precios-de-guardada";

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

describe("preciosAManoDeGuardada (reabrir con precio por especie y tipo, 28-10)", () => {
  const conMedida = (especie: string | undefined, tipo: TipoComercial, precio?: number, cantidad = 10) => {
    const base = { cantidad, espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
    return { especie, precio, tipo, ...base, ...cubicarPieza(base) };
  };

  it("una especie con un tipo a otro precio → la especie al de más PT y el tipo aparte", () => {
    const r = preciosAManoDeGuardada([conMedida("Tornillo", "Comercial", 2.5, 30), conMedida("Tornillo", "Corta", 1.8), conMedida("Cumala", "Tabla", 2)], 2);
    expect(r).toEqual({ porEspecie: { tornillo: "2.5" }, porEspecieTipo: { "tornillo|Corta": "1.8" }, especies: ["tornillo", "cumala"] });
  });

  it("si la mayor parte va al general, sólo el tipo distinto queda a mano", () => {
    const r = preciosAManoDeGuardada([conMedida("Tornillo", "Comercial", 2, 30), conMedida("Tornillo", "Corta", 1.5)], 2);
    expect(r).toEqual({ porEspecie: {}, porEspecieTipo: { "tornillo|Corta": "1.5" }, especies: ["tornillo"] });
  });

  it("todo al general → listas vacías (limpia lo que había de esas especies), no null", () => {
    expect(preciosAManoDeGuardada([conMedida("Tornillo", "Comercial", 2), conMedida("Tornillo", "Corta")], 2))
      .toEqual({ porEspecie: {}, porEspecieTipo: {}, especies: ["tornillo"] });
  });

  it("dos precios dentro del mismo tipo de una especie (dos tratos) → null", () => {
    expect(preciosAManoDeGuardada([conMedida("Tornillo", "Corta", 1.5), conMedida("Tornillo", "Corta", 1.6)], 2)).toBeNull();
  });

  it("un tipo en S/ 0 con la especie a precio → null (el editor lo mandaría a la especie)", () => {
    expect(preciosAManoDeGuardada([conMedida("Tornillo", "Comercial", 2.5, 30), conMedida("Tornillo", "Corta", 0)], 2)).toBeNull();
  });

  it("vieja sin precio por pieza, o una pieza sin especie con otro precio → null", () => {
    expect(preciosAManoDeGuardada([conMedida("Tornillo", "Corta")], 2)).toBeNull();
    expect(preciosAManoDeGuardada([conMedida(undefined, "Corta", 3), conMedida("Tornillo", "Corta", 2.5)], 2)).toBeNull();
  });

  it("repuesto en el resolver, cada pieza vuelve a valer lo que se guardó", () => {
    const piezas = [conMedida("Tornillo", "Comercial", 2.5, 30), conMedida("Tornillo", "Corta", 1.8), conMedida("Cumala", "Tabla", 2)];
    const r = preciosAManoDeGuardada(piezas, 2)!;
    const c = { modo: "manual" as const, aMano: { general: 2, porEspecie: r.porEspecie, porEspecieTipo: r.porEspecieTipo }, tratos: new Map(), grupos: [], fecha: "2026-10-28" };
    expect(piezas.map((p) => precioDePieza(p, c).precioPt)).toEqual([2.5, 1.8, 2]);
  });
});
