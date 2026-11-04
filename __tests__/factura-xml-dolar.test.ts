import { describe, expect, it } from "vitest";
import {
  aCentimos,
  compraEnSoles,
  costoUnitarioDe,
  cuerpoDeLaCompra,
  diferenciaDeLaCompra,
  leerTipoCambio,
  lineasSinProducto,
  monto,
  tipoCambioTexto,
  totalDeLasLineas,
  type CambioUsado,
  type Elegidos,
} from "@/components/admin/compras/factura-xml/compra-desde-factura";
import type { FacturaXml, LineaFacturaXml } from "@/lib/compras/factura-xml";

function linea(numero: number, cantidad: number, total: number, extra: Partial<LineaFacturaXml> = {}): LineaFacturaXml {
  return {
    numero, descripcion: `Producto ${numero}`, cantidad, unidad: "NIU", total, gratuita: false,
    codigoVendedor: null, codigoBarras: null, ...extra,
  } as unknown as LineaFacturaXml;
}

function factura(moneda: string, lineas: LineaFacturaXml[]): FacturaXml {
  const total = Math.round(lineas.reduce((s, l) => s + l.total, 0) * 100) / 100;
  return {
    tipo: "factura", serieNumero: "F001-900", fecha: "2026-11-04", fechaVencimiento: null, moneda,
    emisor: { ruc: "20123456789", razonSocial: "Importadora SAC", nombreComercial: null },
    lineas, totales: { total, igv: 0, descuentos: 0 }, avisos: [],
  } as unknown as FacturaXml;
}

const prod = (id: number) => ({ id, nombre: `Mío ${id}`, unidad: "unidad", stock: null, costo: null, puntaje: 1 });
const SUNAT: CambioUsado = { venta: 3.752, fecha: "2026-11-04", fuente: "sunat", detalle: "SUNAT del 04-11" };
const base = { supplierId: "prov-1", supplierName: "Importadora SAC", formaDePago: "contado" as const };

/** Lo que hace el servidor (`POST /api/purchases`): Σ cantidad × costo por unidad. */
const sumaDelServidor = (items: Array<{ quantity: number; unitCost: number }>) => items.reduce((s, i) => s + i.quantity * i.unitCost, 0);

describe("factura en dólares → compra en soles", () => {
  const usd = [linea(1, 7, 123.45), linea(2, 3, 10.01), linea(3, 13, 999.99)];
  const elegidos: Elegidos = { 1: prod(1), 2: prod(2), 3: prod(3) };

  it("en soles no cambia nada: costo = el de la factura, sin nota de tipo de cambio", () => {
    const f = factura("PEN", [linea(1, 4, 47.2), linea(2, 2, 10)]);
    const c = cuerpoDeLaCompra({ ...base, factura: f, elegidos: { 1: prod(1), 2: prod(2) }, cambio: SUNAT });
    expect(c.items.map((i) => i.unitCost)).toEqual(f.lineas.map(costoUnitarioDe));
    expect(c.notes).toBe("Cargada desde la factura electrónica (XML) F001-900");
  });

  it("3 líneas en US$: cada una cierra con su total × tipo de cambio a ±0,01 y la compra con el total convertido", () => {
    const f = factura("USD", usd);
    const c = cuerpoDeLaCompra({ ...base, factura: f, elegidos, cambio: SUNAT });
    c.items.forEach((item, i) => {
      const l = usd[i]!;
      expect(Math.abs(item.quantity * item.unitCost - l.total * SUNAT.venta)).toBeLessThanOrEqual(0.01);
      expect(item.unitCost).toBeGreaterThan(costoUnitarioDe(l) * 3);
    });
    const totalSoles = aCentimos(f.totales.total * SUNAT.venta);
    expect(Math.abs(sumaDelServidor(c.items) - totalSoles)).toBeLessThanOrEqual(0.01 * usd.length);
    expect(c.notes).toContain(`tipo de cambio SUNAT venta ${tipoCambioTexto(3.752)} del 04/11/2026`);
    expect(c.notes).toContain("Factura en US$");
  });

  it("tipo de cambio escrito a mano: se lee con coma o punto y la nota lo dice", () => {
    expect(leerTipoCambio("3,752")).toBe(3.752);
    expect(leerTipoCambio(" S/ 3.75 ")).toBe(3.75);
    expect(leerTipoCambio("37.52")).toBeNull();
    expect(leerTipoCambio("tres")).toBeNull();
    const manual: CambioUsado = { venta: 3.8, fecha: "2026-11-04", fuente: "manual", detalle: null };
    const c = cuerpoDeLaCompra({ ...base, factura: factura("USD", usd), elegidos, cambio: manual });
    expect(c.items[0]!.quantity * c.items[0]!.unitCost).toBeCloseTo(aCentimos(123.45 * 3.8), 4);
    expect(c.notes).toContain("escrito a mano");
  });

  it("sin tipo de cambio (o uno increíble) no deja armar la compra", () => {
    const f = factura("USD", usd);
    expect(() => cuerpoDeLaCompra({ ...base, factura: f, elegidos })).toThrow(/tipo de cambio/);
    expect(() => cuerpoDeLaCompra({ ...base, factura: f, elegidos, cambio: { ...SUNAT, venta: 37.52 } })).toThrow(/tipo de cambio/);
  });

  it("una línea quitada no va a la compra, no pide producto y queda en la nota", () => {
    const f = factura("USD", usd);
    expect(lineasSinProducto(f.lineas, { ...elegidos, 2: null }, [2])).toEqual([]);
    const c = cuerpoDeLaCompra({ ...base, factura: f, elegidos, cambio: SUNAT, quitadas: [2] });
    expect(c.items.map((i) => i.productId)).toEqual([1, 3]);
    expect(c.notes).toContain("Sin la línea 2 de la factura");
  });

  it("si el dato es del cierre SBS (BCRP), la nota dice que NO es de SUNAT y de dónde salió", () => {
    const sbs: CambioUsado = { venta: 3.75, fecha: "2026-11-02", fuente: "bcrp-sbs", detalle: "SBS al cierre del 30-10 (BCRP)" };
    const c = cuerpoDeLaCompra({ ...base, factura: factura("USD", usd), elegidos, cambio: sbs });
    expect(c.notes).toContain("tipo de cambio venta 3.750 del 02/11/2026, tomado de la SBS al cierre del 30-10 (BCRP) y no de SUNAT");
    expect(c.notes).not.toContain("SUNAT venta");
    // sin detalle sigue diciendo que es de la SBS
    const sinDetalle = cuerpoDeLaCompra({ ...base, factura: factura("USD", usd), elegidos, cambio: { ...sbs, detalle: null } });
    expect(sinDetalle.notes).toContain("tomado de la SBS (BCRP) y no de SUNAT");
  });

  it("el formato visible es es-PE (miles con coma, punto decimal) igual en pantalla y en la nota guardada", () => {
    expect(monto(1234.5, "USD")).toBe("US$ 1,234.50");
    expect(monto(1234567.891, "PEN")).toBe("S/ 1,234,567.89");
    expect(monto(5, "EUR")).toBe("EUR 5.00");
    expect(tipoCambioTexto(3.752)).toBe("3.752");
    expect(tipoCambioTexto(3.75)).toBe("3.750");
    expect(tipoCambioTexto(3.7524)).toBe("3.7524");
    const f = factura("USD", [linea(1, 2, 1234.56)]);
    const c = cuerpoDeLaCompra({ ...base, factura: f, elegidos: { 1: prod(1) }, cambio: SUNAT });
    expect(c.notes).toContain("Factura en US$ 1,234.56, tipo de cambio SUNAT venta 3.752 del 04/11/2026");
  });
});

