/**
 * Recibo de la venta del POS: un modelo (lib/recibo/modelo-recibo.ts) y sus
 * hojas (lib/recibo/recibo-html.ts). Lo que se prueba es lo que la SUNAT y el
 * negocio miran: el nombre de cada tipo, los datos obligatorios de la factura,
 * el desglose del IGV con la regla de la emisión, que una boleta o factura NO
 * emitida jamás muestre hash ni QR, y que los montos sean los guardados.
 */
import { describe, expect, it } from "vitest";
import { armarRecibo, datosTermicos, DIAS_DE_VALIDEZ, type EntradaRecibo } from "@/lib/recibo/modelo-recibo";
import { reciboHtml } from "@/lib/recibo/recibo-html";
import { entradaDesdeVenta } from "@/components/admin/pos/recibo/entrada-recibo";
import { formatDateNumeric } from "@/lib/format";

const NEGOCIO = {
  nombre: "Bodega San Martín",
  razonSocial: "Inversiones San Martín S.A.C.",
  ruc: "20601234567",
  direccion: "Jr. Tacna 123, Pucallpa",
  telefono: "961 222 333",
  correo: "ventas@sanmartin.pe",
  logoUrl: null,
  pie: "¡Gracias por tu compra!",
};

const base = (o: Partial<EntradaRecibo> = {}): EntradaRecibo => ({
  ventaId: "cmabcdefghijklmnop",
  tipo: "ticket",
  fecha: "2026-10-15T15:30:00.000Z",
  negocio: NEGOCIO,
  lineas: [
    { nombre: "Arroz Costeño 5 kg", cantidad: 2, precio: 29.5 },
    { nombre: "Aceite Primor 1 L", cantidad: 1, precio: 20 },
  ],
  total: 79,
  pago: { metodo: "plin" },
  ...o,
});

describe("nombre de cada tipo", () => {
  it.each([
    ["ticket", "TICKET DE VENTA", "Ticket"],
    ["boleta", "BOLETA DE VENTA ELECTRÓNICA", "Boleta"],
    ["factura", "FACTURA ELECTRÓNICA", "Factura"],
    ["cotizacion", "COTIZACIÓN", "Cotización"],
    ["proforma", "PROFORMA", "Proforma"],
  ])("%s → %s", (tipo, titulo, corto) => {
    const m = armarRecibo(base({ tipo, numero: tipo === "ticket" ? null : "X001-00000001" }));
    expect(m.titulo).toBe(titulo);
    expect(m.nombreCorto).toBe(corto);
    expect(reciboHtml(m, "ticket80")).toContain(titulo);
  });

  it("un tipo desconocido cae en ticket y el ticket dice que no es comprobante de pago", () => {
    const m = armarRecibo(base({ tipo: "nota" }));
    expect(m.tipo).toBe("ticket");
    expect(m.esComprobanteDePago).toBe(false);
    expect(m.leyendas.join(" ")).toMatch(/no es un comprobante de pago/i);
    expect(m.numero).toBe("IJKLMNOP"); // el final del id: el principio del cuid se repite
  });
});

describe("factura: RUC y razón social del cliente obligatorios", () => {
  it("sin cliente pide los dos", () => {
    const m = armarRecibo(base({ tipo: "factura", numero: "F001-00000007" }));
    expect(m.faltantes).toEqual(expect.arrayContaining(["el RUC del cliente", "la razón social del cliente"]));
  });

  it("un DNI no sirve como RUC", () => {
    const m = armarRecibo(base({ tipo: "factura", numero: "F001-00000007", cliente: { nombre: "Ferretería Lucho E.I.R.L.", documento: "45678912" } }));
    expect(m.faltantes).toContain("el RUC del cliente");
    expect(m.faltantes).not.toContain("la razón social del cliente");
  });

  it("completa: nada falta y la hoja trae valor de venta, IGV y el RUC del cliente", () => {
    const m = armarRecibo(base({ tipo: "factura", numero: "F001-00000007", cliente: { nombre: "Ferretería Lucho E.I.R.L.", documento: "20512345678" } }));
    expect(m.faltantes).toEqual([]);
    expect(m.cliente?.etiquetaDoc).toBe("RUC");
    const a4 = reciboHtml(m, "a4");
    expect(a4).toContain("Valor de venta");
    expect(a4).toContain("IGV 18 %");
    expect(a4).toContain("20512345678");
    expect(a4).toContain("V. unit.");
  });

  it("también avisa si el negocio no cargó su RUC, razón social o dirección", () => {
    const m = armarRecibo(base({ tipo: "factura", numero: "F001-1", negocio: { nombre: "Musa" } }));
    expect(m.faltantes).toEqual(expect.arrayContaining(["el RUC del negocio", "la razón social del negocio", "la dirección fiscal del negocio"]));
  });
});

