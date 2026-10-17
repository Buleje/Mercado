import { describe, expect, it } from "vitest";
import { esConsumoInterno, esDescarte, explicarMarcas, leerMarcas } from "@/lib/forestal/ctp-marcas-libro";

describe("leerMarcas · la leyenda del libro define qué es cada fila", () => {
  it("reconoce el consumo interno, que es la marca más frecuente", () => {
    // 516 de 771 salidas del libro real la llevan: 423 m³ que no son ventas.
    expect(leerMarcas("C/I").marcas).toEqual(["consumoInterno"]);
    expect(esConsumoInterno("C/I: Consumo Interno")).toBe(true);
  });

  it("saca el correlativo al que apunta DIV o P/A", () => {
    // Es una relación entre filas del mismo libro: el 44 salió de dividir el 12.
    expect(leerMarcas("DIV[12]")).toMatchObject({ marcas: ["dividido"], correlativo: 12 });
    expect(leerMarcas("P/A[44]")).toMatchObject({ marcas: ["agrupado"], correlativo: 44 });
  });

  it("una fila puede declarar dos cosas a la vez", () => {
    // «DIV[7] > C/I»: se dividió del 7 y además se usó adentro.
    const r = leerMarcas("DIV[7] > C/I");
    expect(r.marcas).toContain("dividido");
    expect(r.marcas).toContain("consumoInterno");
    expect(r.correlativo).toBe(7);
  });

  it("no confunde una letra suelta dentro de otra palabra", () => {
    // Sin el límite de palabra, cualquier observación con esas letras marcaba
    // la fila como consumo interno y le sacaba el volumen al despacho.
    expect(esConsumoInterno("Llegó con corte irregular")).toBe(false);
    expect(esConsumoInterno("cliente CIA maderera")).toBe(false);
  });

  it("una observación vacía o común no declara nada", () => {
    expect(leerMarcas("")).toEqual({ marcas: [], correlativo: null });
    expect(leerMarcas(null).marcas).toEqual([]);
    expect(explicarMarcas("Se entregó en planta")).toBeNull();
  });

  it("el descarte agrupa las dos marcas que significan lo mismo", () => {
    expect(esDescarte("T/D")).toBe(true);
    expect(esDescarte("S/D")).toBe(true);
    expect(esDescarte("C/I")).toBe(false);
  });

  it("lo explica en palabras, con el correlativo cuando aporta", () => {
    expect(explicarMarcas("DIV[12]")).toBe("Dividido de otro paquete (N° 12)");
    expect(explicarMarcas("C/I")).toBe("Consumo interno");
  });
});