describe("lo que de verdad suma la compra en soles", () => {
  const tc = 3.752;
  const lineas = [linea(1, 7, 123.45), linea(2, 3, 10.01), linea(3, 13, 999.99)];
  const total = Math.round(lineas.reduce((s, l) => s + l.total, 0) * 100) / 100;
  const sin = (extra: Partial<Parameters<typeof diferenciaDeLaCompra>[0]> = {}) =>
    diferenciaDeLaCompra({ lineas, quitadas: [], totalPapel: total, descuentos: 0, tc, ...extra });

  it("Σ líneas en soles = lo que suma el servidor; si coincide con total × tipo de cambio no hay motivo", () => {
    const r = sin();
    const c = cuerpoDeLaCompra({ ...base, factura: factura("USD", lineas), elegidos: { 1: prod(1), 2: prod(2), 3: prod(3) }, cambio: SUNAT });
    expect(Math.abs(sumaDelServidor(c.items) - r.compra)).toBeLessThanOrEqual(0.005 * lineas.length);
    expect(r.compra).toBe(compraEnSoles(lineas, [], tc));
    expect(r.esperado).toBe(aCentimos(total * tc));
  });

  it("redondeo: unos céntimos de diferencia se explican por el redondeo de cada línea", () => {
    // 3 líneas de 0.13 US$ a 3.752: cada una 0.49 (0.4878) → 1.47 contra 0.39 × 3.752 = 1.46
    const chicas = [linea(1, 1, 0.13), linea(2, 1, 0.13), linea(3, 1, 0.13)];
    const r = diferenciaDeLaCompra({ lineas: chicas, quitadas: [], totalPapel: 0.39, descuentos: 0, tc });
    expect(r.compra).toBe(1.47);
    expect(r.esperado).toBe(1.46);
    expect(r.motivo).toBe("cada línea se redondea al céntimo");
  });

  it("líneas quitadas: lo dice y el total de las que quedan sale en dólares y en soles", () => {
    const r = sin({ quitadas: [2] });
    expect(r.motivo).toBe("quitaste una línea");
    expect(totalDeLasLineas(lineas, [2])).toBe(1123.44);
    expect(compraEnSoles(lineas, [2], tc)).toBe(r.compra);
    expect(sin({ quitadas: [1, 2] }).motivo).toBe("quitaste 2 líneas");
  });

  it("descuento global: la compra suma más que el papel y el motivo es el descuento, no el redondeo", () => {
    const r = sin({ totalPapel: total - 50, descuentos: 50 });
    expect(r.compra).toBeGreaterThan(r.esperado);
    expect(r.motivo).toBe("la factura trae un descuento que no se reparte en los productos");
  });

  it("descuadre sin descuento declarado: dice que las líneas no suman el total", () => {
    expect(sin({ totalPapel: total + 20 }).motivo).toBe("las líneas no suman el total de la factura");
  });

  it("quitadas + redondeo juntos se nombran los dos", () => {
    const chicas = [linea(1, 1, 0.13), linea(2, 1, 0.13), linea(3, 1, 0.13), linea(4, 1, 5)];
    const r = diferenciaDeLaCompra({ lineas: chicas, quitadas: [4], totalPapel: 5.39, descuentos: 0, tc });
    expect(r.motivo).toBe("quitaste una línea y cada línea se redondea al céntimo");
  });

  it("un regalo no suma en soles ni en dólares", () => {
    const con = [...lineas, linea(4, 1, 99, { gratuita: true })];
    expect(totalDeLasLineas(con)).toBe(total);
    expect(compraEnSoles(con, [], tc)).toBe(compraEnSoles(lineas, [], tc));
  });
});
