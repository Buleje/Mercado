import { describe, expect, it } from "vitest";
import { origenDeMovimiento } from "@/lib/caja/origen-movimiento";
import { armarParteDelDia, type CajaParaParte } from "@/lib/caja/parte-del-dia";
import { htmlReporteDeCaja } from "@/lib/caja/reporte-impreso";

describe("origenDeMovimiento", () => {
  it.each([
    [{ type: "venta", description: "Venta 62fd" }, "venta"],
    [{ type: "apertura", description: "Apertura de caja" }, "apertura"],
    [{ type: "egreso", description: "Adelanto ADL-2026-0013 · QA" }, "adelanto"],
    [{ type: "ingreso", description: "Anulación de adelanto ADL-2026-0001" }, "adelanto"],
    [{ type: "ingreso", description: "Liquidación de adelanto ADL-2026-0001 · Wasaco" }, "liquidacion"],
    [{ type: "egreso", description: "Retiro personal — para el almuerzo" }, "retiro-dueno"],
    // «adelanto» en el motivo de un retiro no lo vuelve adelanto (revisión 08-10)
    [{ type: "egreso", description: "Retiro personal — adelanto de sueldo" }, "retiro-dueno"],
    [{ type: "ingreso", description: "Adelanto recibido ADL-2026-0020 · Wasaco" }, "adelanto"],
    [{ type: "egreso", description: "Devolución de adelanto recibido ADL-2026-0020 · Wasaco" }, "adelanto"],
    [{ type: "egreso", description: "Anulación de adelanto recibido ADL-2026-0020 · Wasaco (devolución)" }, "adelanto"],
    [{ type: "egreso", description: "Compra de insumos — bolsas" }, "gasto"],
    [{ type: "egreso", description: "Pago a proveedor — Gloria" }, "proveedor"],
    [{ type: "ingreso", description: "Cambio" }, "cambio"],
    [{ type: "ingreso", description: "Cobro pendiente — doña Rosa" }, "cobro"],
    [{ type: "ingreso", description: "Ingreso extra — Prueba QA" }, "ingreso-extra"],
    [{ type: "ingreso", description: "Asistente IA: vuelto" }, "asistente"],
    [{ type: "egreso", description: "Egreso manual" }, "otro"],
    [{ type: "ingreso", description: "Pago", liquidacionCodigo: "LIQ-1" }, "liquidacion"],
  ])("%o → %s", (m, clave) => {
    expect(origenDeMovimiento(m).clave).toBe(clave);
  });
});

const caja = (over: Partial<CajaParaParte> = {}): CajaParaParte => ({
  id: "c1",
  status: "abierta",
  openedAt: "2026-10-08T13:00:00.000Z",
  openingAmount: 100,
  movements: [
    { type: "apertura", amount: 100, method: "efectivo", description: "Apertura de caja" },
    { type: "venta", amount: 30, method: "efectivo", description: "Venta s1", saleId: "s1" },
    { type: "venta", amount: 20, method: "yape", description: "Venta s2", saleId: "s2" },
    { type: "egreso", amount: 15, method: "efectivo", description: "Retiro personal — almuerzo" },
    { type: "ingreso", amount: 5, method: "efectivo", description: "Cambio" },
  ],
  ...over,
});