describe("IGV con la regla de la emisión", () => {
  it("todo gravado: 118 = 100 + 18", () => {
    const m = armarRecibo(base({ tipo: "boleta", numero: "B001-1", lineas: [{ nombre: "Leche", cantidad: 1, precio: 118 }], total: 118 }));
    expect(m.totales).toMatchObject({ gravada: 100, igv: 18, exonerada: 0, total: 118, tasaIgvPct: 18 });
  });

  it("un producto exonerado no paga IGV y sale en su línea", () => {
    const m = armarRecibo(base({
      tipo: "boleta",
      numero: "B001-2",
      lineas: [{ nombre: "Gaseosa", cantidad: 1, precio: 118 }, { nombre: "Plátano", cantidad: 10, precio: 5, taxType: "exonerado" }],
      total: 168,
    }));
    expect(m.totales).toMatchObject({ gravada: 100, exonerada: 50, igv: 18, total: 168 });
    expect(reciboHtml(m, "ticket80")).toContain("Op. exonerada");
  });

  it("el total es el guardado, no la suma de las líneas (descuento global)", () => {
    const m = armarRecibo(base({ total: 75, descuento: 4 }));
    expect(m.totales.total).toBe(75);
    expect(m.totales.subtotal).toBe(79);
    expect(m.totales.descuento).toBe(4);
  });
});

describe("boleta o factura NO emitida: sin hash ni QR", () => {
  it.each(["boleta", "factura"])("%s pendiente", (tipo) => {
    const m = armarRecibo(base({ tipo, numero: tipo === "boleta" ? "B001-00000012" : "F001-00000003" }));
    expect(m.emitido).toBe(false);
    expect(m.pendienteDeEmision).toBe(true);
    expect(m.emision).toBeNull();
    expect(m.leyendas.join(" ")).not.toMatch(/Representación impresa/);
    for (const formato of ["ticket80", "ticket58", "a4"] as const) {
      const html = reciboHtml(m, formato);
      expect(html).toContain("PENDIENTE DE EMISIÓN");
      expect(html).not.toMatch(/Hash:/);
      expect(html).not.toMatch(/class="qr"/);
      expect(html).not.toMatch(/Representación impresa/);
    }
  });

  it("un hash vacío no cuenta como emitida", () => {
    expect(armarRecibo(base({ tipo: "boleta", numero: "B001-1", emision: { hash: "  " } })).emitido).toBe(false);
  });

  it("emitida: leyenda de representación impresa, hash, QR y dónde consultarla", () => {
    const m = armarRecibo(base({ tipo: "boleta", numero: "B001-00000012", emision: { hash: "aZ9+kd2=", qrDataUrl: "data:image/png;base64,AAAA" } }));
    expect(m.emitido).toBe(true);
    const html = reciboHtml(m, "ticket80");
    expect(html).toContain("Representación impresa de la Boleta de Venta Electrónica");
    expect(html).toContain("Hash: aZ9+kd2=");
    expect(html).toContain('class="qr"');
    expect(html).toContain("e-consulta.sunat.gob.pe");
    expect(html).not.toContain("PENDIENTE DE EMISIÓN");
  });

  it("un ticket con emisión no la muestra (no es comprobante)", () => {
    const m = armarRecibo(base({ emision: { hash: "x" } }));
    expect(m.emision).toBeNull();
  });
});

