import { describe, expect, it } from "vitest";
import {
  disponiblePorEspecie,
  labelProductoConsumible,
  trozasDelLote,
} from "@/lib/forestal/lote-programacion";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";

/**
 * El lote programado y la madera que le corresponde (ADR-342).
 *
 * El lote se declara antes de cargarlo, así que lo que importa probar es el
 * filtro: qué piezas del patio puede tomar. Si sobra una, el operador la tilda
 * y el servidor la rechaza; si falta una, cree que no tiene madera.
 */

function troza(id: string, extra: Partial<TrozaConsumible> = {}): TrozaConsumible {
  return {
    id,
    woodEntryId: `w-${id}`,
    codificacion: id,
    especieComun: "Capirona",
    volumenM3: 1,
    consumidaEnId: null,
    noRecepcionada: false,
    descarte: false,
    retrozos: 0,
    ...extra,
  };
}

const LOTE = { id: "lote-1", speciesCommon: "Capirona" };

describe("qué piezas puede tomar el lote", () => {
  it("sólo las de su especie", () => {
    const patio = [troza("a"), troza("b", { especieComun: "Tornillo" })];
    expect(trozasDelLote(patio, LOTE).map((t) => t.id)).toEqual(["a"]);
  });

  it("compara sin tildes ni mayúsculas", () => {
    const patio = [troza("a", { especieComun: "CAPIRONA " }), troza("b", { especieComun: "capiróna" })];
    expect(trozasDelLote(patio, LOTE)).toHaveLength(2);
  });

  it("incluye las que YA están en este lote", () => {
    const patio = [troza("a", { loteAserrioId: "lote-1" })];
    expect(trozasDelLote(patio, LOTE).map((t) => t.id)).toEqual(["a"]);
  });

  it("excluye las apartadas en OTRO lote", () => {
    const patio = [troza("a", { loteAserrioId: "lote-9" })];
    expect(trozasDelLote(patio, LOTE)).toHaveLength(0);
  });

  it("excluye la madera de guías que todavía no se recibieron", () => {
    const patio = [troza("recibida", { guiaRecepcionada: true }), troza("enCamino", { guiaRecepcionada: false })];
    expect(trozasDelLote(patio, LOTE).map((t) => t.id)).toEqual(["recibida"]);
    // Sin el dato (otros consumidores del tipo) no se excluye a ciegas.
    expect(trozasDelLote([troza("sinDato")], LOTE)).toHaveLength(1);
  });

  it("excluye las ya consumidas y las bloqueadas", () => {
    const patio = [
      troza("consumida", { consumidaEnId: "corrida-1" }),
      troza("noLlego", { noRecepcionada: true }),
      troza("descarte", { descarte: true }),
      troza("madre", { retrozos: 2 }),
      troza("sinVolumen", { volumenM3: null }),
      troza("buena"),
    ];
    expect(trozasDelLote(patio, LOTE).map((t) => t.id)).toEqual(["buena"]);
  });
});

describe("lo disponible por especie", () => {
  it("agrupa, suma y ordena por volumen", () => {
    const patio = [
      troza("a", { volumenM3: 2 }),
      troza("b", { volumenM3: 1.5 }),
      troza("c", { especieComun: "Tornillo", volumenM3: 9, especieCientifica: "Cedrelinga" }),
    ];
    expect(disponiblePorEspecie(patio)).toEqual([
      { nombre: "Tornillo", cientifico: "Cedrelinga", piezas: 1, volumen: 9 },
      { nombre: "Capirona", cientifico: null, piezas: 2, volumen: 3.5 },
    ]);
  });

  it("no cuenta la madera apartada, la bloqueada ni la que no llegó al patio", () => {
    const patio = [
      troza("a", { loteAserrioId: "lote-1" }),
      troza("b", { descarte: true }),
      troza("c", { consumidaEnId: "x" }),
      troza("d", { guiaRecepcionada: false }),
    ];
    expect(disponiblePorEspecie(patio)).toEqual([]);
  });

  it("cuenta lo MISMO que `trozasDelLote` para esa especie", () => {
    const patio = [
      troza("a", { guiaRecepcionada: true }),
      troza("b", { guiaRecepcionada: false }),
      troza("c", { guiaRecepcionada: true }),
    ];
    const porEspecie = disponiblePorEspecie(patio).find((e) => e.nombre === "Capirona");
    // El selector del modal y la tabla del patio no pueden prometer distinto.
    expect(porEspecie?.piezas).toBe(trozasDelLote(patio, LOTE).length);
  });

  it("ignora las piezas sin especie en vez de inventar un grupo vacío", () => {
    expect(disponiblePorEspecie([troza("a", { especieComun: null })])).toEqual([]);
  });
});

describe("catálogo de producto a consumir", () => {
  it("traduce el valor guardado", () => {
    expect(labelProductoConsumible("rolliza")).toBe("Madera rolliza (troncos)");
  });

  it("un valor desconocido no rompe la tarjeta", () => {
    expect(labelProductoConsumible(null)).toBe("—");
    expect(labelProductoConsumible("inventado")).toBe("—");
  });
});
