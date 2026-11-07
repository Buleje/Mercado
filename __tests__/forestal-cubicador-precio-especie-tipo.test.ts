/**
 * La tabla «A mano» por especie × tipo del modal «Guardar cubicación» y lo que
 * el papel CUB imprime de «Pago y entrega» (Brandon 28-10).
 */
import { describe, expect, it } from "vitest";
import { lineasDeFichaParaPapel } from "@/components/admin/forestal/cubicador-papel/papel-cubicador";
import { limpiarSoles, porCobrar, solesConDosDecimales } from "@/lib/forestal/cubicacion-pago";
import { cubicarPieza } from "@/lib/forestal/cubicacion";
import type { TipoComercial } from "@/lib/forestal/cubicacion-tipo";
import type { ContextoPrecio } from "@/lib/forestal/precio-de-pieza";
import { hayPrecioPorEspecie, tablaEspecieTipo } from "@/lib/forestal/tabla-precio-especie-tipo";

const pieza = (especie: string, tipo: TipoComercial, cantidad = 10) => {
  const base = { id: `${especie}-${tipo}`, cantidad, espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { ...base, especie, tipo, ...cubicarPieza(base) };
};
const ctx = (aMano: ContextoPrecio["aMano"]): ContextoPrecio => ({ modo: "manual", aMano, fecha: "2026-10-28" });

describe("tablaEspecieTipo", () => {
  it("una fila por especie, sólo los tipos que hay y en el orden de siempre, con el importe del mismo resolver", () => {
    const rows = [pieza("Tornillo", "Corta"), pieza("tornillo", "Comercial"), pieza("Cumala", "Tabla")];
    const t = tablaEspecieTipo(rows, ctx({ general: 2, porEspecie: { tornillo: "2.5" }, porEspecieTipo: { "tornillo|Corta": "1.5" } }));
    expect(t.tipos).toEqual(["Comercial", "Tabla", "Corta"]);
    expect(t.filas.map((f) => f.especie)).toEqual(["Tornillo", "Cumala"]);
    const tornillo = t.filas[0];
    const pt = rows[0].pieTablar;
    expect(tornillo.celdas.Corta?.importe).toBeCloseTo(pt * 1.5, 2);
    expect(tornillo.celdas.Comercial?.importe).toBeCloseTo(pt * 2.5, 2);
    expect(tornillo.celdas.Tabla).toBeUndefined();
    expect(tornillo.importe).toBeCloseTo(pt * 4, 2);
  });

  it("sin precio → importe null (no S/ 0)", () => {
    const t = tablaEspecieTipo([pieza("Cedro", "Tabla")], ctx({ general: 0, porEspecie: {} }));
    expect(t.filas[0].importe).toBeNull();
  });

  it("hayPrecioPorEspecie mira las dos listas y no cuenta los 0", () => {
    expect(hayPrecioPorEspecie({ general: 2, porEspecie: { a: "0" }, porEspecieTipo: { "a|Corta": "" } })).toBe(false);
    expect(hayPrecioPorEspecie({ general: 2, porEspecie: {}, porEspecieTipo: { "a|Corta": "1.2" } })).toBe(true);
  });
});

describe("Pago y entrega", () => {
  it("el adelanto se escribe como soles", () => {
    expect(limpiarSoles("S/ 1,500.505")).toBe("1500.50");
    expect(limpiarSoles("12,5")).toBe("12.5");
    expect(solesConDosDecimales("1500")).toBe("1500.00");
    expect(solesConDosDecimales("0")).toBe("");
  });

  it("por cobrar = importe − adelanto, en céntimos; sin alguno de los dos, nada", () => {
    expect(porCobrar(5000.1, "1500.05")).toBe(3500.05);
    expect(porCobrar(1000, "1200.00")).toBe(-200);
    expect(porCobrar(null, "100")).toBeNull();
    expect(porCobrar(1000, "")).toBeNull();
  });

  it("la hoja imprime quién cubicó, el pago y las fechas después de lo de siempre", () => {
    const lineas = lineasDeFichaParaPapel({
      cliente: "Maderera",
      ficha: { placa: "ABC-123", cubicadoPor: "Juan", condicionPago: "Con adelanto", adelanto: "1500.00", fechaPago: "2026-09-10", fechaEntrega: "fin de mes" },
    });
    expect(lineas.map((l) => l.etiqueta)).toEqual(["Comprador", "Placa", "Cubicado por", "Pago", "Adelanto", "Paga hasta", "Entrega"]);
    expect(lineas.find((l) => l.etiqueta === "Adelanto")?.valor).toBe("S/ 1,500.00");
    expect(lineas.find((l) => l.etiqueta === "Paga hasta")?.valor).toBe("jueves 10/09/2026");
    expect(lineas.find((l) => l.etiqueta === "Entrega")?.valor).toBe("fin de mes");
  });
});
