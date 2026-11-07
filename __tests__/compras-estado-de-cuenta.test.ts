import { describe, expect, it } from "vitest";
import { armarEstadoDeCuenta, type CuentaParaEstado } from "@/lib/compras/estado-de-cuenta";

const cuenta = (p: Partial<CuentaParaEstado>): CuentaParaEstado => ({
  id: "c1", description: "", amount: 0, createdAt: "2026-10-01T15:00:00.000Z", vence: "2026-10-31", payments: [], ...p,
});

describe("estado de cuenta con un proveedor (C48)", () => {
  const cuentas = [
    cuenta({
      id: "a", description: "Factura F001-10", amount: 500, createdAt: "2026-10-01T15:00:00.000Z", vence: "2026-10-08",
      payments: [
        { id: "p1", amount: 200, method: "yape", date: "2026-10-05T16:00:00.000Z", reference: "OP-9" },
        { id: "p2", amount: 100, method: "efectivo", date: "2026-10-20T16:00:00.000Z" },
      ],
    }),
    cuenta({
      id: "b", description: "Auto-generado desde OC po-1760000000000-ab12cd34", purchaseOrderId: "po-1760000000000-ab12cd34",
      documentoDeLaOrden: "Factura F001-11", amount: 300, createdAt: "2026-10-05T14:00:00.000Z", vence: "2026-10-20",
    }),
    cuenta({ id: "c", description: "flete", amount: 50, createdAt: "2026-10-12T14:00:00.000Z", vence: "2026-10-12" }),
  ];

  it("al corte, el saldo es cargos − abonos y se explica por lo que falta de cada cuenta", () => {
    const e = armarEstadoDeCuenta(cuentas, "2026-10-10");
    expect(e.cargos).toBe(800); // la de «flete» se anotó después del corte
    expect(e.abonos).toBe(200); // el pago del 20/10 todavía no
    expect(e.saldo).toBe(600); // a: 500 − 200 = 300 · b: 300
    expect(e.vencido).toBe(300); // sólo «a» venció antes del 10/10
    expect(e.abiertas).toBe(2);
    expect(e.movimientos.map((m) => [m.fecha, m.tipo, m.saldo])).toEqual([
      ["2026-10-01", "cargo", 500],
      ["2026-10-05", "cargo", 800], // el mismo día, el cargo antes que el abono
      ["2026-10-05", "abono", 600],
    ]);
  });

  it("el detalle no muestra el id técnico y nombra el pago con su medio", () => {
    const e = armarEstadoDeCuenta(cuentas, "2026-10-31");
    expect(e.movimientos.find((m) => m.cuentaId === "b" && m.tipo === "cargo")?.detalle).toBe("Orden de compra #AB12CD34 · Factura F001-11");
    expect(e.movimientos.find((m) => m.tipo === "abono" && m.abono === 200)?.detalle).toBe("Pago yape · ref. OP-9 — Factura F001-10");
    expect(e.saldo).toBe(500 + 300 + 50 - 300);
    expect(e.saldo).toBe(e.movimientos.at(-1)?.saldo);
  });

  it("cuenta las deudas sin factura ni orden", () => {
    expect(armarEstadoDeCuenta(cuentas, "2026-10-31").sinDocumento).toBe(1);
  });

  it("el día es el de Lima: un pago a las 21:00 del 10/10 en Lima entra al corte del 10/10", () => {
    const e = armarEstadoDeCuenta([
      cuenta({ amount: 100, payments: [{ id: "p", amount: 40, method: "plin", date: "2026-10-11T02:00:00.000Z" }] }),
    ], "2026-10-10");
    expect(e.abonos).toBe(40);
  });
});
