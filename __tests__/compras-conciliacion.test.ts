import { describe, expect, it } from "vitest";
import { conciliar, type CuentaAConciliar, type DatosConciliacion, type OrdenAConciliar, type RecepcionAConciliar } from "@/lib/compras/conciliacion";

const PERIODO = { desde: "2026-10-01", hasta: "2026-10-31" };

function orden(p: Partial<OrdenAConciliar> & { id: string }): OrdenAConciliar {
  return {
    supplierId: "prov-a", supplierName: "Distribuidora Andina", total: 100, status: "recibido", invoiceType: "factura", invoiceNumber: "F001-5",
    paymentMethod: "credito_15", createdAt: "2026-10-05T15:00:00Z",
    items: [{ productId: 1, name: "Arroz Costeño 5 kg", quantity: 10, unitCost: 10, unit: "saco" }],
    ...p,
  };
}
function recepcion(p: Partial<RecepcionAConciliar> & { id: string }): RecepcionAConciliar {
  return {
    ref: `REC-${p.id}`, purchaseOrderId: null, status: "completada", receivedDate: "2026-10-06T15:00:00Z", createdAt: "2026-10-06T15:00:00Z",
    supplierId: "prov-a", supplierName: "Distribuidora Andina", itemsJson: [], ...p,
  };
}
function cuenta(p: Partial<CuentaAConciliar> & { id: string }): CuentaAConciliar {
  return {
    supplierId: "prov-a", supplierName: "Distribuidora Andina", purchaseOrderId: null, description: "", amount: 100, paidAmount: 0,
    status: "pendiente", createdAt: "2026-10-05T16:00:00Z", pagosAnotados: 0, ...p,
  };
}
const llegaron = (cantidad: number, extra: Record<string, unknown> = {}) => [{ product: "Arroz Costeño 5 kg", productId: 1, expectedQty: 10, receivedQty: cantidad, condition: "bueno", ...extra }];
const datos = (d: Partial<DatosConciliacion>): DatosConciliacion => ({ ordenes: [], recepciones: [], cuentas: [], ...d });
const claves = (fila: { diferencias: Array<{ clave: string }> }) => fila.diferencias.map((x) => x.clave);