describe("cotización y proforma", () => {
  it.each(["cotizacion", "proforma"])("%s: sin valor tributario, con validez y sin pago", (tipo) => {
    const m = armarRecibo(base({ tipo, numero: "COT-00000004" }));
    const vence = formatDateNumeric(new Date(new Date("2026-10-15T15:30:00.000Z").getTime() + DIAS_DE_VALIDEZ * 86_400_000));
    expect(m.validoHasta).toBe(vence);
    expect(m.esComprobanteDePago).toBe(false);
    expect(m.leyendas.join(" ")).toContain(`sin valor tributario. Precios válidos hasta el ${vence}`);
    const html = reciboHtml(m, "a4");
    expect(html).not.toContain("Op. gravada");
    expect(html).not.toContain("Pagado con");
    expect(html).toContain("Válida hasta");
  });
});

describe("boleta de más de S/ 700", () => {
  it("sin DNI lo pide; con DNI no", () => {
    const sin = armarRecibo(base({ tipo: "boleta", numero: "B001-9", total: 750 }));
    expect(sin.faltantes.join(" ")).toMatch(/DNI del cliente/);
    const con = armarRecibo(base({ tipo: "boleta", numero: "B001-9", total: 750, cliente: { documento: "45678912" } }));
    expect(con.faltantes).toEqual([]);
    expect(con.cliente?.etiquetaDoc).toBe("DNI");
  });
});

describe("pago y hoja", () => {
  it("efectivo muestra recibido y vuelto; Plin no", () => {
    const ef = armarRecibo(base({ pago: { metodo: "efectivo", recibido: 100, vuelto: 21 } }));
    expect(ef.pago).toMatchObject({ metodo: "Efectivo", recibido: 100, vuelto: 21 });
    const plin = armarRecibo(base({ pago: { metodo: "plin", recibido: 79, vuelto: 0 } }));
    expect(plin.pago).toMatchObject({ metodo: "Plin", recibido: null, vuelto: null });
  });

  it("pago mixto lista cada medio", () => {
    const m = armarRecibo(base({ pago: { metodo: "MIXTO", detalle: JSON.stringify([{ method: "efectivo", amount: 50 }, { method: "yape", amount: 29 }]) } }));
    expect(m.pago.metodo).toBe("Pago mixto");
    expect(m.pago.detalle).toEqual([{ metodo: "Efectivo", monto: 50 }, { metodo: "Yape", monto: 29 }]);
  });

  it("escapa el texto y titula la hoja con el tipo y el número (nombre del PDF)", () => {
    const m = armarRecibo(base({ tipo: "boleta", numero: "B001-00000012", lineas: [{ nombre: "<script>x</script>", cantidad: 1, precio: 79 }] }));
    const html = reciboHtml(m, "ticket58");
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<title>Boleta B001-00000012</title>");
    expect(html).toContain("size:58mm auto");
  });

  it("el ticket térmico (ESC/POS) lleva las líneas y el total guardados", () => {
    const m = armarRecibo(base({ tipo: "boleta", numero: "B001-5" }));
    const t = datosTermicos(m, "venta1", new Date("2026-10-15T15:30:00Z"));
    expect(t.items).toHaveLength(2);
    expect(t.total).toBe(79);
    expect(t.ticketId).toBe("B001-5");
  });
});

