/**
 * __tests__/declarar-produccion-falta-tarifa.test.ts
 *
 * Revisor 22-09 (ADR-429): con servicio a tercero y alguna especie SIN precio
 * a mano, el servidor cobra la tarifa. Si la tarifa todavía carga (o falló),
 * la vista previa decía «no se carga nada» mientras el servidor cargaba
 * S/ 9 272,68. Mientras no se sepa, no se registra.
 */
import { describe, expect, it } from "vitest";
import { faltaParaRegistrar, type PrecioDeEspecie } from "@/components/admin/forestal/hooks/declarar-produccion-pantalla";
import { corridasPorEspecie, type PaqueteDeclarable } from "@/lib/forestal/declarar-produccion";

const paq: PaqueteDeclarable = {
  codigo: "PQ-1", productType: "MADERA ASERRADA", tipo: "Tabla", presentacion: "PIEZAS", cantidad: 10,
  volumenM3: 0.0944, espesorCm: 2.54, anchoCm: 20.32, largoM: 2.44, medida: "1×8×8", especie: "Tornillo", pieTablar: 53.33,
};
const linea = (precio: number | null): PrecioDeEspecie => ({
  clave: "tornillo", especie: "Tornillo", texto: precio == null ? "" : String(precio), invalido: false, precio,
  sugerido: null, importe: null, desde: precio == null ? null : "precio",
});
const base = { corridas: corridasPorEspecie([paq]), servicio: "tercero" as const, parteId: "p1", fechaValida: true };

describe("tercero sin precio a mano y la tarifa sin leer", () => {
  it("mientras la tarifa carga, no se registra", () => {
    expect(faltaParaRegistrar({ ...base, lineas: [linea(null)], tarifa: { cargando: true, error: null } })).toMatch(/Leyendo la tarifa/);
  });
  it("si la tarifa falló, pide el precio a mano", () => {
    expect(faltaParaRegistrar({ ...base, lineas: [linea(null)], tarifa: { cargando: false, error: "500" } })).toMatch(/precio a mano/);
  });
  it("con precio a mano en todas, la tarifa no importa", () => {
    expect(faltaParaRegistrar({ ...base, lineas: [linea(0.35)], tarifa: { cargando: true, error: null } })).toBeNull();
  });
  it("madera propia no depende de la tarifa", () => {
    expect(faltaParaRegistrar({ ...base, servicio: "propia", lineas: [linea(null)], tarifa: { cargando: true, error: null } })).toBeNull();
  });
});