describe("armarParteDelDia", () => {
  it("el efectivo por origen cierra con el esperado (entra − sale = esperado)", () => {
    const p = armarParteDelDia(caja(), []);
    expect(p.esperado).toBe(120); // 100 + 30 + 5 − 15
    const entra = p.porOrigen.reduce((s, l) => s + l.entraEfectivo, 0);
    const sale = p.porOrigen.reduce((s, l) => s + l.saleEfectivo, 0);
    expect(entra - sale).toBe(p.esperado);
    const venta = p.porOrigen.find((l) => l.clave === "venta");
    expect(venta).toMatchObject({ n: 2, entraEfectivo: 30, otrosMedios: 20 });
    expect(p.porOrigen.find((l) => l.clave === "retiro-dueno")?.saleEfectivo).toBe(15);
    expect(p.contado).toBeNull();
  });

  it("concilia por saleId: la venta que no pasó por la caja se lista", () => {
    const p = armarParteDelDia(caja(), [
      { id: "s1", total: 30, payment: "efectivo", paymentDetails: null, createdAt: "2026-10-08T14:00:00.000Z" },
      { id: "s2", total: 20, payment: "yape", paymentDetails: null, createdAt: "2026-10-08T14:10:00.000Z" },
      { id: "s3", total: 12.5, payment: "efectivo", paymentDetails: null, createdAt: "2026-10-08T15:00:00.000Z" },
    ]);
    expect(p.conciliacion.ventasSistema).toEqual({ n: 3, total: 62.5, efectivo: 42.5 });
    expect(p.conciliacion.ventasEnCaja).toEqual({ n: 2, total: 50, efectivo: 30 });
    expect(p.conciliacion.sinCaja).toMatchObject({ n: 1, total: 12.5, efectivo: 12.5 });
    expect(p.conciliacion.diferenciaEfectivo).toBe(12.5);
    expect(p.conciliacion.cuadra).toBe(false);
  });

  it("pago mixto: sólo la parte en efectivo cuenta para el cajón", () => {
    const detalles = JSON.stringify([{ method: "efectivo", amount: 10 }, { method: "yape", amount: 20 }]);
    const p = armarParteDelDia(
      caja({ movements: [{ type: "venta", amount: 10, method: "efectivo", saleId: "m1" }, { type: "venta", amount: 20, method: "yape", saleId: "m1" }] }),
      [{ id: "m1", total: 30, payment: "MIXTO", paymentDetails: detalles, createdAt: "2026-10-08T14:00:00.000Z" }],
    );
    expect(p.conciliacion.ventasSistema.efectivo).toBe(10);
    expect(p.conciliacion.ventasEnCaja.n).toBe(1);
    expect(p.conciliacion.cuadra).toBe(true);
  });

  it("caja cerrada: usa el esperado guardado y calcula la diferencia con lo contado", () => {
    const p = armarParteDelDia(caja({ status: "cerrada", closedAt: "2026-10-08T22:00:00.000Z", expectedAmount: 120, closingAmount: 118 }), []);
    expect(p.contado).toBe(118);
    expect(p.diferencia).toBe(-2);
  });

  it("caja cerrada por el cron de turnos zombie: sin contado ni diferencia (el conteo es inventado)", () => {
    const p = armarParteDelDia(caja({ status: "cerrada", closedAt: "2026-10-08T22:00:00.000Z", expectedAmount: 120, closingAmount: 340, notes: "Cierre automático (turno zombie >12h). Revisar arqueo manual." }), []);
    expect(p.contado).toBeNull();
    expect(p.diferencia).toBeNull();
    expect(p.esperado).toBe(120);
  });
});

describe("htmlReporteDeCaja", () => {
  it("un origen con entrada y salida imprime las dos líneas (el papel suma el esperado)", () => {
    const c = caja({
      movements: [
        { type: "apertura", amount: 100, method: "efectivo", description: "Apertura de caja" },
        { type: "ingreso", amount: 50, method: "efectivo", description: "Cambio" },
        { type: "egreso", amount: 20, method: "efectivo", description: "Cambio" },
      ],
    });
    const parte = armarParteDelDia(c, []);
    expect(parte.esperado).toBe(130);
    const html = htmlReporteDeCaja(c, { fecha: "jueves 08/10", hora: "08:00" }, (n) => `S/${n.toFixed(2)}`, parte);
    const texto = html.replaceAll("&#x2F;", "/"); // escapeHtml escapa la barra
    expect(texto).toContain("Sencillo / cambio: +S/50.00");
    expect(texto).toContain("Sencillo / cambio: -S/20.00");
  });
});