describe("de la venta cobrada al recibo", () => {
  const detalles = {
    items: [
      { name: "Arroz", quantity: 2, price: 30, productId: 7, unit: "bolsa", taxType: null },
      { name: "Plátano", quantity: 10, price: 5, productId: 9, unit: "und", taxType: "exonerado" },
    ],
    total: 110,
    payment: "efectivo",
    comprobanteTipo: "boleta",
    comprobanteDoc: "45678912",
  };

  it("usa lo GUARDADO (precio neto, total, vuelto, número) y del carrito sólo la afectación", () => {
    const e = entradaDesdeVenta({
      ventaId: "v1",
      detalles: {
        ...detalles,
        venta: {
          id: "v1",
          items: [{ productId: 9, name: "Plátano", quantity: 10, price: "5" }, { productId: 7, name: "Arroz", quantity: 2, price: "29.5" }],
          total: "109",
          payment: "efectivo",
          amountPaid: "120",
          change: "11",
          createdAt: "2026-10-15T15:30:00.000Z",
          comprobanteNumero: "B001-00000012",
        },
      },
      atendio: "Rosa",
      respaldo: { total: 0, metodo: "", vuelto: null, fecha: new Date() },
    });
    expect(e.total).toBe(109);
    expect(e.numero).toBe("B001-00000012");
    expect(e.lineas[0]).toMatchObject({ nombre: "Plátano", precio: 5, taxType: "exonerado" });
    expect(e.lineas[1]).toMatchObject({ nombre: "Arroz", precio: 29.5, unidad: "bolsa", taxType: null });
    expect(e.pago).toMatchObject({ recibido: 120, vuelto: 11 });
    expect(e.cliente?.documento).toBe("45678912");
    expect(e.provisional).toBe(false);
  });

  it("el id del producto en texto (servidor) encuentra la afectación del carrito (número)", () => {
    const e = entradaDesdeVenta({
      ventaId: "v2",
      detalles: { ...detalles, venta: { id: "v2", items: [{ productId: "9", name: "Plátano", quantity: 10, price: 5 }, { productId: "7", name: "Arroz", quantity: 2, price: 30 }], total: 110 } },
      atendio: null,
      respaldo: { total: 0, metodo: "", vuelto: null, fecha: new Date() },
    });
    expect(e.lineas[0].taxType).toBe("exonerado");
    const m = armarRecibo({ ...e, negocio: NEGOCIO });
    expect(m.totales.exonerada).toBe(50);
    expect(m.totales.total).toBe(110);
  });

  it("reimpresión sin carrito: la afectación viene de la venta guardada (no todo gravado)", () => {
    const e = entradaDesdeVenta({
      ventaId: "v3",
      detalles: { items: [], total: 0, payment: "efectivo", venta: { id: "v3", comprobanteTipo: "boleta", items: [{ productId: 9, name: "Plátano", quantity: 10, price: 5, taxType: "exonerado" }, { productId: 7, name: "Arroz", quantity: 2, price: 59 }], total: 168 } },
      atendio: null,
      respaldo: { total: 0, metodo: "efectivo", vuelto: null, fecha: new Date() },
    });
    const m = armarRecibo({ ...e, negocio: NEGOCIO });
    expect(m.totales).toMatchObject({ exonerada: 50, gravada: 100, igv: 18, total: 168 });
  });

  it("sin respuesta del servidor (cola sin conexión) sale provisional con lo del POS", () => {
    const e = entradaDesdeVenta({ ventaId: "offline_1", detalles, atendio: null, respaldo: { total: 0, metodo: "efectivo", vuelto: 5, fecha: new Date() } });
    expect(e.provisional).toBe(true);
    expect(e.total).toBe(110);
    expect(e.pago.vuelto).toBe(5);
    expect(reciboHtml(armarRecibo({ ...e, negocio: NEGOCIO }), "ticket80")).toContain("Venta sin conexión");
  });
});

describe("teléfono del negocio", () => {
  it("el celular guardado con 51 sale legible y un fijo queda como está", () => {
    expect(armarRecibo(base({ negocio: { ...NEGOCIO, telefono: "51921585006" } })).negocio.telefono).toBe("921 585 006");
    expect(armarRecibo(base({ negocio: { ...NEGOCIO, telefono: "(061) 57-1234" } })).negocio.telefono).toBe("(061) 57-1234");
  });
});
