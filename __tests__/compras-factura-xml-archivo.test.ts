import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { codificacionDeclarada, leerArchivoXml } from "@/components/admin/compras/factura-xml/leer-archivo-xml";
import {
  costoUnitarioDe,
  cuerpoDeLaCompra,
  formaDePagoSugerida,
} from "@/components/admin/compras/factura-xml/compra-desde-factura";
import type { FacturaXml, LineaFacturaXml } from "@/lib/compras/factura-xml";

const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const FACTURA = `<?xml version="1.0" encoding="ISO-8859-1"?>\n<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><Note>CAÑA Ácida</Note></Invoice>`;
const CDR = `<?xml version="1.0" encoding="UTF-8"?><ar:ApplicationResponse xmlns:ar="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2"></ar:ApplicationResponse>`;

describe("leerArchivoXml", () => {
  it("del .zip de SUNAT toma la factura y salta el CDR (R-…) aunque venga primero", () => {
    const zip = zipSync({ "R-20123456789-01-F001-123.xml": strToU8(CDR), "20123456789-01-F001-123.xml": latin1(FACTURA) });
    const r = leerArchivoXml("F001-123.zip", zip);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nombre).toBe("20123456789-01-F001-123.xml");
    expect(r.codificacion).toBe("iso-8859-1");
    expect(r.xml).toContain("CAÑA Ácida");
  });

  it("un .zip con sólo el CDR o sin .xml no pasa, con mensajes distintos", () => {
    const soloCdr = leerArchivoXml("a.zip", zipSync({ "R-1.xml": strToU8(CDR) }));
    const sinXml = leerArchivoXml("b.zip", zipSync({ "leeme.txt": strToU8("hola") }));
    expect(soloCdr.ok).toBe(false);
    expect(sinXml.ok).toBe(false);
    if (soloCdr.ok || sinXml.ok) return;
    expect(soloCdr.error).not.toBe(sinXml.error);
  });

  it("lee la codificación declarada y cae a latin1 si el UTF-8 declarado no es tal", () => {
    expect(codificacionDeclarada(latin1(FACTURA))).toBe("iso-8859-1");
    const utf8 = leerArchivoXml("f.xml", new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?><Invoice>Ñandú</Invoice>'));
    expect(utf8.ok && utf8.codificacion === "utf-8" && utf8.xml.includes("Ñandú")).toBe(true);
    const mal = leerArchivoXml("g.xml", latin1('<?xml version="1.0" encoding="UTF-8"?><Invoice>CAÑA</Invoice>'));
    expect(mal.ok && mal.xml.includes("CAÑA")).toBe(true);
  });

  it("rechaza el CDR suelto, lo que no es XML y el archivo vacío", () => {
    expect(leerArchivoXml("R-1.xml", strToU8(CDR)).ok).toBe(false);
    expect(leerArchivoXml("x.xml", strToU8("hola")).ok).toBe(false);
    expect(leerArchivoXml("v.xml", new Uint8Array()).ok).toBe(false);
  });
});

const linea = (o: Partial<LineaFacturaXml>): LineaFacturaXml => ({
  numero: 1, descripcion: "Arroz", codigoVendedor: null, codigoBarras: null, cantidad: 4, unidadSunat: "NIU",
  unidad: "unidad", precioUnitario: 10, precioUnitarioConIgv: 11.8, valorVenta: 40, igv: 7.2, gratuita: false, total: 47.2,
  ...o,
});

describe("armar la compra", () => {
  it("costo c/u con impuestos; el regalo va a 0", () => {
    expect(costoUnitarioDe(linea({}))).toBe(11.8);
    expect(costoUnitarioDe(linea({ gratuita: true, total: 0 }))).toBe(0);
  });

  it("forma de pago por los días al vencimiento", () => {
    expect(formaDePagoSugerida("2026-11-04", null)).toBe("contado");
    expect(formaDePagoSugerida("2026-11-04", "2026-11-11")).toBe("credito_7");
    expect(formaDePagoSugerida("2026-11-04", "2026-11-19")).toBe("credito_15");
    expect(formaDePagoSugerida("2026-11-04", "2026-12-04")).toBe("credito_30");
  });

  it("manda sólo líneas con producto, con la llave de la factura y el IGV incluido", () => {
    const factura = {
      tipo: "factura", serieNumero: "F001-123", fecha: "2026-11-04", fechaVencimiento: null, moneda: "PEN",
      emisor: { ruc: "20123456789", razonSocial: "Distribuidora SAC", nombreComercial: null },
      lineas: [linea({ numero: 1 }), linea({ numero: 2, descripcion: "Azúcar" })],
      totales: { total: 94.4, igv: 14.4, descuentos: 0 },
    } as unknown as FacturaXml;
    const cuerpo = cuerpoDeLaCompra({
      factura, supplierId: "prov-1", supplierName: "Distribuidora SAC", formaDePago: "contado",
      elegidos: { 1: { id: 7, nombre: "Arroz 1 kg", stock: null, costo: null, unidad: "unidad", puntaje: 1 }, 2: null },
    });
    expect(cuerpo.idempotencyKey).toBe("factura-xml:20123456789:F001-123");
    expect(cuerpo.igvIncluded).toBe(true);
    expect(cuerpo.invoiceNumber).toBe("F001-123");
    expect(cuerpo.items).toHaveLength(1);
    expect(cuerpo.items[0]).toMatchObject({ productId: 7, quantity: 4, unitCost: 11.8 });
  });
});