describe("conciliar — orden, recepción, factura, cuenta y pago lado a lado", () => {
  it("factura de 10 frente a 8 aceptadas: diferencia de 2 en la línea y la cuenta pide S/ 20 de más", () => {
    const r = conciliar(datos({
      ordenes: [orden({ id: "oc1" })],
      recepciones: [recepcion({ id: "r1", purchaseOrderId: "oc1", itemsJson: llegaron(8) })],
      cuentas: [cuenta({ id: "c1", purchaseOrderId: "oc1", description: "Factura F001-5" })],
    }), PERIODO);
    const fila = r.filas[0];
    expect(fila.estado).toBe("revisar");
    expect(fila.documento).toBe("Factura F001-5");
    expect(fila.lineas).toEqual([expect.objectContaining({ pedido: 10, llego: 8, aceptadas: 8, diferencia: 2, sinExplicar: 2 })]);
    expect(fila.llego?.valor).toBe(80);
    const menos = fila.diferencias.find((x) => x.clave === "aceptado-menos");
    expect(menos).toMatchObject({ origen: "recepcion", monto: 20 });
    expect(menos?.texto).toContain("facturado");
    expect(fila.diferencias.find((x) => x.clave === "cuenta-mayor")).toMatchObject({ tono: "alerta", origen: "cuenta", monto: 20 });
    expect(r.resumen.enDiferencia).toBe(40);
  });

  it("si los 2 que faltan se anotaron como «no llegará» y la cuenta bajó a S/ 80, cuadra", () => {
    const r = conciliar(datos({
      ordenes: [orden({ id: "oc1" })],
      recepciones: [recepcion({ id: "r1", purchaseOrderId: "oc1", itemsJson: [...llegaron(8), { product: "Arroz Costeño 5 kg", productId: 1, receivedQty: 0, condition: "faltante", creditoUnidades: 2 }] })],
      cuentas: [cuenta({ id: "c1", purchaseOrderId: "oc1", amount: 80, description: "Factura F001-5" })],
    }), PERIODO);
    const fila = r.filas[0];
    expect(fila.estado).toBe("cuadra");
    expect(claves(fila)).toEqual(["descontado-al-recibir"]);
    expect(fila.lineas[0]).toMatchObject({ diferencia: 2, sinExplicar: 0, noLlegara: 2 });
  });

  it("el valor aceptado lleva el IGV y los cargos de la orden (total ÷ subtotal), dentro de S/ 1 cuadra", () => {
    const r = conciliar(datos({
      ordenes: [orden({ id: "oc1", total: 118 })],
      recepciones: [recepcion({ id: "r1", purchaseOrderId: "oc1", itemsJson: llegaron(10) })],
      cuentas: [cuenta({ id: "c1", purchaseOrderId: "oc1", amount: 118.6, paidAmount: 118.6, pagosAnotados: 118.6 })],
    }), PERIODO);
    expect(r.filas[0].llego?.valor).toBe(118);
    expect(r.filas[0].estado).toBe("cuadra");
  });

  it("llegó mercadería sin factura ni boleta: avisa desde el documento; con «sin comprobante» elegido, no", () => {
    const base = { recepciones: [recepcion({ id: "r1", purchaseOrderId: "oc1", itemsJson: llegaron(10) })], cuentas: [cuenta({ id: "c1", purchaseOrderId: "oc1", description: "Auto-generado desde OC oc1" })] };
    const sinDoc = conciliar(datos({ ...base, ordenes: [orden({ id: "oc1", invoiceType: "guia", invoiceNumber: "T001-9" })] }), PERIODO).filas[0];
    expect(sinDoc.diferencias.find((x) => x.clave === "recibido-sin-comprobante")).toMatchObject({ tono: "aviso", origen: "documento" });
    expect(sinDoc.diferencias[0].texto).toContain("con la guía T001-9");
    expect(sinDoc.cuenta?.texto).toBe("Orden de compra #OC1");
    const elegido = conciliar(datos({ ...base, ordenes: [orden({ id: "oc1", invoiceType: "ninguno", invoiceNumber: null })] }), PERIODO).filas[0];
    expect(claves(elegido)).not.toContain("recibido-sin-comprobante");
    expect(elegido.sinComprobante).toBe(true);
  });

  it("la factura de la cuenta cuenta como documento aunque la orden no la tenga", () => {
    const r = conciliar(datos({
      ordenes: [orden({ id: "oc1", invoiceType: null, invoiceNumber: null })],
      recepciones: [recepcion({ id: "r1", purchaseOrderId: "oc1", itemsJson: llegaron(10) })],
      cuentas: [cuenta({ id: "c1", purchaseOrderId: "oc1", description: "Factura F001-88 · emitida 04/10" })],
    }), PERIODO);
    expect(r.filas[0].documento).toBe("Factura F001-88");
    expect(r.filas[0].estado).toBe("cuadra");
  });

  it("factura sin recepción: con la orden abierta pide registrar lo que llegó", () => {
    const r = conciliar(datos({ ordenes: [orden({ id: "oc1", status: "pendiente" })], cuentas: [cuenta({ id: "c1", purchaseOrderId: "oc1" })] }), PERIODO);
    expect(r.filas[0].diferencias.find((x) => x.clave === "comprobante-sin-recepcion")).toMatchObject({ tono: "aviso", origen: "recepcion" });
    expect(r.filas[0].estado).toBe("revisar");
  });

  it("marcada recibida sin hoja: queda «sin comparar», no como diferencia", () => {
    const r = conciliar(datos({ ordenes: [orden({ id: "oc1" })], cuentas: [cuenta({ id: "c1", purchaseOrderId: "oc1" })] }), PERIODO);
    expect(r.filas[0].estado).toBe("sin-comparar");
    expect(r.filas[0].diferencias.every((x) => x.tono === "info")).toBe(true);
  });

  it("orden abierta con entrega parcial: lo que falta llegar es informativo y la fila sigue en curso", () => {
    const r = conciliar(datos({
      ordenes: [orden({ id: "oc1", status: "parcial" })],
      recepciones: [recepcion({ id: "r1", purchaseOrderId: "oc1", itemsJson: llegaron(6) })],
      cuentas: [cuenta({ id: "c1", purchaseOrderId: "oc1" })],
    }), PERIODO);
    expect(r.filas[0].estado).toBe("en-curso");
    expect(r.filas[0].diferencias.find((x) => x.clave === "faltan-llegar")).toMatchObject({ tono: "info", monto: 40 });
  });

  it("llegó de más: aviso con las unidades que no están en la orden", () => {
    const r = conciliar(datos({
      ordenes: [orden({ id: "oc1" })],
      recepciones: [recepcion({ id: "r1", purchaseOrderId: "oc1", itemsJson: llegaron(12) })],
      cuentas: [cuenta({ id: "c1", purchaseOrderId: "oc1" })],
    }), PERIODO);
    expect(r.filas[0].diferencias.find((x) => x.clave === "llego-de-mas")?.texto).toContain("2 unidades");
    expect(r.filas[0].llego?.valor).toBe(100);
  });

  it("pagos: lo pagado por encima de la cuenta es alerta y lo pagado distinto de los pagos anotados es aviso", () => {
    const r = conciliar(datos({
      ordenes: [orden({ id: "oc1" })],
      recepciones: [recepcion({ id: "r1", purchaseOrderId: "oc1", itemsJson: llegaron(10) })],
      cuentas: [cuenta({ id: "c1", purchaseOrderId: "oc1", paidAmount: 130, pagosAnotados: 100 })],
    }), PERIODO);
    expect(r.filas[0].diferencias.find((x) => x.clave === "pago-de-mas")).toMatchObject({ tono: "alerta", origen: "pago", monto: 30 });
    expect(r.filas[0].diferencias.find((x) => x.clave === "pagos-anotados")).toMatchObject({ tono: "aviso", monto: 30 });
  });

  it("orden a crédito sin cuenta: propone la cuenta suelta del mismo proveedor y monto, sin unirla", () => {
    const r = conciliar(datos({
      ordenes: [orden({ id: "oc1", invoiceNumber: "F001-7" })],
      recepciones: [recepcion({ id: "r1", purchaseOrderId: "oc1", itemsJson: llegaron(10) })],
      cuentas: [cuenta({ id: "c9", description: "Factura F001-0007", amount: 100.4 })],
    }), PERIODO);
    const deOrden = r.filas.find((x) => x.tipo === "orden")!;
    expect(claves(deOrden)).toContain("credito-sin-cuenta");
    expect(deOrden.propuestas[0].motivo).toContain("el mismo monto");
    const suelta = r.filas.find((x) => x.tipo === "cuenta")!;
    expect(suelta.codigo).toBe("Factura F001-0007");
    expect(suelta.propuestas[0].motivo).toContain("el mismo comprobante");
    expect(suelta.estado).toBe("revisar");
  });

  it("cuenta suelta sin orden posible queda «sin comparar»; un saldo inicial cuadra", () => {
    const r = conciliar(datos({
      cuentas: [
        cuenta({ id: "c1", description: "Servicio de flete Pucallpa", amount: 250 }),
        cuenta({ id: "c2", description: "Saldo inicial · lo que se debía", amount: 900 }),
      ],
    }), PERIODO);
    expect(r.filas.find((x) => x.id === "cuenta:c1")?.estado).toBe("sin-comparar");
    expect(r.filas.find((x) => x.id === "cuenta:c2")?.estado).toBe("cuadra");
  });

  it("recepción sin orden: no sumó stock ni deuda y propone la orden abierta del proveedor", () => {
    const r = conciliar(datos({
      ordenes: [orden({ id: "oc1", status: "pendiente", invoiceNumber: null })],
      recepciones: [recepcion({ id: "r1", itemsJson: llegaron(4) })],
    }), PERIODO);
    const suelta = r.filas.find((x) => x.tipo === "recepcion")!;
    expect(suelta.estado).toBe("revisar");
    expect(suelta.llego?.unidades).toBe(4);
    expect(suelta.propuestas).toHaveLength(1);
    expect(r.filas[0].tipo).toBe("recepcion");
  });

  it("cancelada: sin papeles no aparece; con saldo pendiente es alerta", () => {
    const vacia = conciliar(datos({ ordenes: [orden({ id: "oc1", status: "cancelado" })] }), PERIODO);
    expect(vacia.filas).toHaveLength(0);
    const conSaldo = conciliar(datos({ ordenes: [orden({ id: "oc1", status: "cancelado" })], cuentas: [cuenta({ id: "c1", purchaseOrderId: "oc1", paidAmount: 40, pagosAnotados: 40 })] }), PERIODO);
    expect(conSaldo.filas[0].diferencias.find((x) => x.clave === "cancelada-con-saldo")).toMatchObject({ tono: "alerta", monto: 60 });
  });

  it("cancelada después de recibir: aviso con lo que llegó y quedó sin deuda (pasa a «por revisar»)", () => {
    const r = conciliar(datos({
      ordenes: [orden({ id: "oc1", status: "cancelado" })],
      recepciones: [recepcion({ id: "r1", purchaseOrderId: "oc1", itemsJson: llegaron(2) })],
    }), PERIODO);
    expect(r.filas[0].diferencias.find((x) => x.clave === "cancelada-con-recibido")).toMatchObject({ tono: "aviso", origen: "recepcion", monto: 20 });
    expect(r.filas[0].estado).toBe("revisar");
  });

  it("orden automática con costo 0 por producto: el total se reparte por unidad pedida", () => {
    const auto = { total: 600, items: [{ productId: 1, name: "Arroz Costeño 5 kg", quantity: 40, unitCost: 0, unit: "saco" }] };
    const r = conciliar(datos({
      ordenes: [orden({ id: "oc1", ...auto })],
      recepciones: [recepcion({ id: "r1", purchaseOrderId: "oc1", itemsJson: [{ product: "Arroz Costeño 5 kg", productId: 1, expectedQty: 40, receivedQty: 38, condition: "bueno" }] })],
      cuentas: [cuenta({ id: "c1", purchaseOrderId: "oc1", amount: 600 })],
    }), PERIODO);
    expect(r.filas[0].llego?.valor).toBe(570);
    expect(r.filas[0].diferencias.find((x) => x.clave === "aceptado-menos")?.monto).toBe(30);
    expect(r.filas[0].diferencias.find((x) => x.clave === "cuenta-mayor")?.monto).toBe(30);
  });

  it("dos cuentas para la misma orden: aviso de deuda posiblemente duplicada", () => {
    const r = conciliar(datos({
      ordenes: [orden({ id: "oc1", status: "pendiente" })],
      cuentas: [cuenta({ id: "c1", purchaseOrderId: "oc1", amount: 50 }), cuenta({ id: "c2", purchaseOrderId: "oc1", amount: 50 })],
    }), PERIODO);
    expect(claves(r.filas[0])).toContain("varias-cuentas");
    expect(r.filas[0].cuenta).toMatchObject({ monto: 100, cuantas: 2 });
  });

  it("período en el día de Lima y filtro de proveedor; la lista de proveedores sale antes de filtrar", () => {
    const r = conciliar(datos({
      ordenes: [
        orden({ id: "oc1", createdAt: "2026-11-01T03:00:00Z" }), // 31/10 22:00 en Lima: entra
        orden({ id: "oc2", createdAt: "2026-11-01T06:00:00Z" }), // 1/11 en Lima: fuera
        orden({ id: "oc3", supplierId: "prov-b", supplierName: "Molino del Oriente", status: "pendiente", invoiceNumber: null }),
      ],
    }), { ...PERIODO, proveedorId: "prov-b" });
    expect(r.filas.map((x) => x.ordenId)).toEqual(["oc3"]);
    expect(r.proveedores.map((p) => p.id)).toEqual(["prov-a", "prov-b"]);
  });
});
