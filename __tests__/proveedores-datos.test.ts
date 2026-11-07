/**
 * Proveedores › lista: las cuentas que alimentan la fila y los indicadores.
 * Ejecutar: npx vitest run __tests__/proveedores-datos.test.ts
 */
import { describe, expect, it } from "vitest";
import type { DbSupplier } from "@/lib/jsondb";
import {
  deudaDe, diasHastaVencer, diasSinComprar, entregaPromedio, filtrarProveedores, topComprado,
  type CompraDeProveedor, type CuentaDeProveedor,
} from "@/components/admin/proveedores/datos-proveedores";

const cuenta = (o: Partial<CuentaDeProveedor>): CuentaDeProveedor => ({
  id: "c", supplierId: "s1", supplierName: "A", amount: 100, paidAmount: 0, status: "pendiente",
  description: "", createdAt: "2026-09-01T00:00:00.000Z", ...o,
});
const compra = (o: Partial<CompraDeProveedor>): CompraDeProveedor => ({ id: "o", supplierId: "s1", total: 100, status: "recibido", createdAt: "2026-10-01T12:00:00.000Z", ...o });

describe("proveedores — deuda y vencimiento por día de calendario", () => {
  it("medianoche UTC del 15 es el día 15, no el 14", () => {
    expect(diasHastaVencer("2026-10-15T00:00:00.000Z", "2026-10-15")).toBe(0);
    expect(diasHastaVencer("2026-10-15T00:00:00.000Z", "2026-10-16")).toBe(-1);
  });

  it("suma el saldo abierto y marca vencida o próxima", () => {
    const cuentas = [
      cuenta({ id: "a", amount: 500, paidAmount: 200, dueDate: "2026-10-10T00:00:00.000Z" }),
      cuenta({ id: "b", amount: 50, paidAmount: 50, status: "pagado", dueDate: "2026-09-01T00:00:00.000Z" }),
    ];
    expect(deudaDe(cuentas, "s1", "2026-10-12")).toEqual({ total: 300, n: 1, vencida: true, proxima: false });
    expect(deudaDe(cuentas, "s1", "2026-10-05")).toEqual({ total: 300, n: 1, vencida: false, proxima: true });
    expect(deudaDe(cuentas, "otro", "2026-10-05").n).toBe(0);
  });
});

describe("proveedores — compras", () => {
  it("a quién le compras más ignora las canceladas", () => {
    const compras = [compra({ supplierId: "s1", total: 100 }), compra({ supplierId: "s2", total: 900, status: "cancelado" }), compra({ supplierId: "s2", total: 150 })];
    expect(topComprado(compras)).toEqual({ supplierId: "s2", monto: 150, ordenes: 1 });
    expect(topComprado([])).toBeNull();
  });

  it("días sin comprar: nunca = null, y cuenta desde la última no cancelada", () => {
    const ahora = new Date("2026-10-31T12:00:00.000Z");
    expect(diasSinComprar([], "s1", ahora)).toBeNull();
    expect(diasSinComprar([compra({}), compra({ createdAt: "2026-10-20T12:00:00.000Z", status: "cancelado" })], "s1", ahora)).toBe(30);
  });
});

describe("proveedores — ficha y filtros", () => {
  const prov = (o: Partial<DbSupplier>) => ({ id: "x", name: "N", createdAt: "", ...o }) as DbSupplier;
  it("entrega promedio sólo con los que declaran días", () => {
    expect(entregaPromedio([prov({}), prov({ leadTimeDias: 2 }), prov({ leadTimeDias: 4 })])).toEqual({ dias: 3, declaran: 2 });
    expect(entregaPromedio([prov({})])).toBeNull();
  });

  it("filtra por deuda, RUC y texto", () => {
    const ps = [prov({ id: "s1", name: "Ucayali", ruc: "20123456789" }), prov({ id: "s2", name: "Madera", phone: "999" })];
    const cs = [cuenta({ supplierId: "s2" })];
    expect(filtrarProveedores(ps, cs, "con-deuda", "").map((s) => s.id)).toEqual(["s2"]);
    expect(filtrarProveedores(ps, cs, "con-ruc", "").map((s) => s.id)).toEqual(["s1"]);
    expect(filtrarProveedores(ps, cs, "sin-ruc", "999").map((s) => s.id)).toEqual(["s2"]);
    expect(filtrarProveedores(ps, cs, "todos", "ucay").map((s) => s.id)).toEqual(["s1"]);
  });
});
