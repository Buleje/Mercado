import { describe, it, expect } from "vitest";
import {
  construirCadenaLote,
  type FilaConsumo,
  type FilaCorrida,
  type FilaDespacho,
} from "@/lib/forestal/ctp-cadena-lote";

/**
 * ADR-315 — la cadena de custodia de un lote, de punta a punta.
 *
 * Escenario base: un lote con dos corridas. Una salió de la guía 019-0000003
 * (Copaiba) y la otra de la 001-0000120 (Tornillo).
 */

const consumo = (over: Partial<FilaConsumo>): FilaConsumo => ({
  produccionEntryId: "c1",
  woodEntryId: "w1",
  volumeM3: 3,
  gtfNumber: "019-0000003",
  serforNumeroRegistro: "1-19-0313629",
  especie: "Copaiba",
  proveedor: "CC.NN. SAN LUIS",
  originCode: "19-SEC/PER-FMC-2024-008",
  entryDate: "2026-07-30",
  ...over,
});

const corrida = (over: Partial<FilaCorrida>): FilaCorrida => ({
  produccionEntryId: "c1",
  lineNo: 1,
  fecha: "2026-07-30",
  productType: "MADERA ASERRADA",
  especie: "Copaiba",
  lineaProduccion: "LP",
  quantity: 2,
  enElLote: 2,
  unit: "m3",
  ...over,
});

const despacho = (over: Partial<FilaDespacho>): FilaDespacho => ({
  despachoEntryId: "d1",
  produccionEntryId: "c1",
  lineNo: 10,
  fecha: "2026-07-31",
  gtfNumber: "001-0000200",
  destino: "INVERSIONES BLAS SAC",
  quantity: 1.5,
  ...over,
});

describe("La cadena completa", () => {
  const cadena = construirCadenaLote(
    [consumo({}), consumo({ produccionEntryId: "c2", woodEntryId: "w2", gtfNumber: "001-0000120", especie: "Tornillo", volumeM3: 2 })],
    [corrida({}), corrida({ produccionEntryId: "c2", lineNo: 2, especie: "Tornillo", quantity: 1, enElLote: 1 })],
    [despacho({})],
  );

  it("recorre de la guía al despacho", () => {
    expect(cadena.origen.map((o) => o.gtfNumber)).toEqual(["019-0000003", "001-0000120"]);
    expect(cadena.corridas).toHaveLength(2);
    expect(cadena.salidas.map((s) => s.gtfNumber)).toEqual(["001-0000200"]);
  });

  it("ordena el origen por lo que más aportó", () => {
    expect(cadena.origen[0]!.consumidoM3).toBe(3);
    expect(cadena.origen[1]!.consumidoM3).toBe(2);
  });

  it("cierra el balance: consumido → producido → despachado → stock", () => {
    expect(cadena.balance.consumidoM3).toBe(5);
    expect(cadena.balance.producido).toBe(3);
    expect(cadena.balance.despachado).toBe(1.5);
    expect(cadena.balance.enStock).toBe(1.5);
    expect(cadena.balance.rendimientoPct).toBe(60);
  });

  it("sin huecos cuando todo está atribuido", () => {
    expect(cadena.huecos).toEqual([]);
  });
});

describe("Cuando una guía alimenta varias corridas", () => {
  it("suma su consumo y dice en cuántas entró", () => {
    const c = construirCadenaLote(
      [consumo({ volumeM3: 3 }), consumo({ produccionEntryId: "c2", volumeM3: 2 })],
      [corrida({}), corrida({ produccionEntryId: "c2", lineNo: 2 })],
      [],
    );
    expect(c.origen).toHaveLength(1);
    expect(c.origen[0]!.consumidoM3).toBe(5);
    expect(c.origen[0]!.corridas).toBe(2);
  });
});

