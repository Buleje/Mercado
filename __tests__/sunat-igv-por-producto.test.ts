/**
 * __tests__/sunat-igv-por-producto.test.ts
 *
 * Boleta / factura / nota de crédito con el IGV de CADA producto
 * (Product.taxType): gravado 18 %, exonerado (Amazonía, Ley 27037) o inafecto.
 * Formato = ejemplos oficiales de Nubefact (BOLETA 2 EXONERADA, 3 INAFECTAS,
 * 8 DESCUENTO POR ITEM): tipo_de_igv 1 / 8 / 9 y descuento por línea sin IGV.
 */

import { describe, it, expect } from "vitest";
import {
  armarLineasComprobante,
  afectacionDe,
  montosParaRegistro,
  AFECTACION_IGV,
  type LineaDeVenta,
} from "@/lib/sunat/lineas-comprobante";
import {
  buildBoleta,
  buildFactura,
  buildNotaCredito,
  type BuilderOrder,
  type BuilderSettings,
  type BuilderTenant,
} from "@/lib/sunat/invoice-builder";
import { calculateIGV } from "@/lib/sunat";
import type { NubefactComprobantePayload } from "@/lib/sunat/nubefact-client";

const c = (soles: number) => Math.round(soles * 100);

const tenant: BuilderTenant = { ruc: "20601234567", razonSocial: "BODEGA SAN MARTIN SAC" };
const settings: BuilderSettings = {
  boletaSeries: "B001",
  facturaSeries: "F001",
  nextBoletaNum: 1,
  nextFacturaNum: 1,
};

/** Lo que SUNAT y Nubefact validan en cada comprobante, en céntimos. */
function esperarQueCuadre(p: NubefactComprobantePayload) {
  const sumaTotales =
    c(p.total_gravada) + c(p.total_exonerada) + c(p.total_inafecta) + c(p.total_igv) + c(p.total_otros_cargos);
  expect(sumaTotales).toBe(c(p.total));
  const porLineas = (campo: "total" | "igv" | "descuento") =>
    p.items.reduce((s, it) => s + c(it[campo]), 0);
  expect(porLineas("total") + c(p.total_otros_cargos)).toBe(c(p.total));
  expect(porLineas("igv")).toBe(c(p.total_igv));
  expect(porLineas("descuento")).toBe(c(p.total_descuento));
  for (const it of p.items) {
    expect(c(it.subtotal) + c(it.igv)).toBe(c(it.total));
    // valor_unitario × cantidad − descuento = subtotal (±1 céntimo)
    expect(Math.abs(it.valor_unitario * it.cantidad - it.descuento - it.subtotal)).toBeLessThanOrEqual(0.011);
    if (it.tipo_de_igv === 1) {
      expect(Math.abs(it.subtotal * 0.18 - it.igv)).toBeLessThanOrEqual(0.011);
    } else {
      expect(it.igv).toBe(0);
      expect(it.valor_unitario).toBe(it.precio_unitario);
    }
  }
}

const orden = (items: BuilderOrder["items"], total?: number): BuilderOrder => ({
  id: "ord-igv",
  customerName: "Juan Pérez",
  total: total ?? items.reduce((s, i) => s + i.price * i.quantity, 0),
  items,
});

describe("afectacionDe (Product.taxType)", () => {
  it("sin dato o desconocido = gravado (como siempre fue)", () => {
    expect(afectacionDe(null)).toBe("gravado");
    expect(afectacionDe(undefined)).toBe("gravado");
    expect(afectacionDe("")).toBe("gravado");
    expect(afectacionDe("cualquiera")).toBe("gravado");
    expect(afectacionDe("gravado")).toBe("gravado");
  });
  it("reconoce exonerado e inafecto sin importar mayúsculas", () => {
    expect(afectacionDe("exonerado")).toBe("exonerado");
    expect(afectacionDe(" EXONERADA ")).toBe("exonerado");
    expect(afectacionDe("inafecto")).toBe("inafecto");
    expect(afectacionDe("Inafecta")).toBe("inafecto");
  });
  it("catálogo 07 de SUNAT ↔ tipo_de_igv de Nubefact", () => {
    expect(AFECTACION_IGV.gravado).toMatchObject({ catalogoSunat: "10", tipoDeIgvNubefact: 1 });
    expect(AFECTACION_IGV.exonerado).toMatchObject({ catalogoSunat: "20", tipoDeIgvNubefact: 8 });
    expect(AFECTACION_IGV.inafecto).toMatchObject({ catalogoSunat: "30", tipoDeIgvNubefact: 9 });
  });
});

