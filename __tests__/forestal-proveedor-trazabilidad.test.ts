import { describe, it, expect } from "vitest";
import {
  construirTrazabilidadProveedor,
  costoPorM3Proveedor,
  type FilaConsumoProveedor,
  type FilaCorridaProveedor,
  type FilaDespachoProveedor,
  type FilaIngresoProveedor,
} from "@/lib/forestal/proveedor-trazabilidad";

/**
 * Trazabilidad del proveedor (ADR-319).
 *
 * Las tres reglas que se prueban son las mismas que gobiernan el libro entero:
 * no prorratear lo compartido, no inventar ceros donde falta el dato, y no
 * dejar saldos negativos escondidos en un total.
 */

const ingreso = (o: Partial<FilaIngresoProveedor> = {}): FilaIngresoProveedor => ({
  woodEntryId: "w1",
  gtfNumber: "001-0000123",
  serforNumeroRegistro: null,
  entryDate: "2026-07-10T00:00:00.000Z",
  especie: "Tornillo",
  cites: false,
  originCode: "PMF-01",
  volumeM3: 10,
  status: "validado",
  costoTotal: null,
  ...o,
});

const corrida = (o: Partial<FilaCorridaProveedor> = {}): FilaCorridaProveedor => ({
  produccionEntryId: "c1",
  lineNo: 1,
  fecha: "2026-07-12T00:00:00.000Z",
  productType: "MADERA ASERRADA",
  especie: "Tornillo",
  lineaProduccion: "LP",
  quantity: 6,
  unit: "m3",
  ingresosDistintos: 1,
  ...o,
});

const consumo = (o: Partial<FilaConsumoProveedor> = {}): FilaConsumoProveedor => ({
  woodEntryId: "w1",
  produccionEntryId: "c1",
  volumeM3: 10,
  ...o,
});

const despacho = (o: Partial<FilaDespachoProveedor> = {}): FilaDespachoProveedor => ({
  despachoEntryId: "d1",
  produccionEntryId: "c1",
  lineNo: 5,
  fecha: "2026-07-20T00:00:00.000Z",
  gtfNumber: "GTF-001-000009",
  destino: "Lima",
  quantity: 4,
  ...o,
});

describe("balance de la cadena", () => {
  it("recorre ingreso → consumo → producción → despacho", () => {
    const t = construirTrazabilidadProveedor([ingreso()], [consumo()], [corrida()], [despacho()]);
    expect(t.balance).toMatchObject({
      guias: 1,
      ingresadoM3: 10,
      consumidoM3: 10,
      enPatioM3: 0,
      producido: 6,
      despachado: 4,
      rendimientoPct: 60,
    });
  });

  it("lo no consumido queda en patio", () => {
    const t = construirTrazabilidadProveedor([ingreso({ volumeM3: 10 })], [consumo({ volumeM3: 4 })], [corrida()], []);
    expect(t.balance.enPatioM3).toBe(6);
    expect(t.guias[0]!.saldoM3).toBe(6);
  });

  it("sin consumo el rendimiento es null, NO 0", () => {
    const t = construirTrazabilidadProveedor([ingreso()], [], [], []);
    expect(t.balance.rendimientoPct).toBeNull();
    expect(t.balance.consumidoM3).toBe(0);
  });

  it("el saldo de una guía nunca es negativo, pero el exceso se reporta", () => {
    const t = construirTrazabilidadProveedor(
      [ingreso({ volumeM3: 5 })],
      [consumo({ volumeM3: 8 })],
      [corrida()],
      [],
    );
    expect(t.guias[0]!.saldoM3).toBe(0);
    expect(t.huecos.some((h) => h.includes("más consumo que volumen"))).toBe(true);
  });
});

describe("corridas compartidas", () => {
  it("no prorratea: marca la corrida y avisa", () => {
    const t = construirTrazabilidadProveedor(
      [ingreso()],
      [consumo()],
      [corrida({ ingresosDistintos: 2, quantity: 6 })],
      [despacho()],
    );
    expect(t.corridas[0]!.compartida).toBe(true);
    // Lo producido se informa entero: repartirlo "a la mitad" sería inventar.
    expect(t.balance.producido).toBe(6);
    expect(t.salidas[0]!.compartida).toBe(true);
    expect(t.huecos.some((h) => h.includes("mezclan madera"))).toBe(true);
  });

  it("una corrida de un solo ingreso no se marca", () => {
    const t = construirTrazabilidadProveedor([ingreso()], [consumo()], [corrida()], []);
    expect(t.corridas[0]!.compartida).toBe(false);
    expect(t.huecos).toEqual([]);
  });
});

describe("costos", () => {
  it("sin ninguna factura el costo es null, nunca 0", () => {
    const t = construirTrazabilidadProveedor([ingreso({ costoTotal: null })], [], [], []);
    expect(t.balance.costoTotal).toBeNull();
    expect(costoPorM3Proveedor(t.balance)).toBeNull();
    expect(t.balance.guiasSinCosto).toBe(1);
  });

  it("el S//m³ divide por el volumen FACTURADO, no por todo lo ingresado", () => {
    const t = construirTrazabilidadProveedor(
      [
        ingreso({ woodEntryId: "w1", volumeM3: 30, costoTotal: 9000 }),
        ingreso({ woodEntryId: "w2", volumeM3: 70, costoTotal: null, entryDate: "2026-07-05T00:00:00.000Z" }),
      ],
      [],
      [],
      [],
    );
    expect(t.balance.costoTotal).toBe(9000);
    expect(t.balance.volumenConCostoM3).toBe(30);
    // 9000/30 = 300. Dividir por los 100 ingresados daría 90 — un precio que
    // nadie cobró y que se leería como "me vende barato".
    expect(costoPorM3Proveedor(t.balance)).toBe(300);
    expect(t.balance.guiasSinCosto).toBe(1);
  });
});

describe("agrupaciones", () => {
  it("suma por especie y arrastra el CITES de cualquier guía", () => {
    const t = construirTrazabilidadProveedor(
      [
        ingreso({ woodEntryId: "w1", especie: "Tornillo", volumeM3: 10 }),
        ingreso({ woodEntryId: "w2", especie: "Tornillo", volumeM3: 5, cites: true }),
        ingreso({ woodEntryId: "w3", especie: "Cumala", volumeM3: 20 }),
      ],
      [consumo({ woodEntryId: "w1", volumeM3: 3 })],
      [],
      [],
    );
    expect(t.porEspecie[0]).toMatchObject({ especie: "Cumala", ingresadoM3: 20, guias: 1 });
    const tornillo = t.porEspecie.find((e) => e.especie === "Tornillo");
    expect(tornillo).toMatchObject({ ingresadoM3: 15, consumidoM3: 3, guias: 2, cites: true });
  });

  it("las guías salen de la más reciente a la más vieja", () => {
    const t = construirTrazabilidadProveedor(
      [
        ingreso({ woodEntryId: "viejo", entryDate: "2026-06-01T00:00:00.000Z" }),
        ingreso({ woodEntryId: "nuevo", entryDate: "2026-07-25T00:00:00.000Z" }),
      ],
      [],
      [],
      [],
    );
    expect(t.guias.map((g) => g.woodEntryId)).toEqual(["nuevo", "viejo"]);
  });

  it("sin datos devuelve una cadena vacía sin huecos inventados", () => {
    const t = construirTrazabilidadProveedor([], [], [], []);
    expect(t.balance).toMatchObject({ guias: 0, ingresadoM3: 0, rendimientoPct: null, costoTotal: null });
    expect(t.huecos).toEqual([]);
  });
});