describe("Los huecos de la cadena", () => {
  it("una corrida sin ingreso declarado se nombra", () => {
    const c = construirCadenaLote([], [corrida({ lineNo: 7 })], []);
    expect(c.huecos.join(" ")).toMatch(/no declaran de qué ingreso salieron: #7/i);
  });

  it("un lote vacío lo dice", () => {
    expect(construirCadenaLote([], [], []).huecos.join(" ")).toMatch(/no tiene ninguna corrida/i);
  });

  it("marca la corrida REPARTIDA entre lotes y no reparte a prorrata", () => {
    // La corrida produjo 5 y el lote se lleva 2: lo despachado de esa corrida
    // puede ser del otro lote y NO hay dato que lo separe. Se informa.
    const c = construirCadenaLote(
      [consumo({})],
      [corrida({ quantity: 5, enElLote: 2 })],
      [despacho({ quantity: 4 })],
    );
    expect(c.corridas[0]!.compartida).toBe(true);
    expect(c.salidas[0]!.compartida).toBe(true);
    expect(c.huecos.join(" ")).toMatch(/repartidas entre este lote y otros/i);
    // La salida se reporta ENTERA, sin inventar qué parte era del lote.
    expect(c.balance.despachado).toBe(4);
  });

  it("el stock nunca queda negativo aunque la corrida sea compartida", () => {
    const c = construirCadenaLote([consumo({})], [corrida({ quantity: 5, enElLote: 2 })], [despacho({ quantity: 4 })]);
    expect(c.balance.enStock).toBe(0);
  });
});

describe("Ruido que no pertenece al lote", () => {
  it("ignora consumos y despachos de corridas ajenas", () => {
    const c = construirCadenaLote(
      [consumo({}), consumo({ produccionEntryId: "AJENA", woodEntryId: "wX", gtfNumber: "999" })],
      [corrida({})],
      [despacho({}), despacho({ despachoEntryId: "dX", produccionEntryId: "AJENA", quantity: 99 })],
    );
    expect(c.origen.map((o) => o.gtfNumber)).toEqual(["019-0000003"]);
    expect(c.balance.despachado).toBe(1.5);
  });
});

describe("Sin consumo no se inventa rendimiento", () => {
  it("devuelve null en vez de 0 o infinito", () => {
    const c = construirCadenaLote([], [corrida({})], []);
    expect(c.balance.rendimientoPct).toBeNull();
  });
});

/**
 * La meta de rendimiento por especie: la cuenta que el jefe de planta hacía a
 * mano ("metí 3 m³ de copaiba, al 56% tendrían que salir 1.68"). Viene del ERP
 * forestal de referencia, donde el saldo contra la meta se lee además en pie
 * tablar porque así se vende la madera aserrada acá.
 */
describe("Meta de rendimiento por especie", () => {
  const cadena = construirCadenaLote(
    [consumo({}), consumo({ produccionEntryId: "c2", woodEntryId: "w2", especie: "Tornillo", volumeM3: 2 })],
    [corrida({}), corrida({ produccionEntryId: "c2", lineNo: 2, especie: "Tornillo", quantity: 1, enElLote: 1 })],
    [],
  );

  it("aplica el 56% de referencia sobre las trozas consumidas", () => {
    const copaiba = cadena.meta.find((m) => m.especie === "Copaiba")!;
    expect(copaiba.trozasM3).toBe(3);
    expect(copaiba.metaM3).toBeCloseTo(1.68, 4);
    expect(copaiba.producidoM3).toBe(2);
    // Produjo MÁS que la meta: el saldo queda negativo y eso es buena noticia.
    expect(copaiba.saldoM3).toBeCloseTo(-0.32, 4);
    expect(copaiba.rendimientoPct).toBeCloseTo(66.67, 2);
  });

  it("traduce meta y saldo a pie tablar con el factor del cubicador", () => {
    const tornillo = cadena.meta.find((m) => m.especie === "Tornillo")!;
    expect(tornillo.metaM3).toBeCloseTo(1.12, 4);
    expect(tornillo.metaPt).toBeCloseTo(1.12 * 423.78, 0);
    expect(tornillo.saldoM3).toBeCloseTo(0.12, 4);
    expect(tornillo.saldoPt).toBeGreaterThan(0);
  });

  it("ordena por volumen de trozas: la especie que más entró va primero", () => {
    expect(cadena.meta.map((m) => m.especie)).toEqual(["Copaiba", "Tornillo"]);
  });

  it("avisa cuando una corrida está en una unidad que no convierte a m³", () => {
    const conUnidades = construirCadenaLote(
      [consumo({})],
      [corrida({ unit: "unidad", quantity: 40 })],
      [],
    );
    const fila = conUnidades.meta[0]!;
    expect(fila.unidadesMezcladas).toBe(true);
    // No se inventa un factor: lo producido queda en 0 y el saldo lo dice.
    expect(fila.producidoM3).toBe(0);
  });

  it("convierte el pie tablar de una corrida a m³ para poder compararlo", () => {
    const enPt = construirCadenaLote(
      [consumo({})],
      [corrida({ unit: "pt", quantity: 423.78 })],
      [],
    );
    expect(enPt.meta[0]!.producidoM3).toBeCloseTo(1, 4);
    expect(enPt.meta[0]!.unidadesMezcladas).toBe(false);
  });
});