describe("boleta: todo gravado (igual que antes)", () => {
  it("2 × 59 = 100 de base + 18 de IGV", () => {
    const p = buildBoleta(orden([{ name: "Cerveza", quantity: 2, price: 59, unit: "NIU" }]), tenant, settings);
    expect(p.total_gravada).toBe(100);
    expect(p.total_igv).toBe(18);
    expect(p.total).toBe(118);
    expect(p.total_exonerada).toBe(0);
    expect(p.total_inafecta).toBe(0);
    expect(p.items[0].tipo_de_igv).toBe(1);
    esperarQueCuadre(p);
  });

  it("los totales gravados coinciden con el cálculo de siempre (calculateIGV)", () => {
    for (const total of [1, 3.5, 7.9, 12.34, 99.99, 1234.56]) {
      const p = buildBoleta(orden([{ name: "X", quantity: 1, price: total, unit: "NIU" }]), tenant, settings);
      const antes = calculateIGV(total);
      expect(p.total_gravada).toBe(antes.gravado);
      expect(p.total_igv).toBe(antes.igv);
      expect(p.total).toBe(antes.total);
    }
  });
});

describe("boleta: todo exonerado (Amazonía)", () => {
  it("sin IGV: total_exonerada = total y tipo_de_igv 8", () => {
    const p = buildBoleta(
      orden([
        { name: "Arroz Costeño 5kg", quantity: 2, price: 25, unit: "NIU", taxType: "exonerado" },
        { name: "Aceite Primor 1L", quantity: 3, price: 12, unit: "NIU", taxType: "exonerado" },
      ]),
      tenant,
      settings,
    );
    expect(p.total_exonerada).toBe(86);
    expect(p.total_gravada).toBe(0);
    expect(p.total_igv).toBe(0);
    expect(p.total).toBe(86);
    expect(p.items.map((i) => i.tipo_de_igv)).toEqual([8, 8]);
    expect(p.items[0]).toMatchObject({ valor_unitario: 25, precio_unitario: 25, subtotal: 50, igv: 0, total: 50 });
    esperarQueCuadre(p);
  });

  it("inafecto: total_inafecta y tipo_de_igv 9", () => {
    const p = buildBoleta(
      orden([{ name: "Libro escolar", quantity: 1, price: 35.5, unit: "NIU", taxType: "inafecto" }]),
      tenant,
      settings,
    );
    expect(p.total_inafecta).toBe(35.5);
    expect(p.total_igv).toBe(0);
    expect(p.items[0].tipo_de_igv).toBe(9);
    esperarQueCuadre(p);
  });
});

describe("mezcla gravado + exonerado + inafecto", () => {
  it("cada línea con su afectación y los totales cuadran", () => {
    const p = buildFactura(
      orden([
        { name: "Cerveza Cristal", quantity: 2, price: 5.9, unit: "NIU", taxType: "gravado" },
        { name: "Arroz 5kg", quantity: 2, price: 25, unit: "NIU", taxType: "exonerado" },
        { name: "Agua de pozo", quantity: 1, price: 1.5, unit: "NIU", taxType: "inafecto" },
        { name: "Galleta (sin taxType)", quantity: 3, price: 0.7, unit: "NIU" },
      ]),
      tenant,
      settings,
      { ruc: "20123456789", razonSocial: "CLIENTE SAC" },
    );
    expect(p.items.map((i) => i.tipo_de_igv)).toEqual([1, 8, 9, 1]);
    // gravado: 11.80 → 10.00 + 1.80 ; galleta 2.10 → 1.78 + 0.32
    expect(p.total_gravada).toBe(11.78);
    expect(p.total_igv).toBe(2.12);
    expect(p.total_exonerada).toBe(50);
    expect(p.total_inafecta).toBe(1.5);
    expect(p.total).toBe(65.4);
    esperarQueCuadre(p);
  });
});

