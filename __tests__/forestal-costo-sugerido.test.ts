/**
 * La sugerencia de costo del libro CTP (ADR-135).
 *
 * Es un número que va a terminar en un estado de resultados y en el costeo de
 * un despacho: lo que se testea acá es que NO invente, que no tome por bueno el
 * `0` de un campo sin llenar, y que diga de dónde salió.
 */
import { describe, expect, it } from "vitest";
import {
  costoPorM3,
  sugerirCostoPorM3,
  textoDeOrigen,
  tieneCosto,
  type IngresoValorizable,
} from "@/lib/forestal/costo-sugerido";

const ing = (over: Partial<IngresoValorizable> = {}): IngresoValorizable => ({
  id: Math.random().toString(36).slice(2),
  speciesCommonName: "Tornillo",
  providerName: "Maderera Blas",
  volumeM3: 10,
  costoTotal: 1000,
  entryDate: "2026-08-01T00:00:00.000Z",
  ...over,
});

describe("costoPorM3", () => {
  it("divide el costo entre el volumen, con dos decimales", () => {
    expect(costoPorM3(ing({ costoTotal: 1500, volumeM3: 10 }))).toBe(150);
    expect(costoPorM3(ing({ costoTotal: 1000, volumeM3: 3 }))).toBe(333.33);
  });

  it("un costo en CERO no es un costo: es el default de un campo sin llenar", () => {
    expect(costoPorM3(ing({ costoTotal: 0 }))).toBeNull();
    expect(costoPorM3(ing({ costoTotal: null }))).toBeNull();
    expect(costoPorM3(ing({ costoTotal: undefined }))).toBeNull();
    expect(tieneCosto(ing({ costoTotal: 0 }))).toBe(false);
    expect(tieneCosto(ing({ costoTotal: 1 }))).toBe(true);
  });

  it("sin volumen no se puede dividir", () => {
    expect(costoPorM3(ing({ volumeM3: 0 }))).toBeNull();
    expect(costoPorM3(ing({ volumeM3: null }))).toBeNull();
  });

  it("acepta los strings con los que viaja un Decimal de Prisma", () => {
    expect(costoPorM3(ing({ costoTotal: "1500.00", volumeM3: "10.000" }))).toBe(150);
  });
});

describe("sugerirCostoPorM3", () => {
  it("sin antecedentes NO inventa", () => {
    expect(sugerirCostoPorM3([], { especie: "Tornillo" })).toBeNull();
    expect(sugerirCostoPorM3([ing({ costoTotal: null })], { especie: "Tornillo" })).toBeNull();
  });

  it("gana el mismo proveedor Y especie sobre la especie sola", () => {
    const r = sugerirCostoPorM3(
      [
        ing({ speciesCommonName: "Tornillo", providerName: "Otro", costoTotal: 5000, volumeM3: 10 }),
        ing({ speciesCommonName: "Tornillo", providerName: "Maderera Blas", costoTotal: 2000, volumeM3: 10 }),
      ],
      { especie: "Tornillo", proveedor: "Maderera Blas" },
    );
    expect(r).toMatchObject({ porM3: 200, origen: "proveedor-especie", casos: 1 });
  });

  it("cae a la misma especie de otro proveedor, y lo dice", () => {
    const r = sugerirCostoPorM3(
      [ing({ speciesCommonName: "Tornillo", providerName: "Otro", costoTotal: 3000, volumeM3: 10 })],
      { especie: "Tornillo", proveedor: "Maderera Blas" },
    );
    expect(r).toMatchObject({ porM3: 300, origen: "especie" });
  });

  it("y al mismo proveedor de otra especie como último recurso", () => {
    const r = sugerirCostoPorM3(
      [ing({ speciesCommonName: "Capirona", providerName: "Maderera Blas", costoTotal: 4000, volumeM3: 10 })],
      { especie: "Tornillo", proveedor: "Maderera Blas" },
    );
    expect(r).toMatchObject({ porM3: 400, origen: "proveedor" });
  });

  it("toma el MÁS RECIENTE, no el promedio: el precio de la madera se mueve", () => {
    const r = sugerirCostoPorM3(
      [
        ing({ costoTotal: 1000, volumeM3: 10, entryDate: "2026-01-01T00:00:00.000Z" }),
        ing({ costoTotal: 3000, volumeM3: 10, entryDate: "2026-08-01T00:00:00.000Z" }),
      ],
      { especie: "Tornillo", proveedor: "Maderera Blas" },
    );
    expect(r?.porM3).toBe(300);
    expect(r?.casos).toBe(2);
  });

  it("compara sin tildes ni mayúsculas", () => {
    const r = sugerirCostoPorM3(
      [ing({ speciesCommonName: "TORNILLO", providerName: "maderera blas" })],
      { especie: "Tornillo", proveedor: "Maderera Blas" },
    );
    expect(r?.origen).toBe("proveedor-especie");
  });

  it("ignora los que no tienen costo aunque coincidan", () => {
    const r = sugerirCostoPorM3(
      [
        ing({ costoTotal: null, entryDate: "2026-09-01T00:00:00.000Z" }),
        ing({ costoTotal: 2000, volumeM3: 10, entryDate: "2026-01-01T00:00:00.000Z" }),
      ],
      { especie: "Tornillo", proveedor: "Maderera Blas" },
    );
    expect(r?.porM3).toBe(200);
  });

  it("dice de dónde salió", () => {
    const s = sugerirCostoPorM3([ing()], { especie: "Tornillo", proveedor: "Maderera Blas" })!;
    expect(textoDeOrigen(s, "Tornillo", "Maderera Blas")).toContain("lo último que pagaste por Tornillo");
  });
});