describe("descuento de la venta prorrateado en las líneas", () => {
  it("cobrado 90 sobre 100: el descuento se reparte y el total = lo cobrado", () => {
    const p = buildBoleta(
      orden(
        [
          { name: "Gaseosa", quantity: 1, price: 59, unit: "NIU" },
          { name: "Arroz", quantity: 1, price: 41, unit: "NIU", taxType: "exonerado" },
        ],
        90,
      ),
      tenant,
      settings,
    );
    expect(p.total).toBe(90);
    expect(p.descuento_global).toBe(0);
    // 10 de descuento: 5.90 a la gaseosa (59 %) y 4.10 al arroz (41 %)
    expect(p.items[0]).toMatchObject({ total: 53.1, subtotal: 45, igv: 8.1, descuento: 5 });
    expect(p.items[1]).toMatchObject({ total: 36.9, subtotal: 36.9, igv: 0, descuento: 4.1 });
    expect(p.total_gravada).toBe(45);
    expect(p.total_exonerada).toBe(36.9);
    expect(p.total_igv).toBe(8.1);
    expect(p.total_descuento).toBe(9.1);
    esperarQueCuadre(p);
  });

  it("céntimos que no se dividen exacto: ni uno de más ni de menos", () => {
    const { items, totales } = armarLineasComprobante(
      [
        { name: "A", quantity: 1, price: 3.33 },
        { name: "B", quantity: 1, price: 3.33, taxType: "exonerado" },
        { name: "C", quantity: 1, price: 3.34 },
      ],
      { totalCobrado: 9.9 },
    );
    expect(items.reduce((s, i) => s + c(i.total), 0)).toBe(990);
    expect(totales.total).toBe(9.9);
  });

  it("cobrado por encima de los productos = otros cargos, sin inventar líneas", () => {
    const p = buildBoleta(orden([{ name: "Pan", quantity: 10, price: 0.3, unit: "NIU" }], 5), tenant, settings);
    expect(p.items).toHaveLength(1);
    expect(p.total_otros_cargos).toBe(2);
    expect(p.total).toBe(5);
    esperarQueCuadre(p);
  });

  it("nunca deja líneas negativas aunque el cobrado sea 0", () => {
    const { items, totales } = armarLineasComprobante([{ name: "A", quantity: 2, price: 4 }], { totalCobrado: 0 });
    expect(items[0].total).toBe(0);
    expect(totales.total).toBe(0);
  });
});

describe("nota de crédito con la afectación de cada producto", () => {
  it("devolución de un exonerado no lleva IGV aunque el llamador mande igv", () => {
    const p = buildNotaCredito({
      originalSeries: "B001",
      originalNumber: 7,
      originalTipoComprobante: 2,
      customerName: "Juan Pérez",
      customerDocTipo: 1,
      customerDoc: "12345678",
      total: 50,
      igv: 7.63,
      gravado: 42.37,
      items: [{ name: "Arroz 5kg", quantity: 2, price: 25, unit: "NIU", taxType: "exonerado" }],
      series: "BC01",
      nextNumber: 1,
      motivo: "Devolución",
    });
    expect(p.total_exonerada).toBe(50);
    expect(p.total_igv).toBe(0);
    expect(p.total).toBe(50);
    esperarQueCuadre(p);
  });
});

describe("cestas al azar (semilla fija): siempre cuadra", () => {
  it("500 comprobantes mezclados con y sin descuento", () => {
    let semilla = 42;
    const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const tipos = ["gravado", "exonerado", "inafecto", null];
    for (let n = 0; n < 500; n++) {
      const lineas: LineaDeVenta[] = Array.from({ length: 1 + Math.floor(azar() * 6) }, (_, i) => ({
        name: `P${i}`,
        quantity: 1 + Math.floor(azar() * 5),
        price: Math.round(azar() * 5000) / 100 + 0.1,
        taxType: tipos[Math.floor(azar() * 4)],
      }));
      const bruto = lineas.reduce((s, l) => s + c(l.price * l.quantity), 0);
      const cobrado = azar() < 0.5 ? bruto / 100 : Math.round(bruto * (0.7 + azar() * 0.3)) / 100;
      const p = buildBoleta(
        orden(lineas.map((l) => ({ ...l, unit: "NIU" })), cobrado),
        tenant,
        settings,
      );
      expect(c(p.total)).toBe(c(cobrado));
      esperarQueCuadre(p);
      const m = montosParaRegistro({
        gravada: p.total_gravada,
        exonerada: p.total_exonerada,
        inafecta: p.total_inafecta,
        igv: p.total_igv,
        descuento: p.total_descuento,
        otrosCargos: p.total_otros_cargos,
        total: p.total,
      });
      expect(c(m.subtotal) + c(m.igv)).toBe(c(m.total));
    }
  });
});
