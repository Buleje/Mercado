/**
 * LibrosContadorDB — la capa de lectura con prisma de mentira: qué se le PIDE a la base
 * (tenant en cada WHERE, día de Lima para los gastos) y cómo se arma la entrada de las
 * funciones puras (devoluciones con/sin nota de crédito, pedido con comprobante de otro
 * mes, referencia «B001-123» partida).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const P = vi.hoisted(() => ({
  sunatInvoice: { findMany: vi.fn() },
  sale: { findMany: vi.fn() },
  order: { findMany: vi.fn(), count: vi.fn() },
  notaCredito: { findMany: vi.fn() },
  return: { findMany: vi.fn() },
  customer: { findMany: vi.fn() },
  purchaseOrder: { findMany: vi.fn() },
  expense: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: P }));
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: { get: vi.fn() } }));

import { LibrosContadorDB } from "@/lib/db/libros-contador.db";
import { rangoDelPeriodo } from "@/lib/contabilidad/libros/comun";

const T = "tenant-a";
const rango = rangoDelPeriodo("2026-10")!;
const d = (iso: string) => new Date(iso);

beforeEach(() => {
  vi.clearAllMocks();
  for (const m of [P.sunatInvoice, P.sale, P.order, P.notaCredito, P.return, P.customer, P.purchaseOrder, P.expense]) m.findMany.mockResolvedValue([]);
  P.order.count.mockResolvedValue(0);
});

describe("LibrosContadorDB.ventas", () => {
  it("devolución del POS: con nota EMITIDA de esa venta (de cualquier mes) cuenta como cubierta; sin nota, no", async () => {
    P.return.findMany.mockResolvedValue([
      { id: "r1", saleId: "s1", orderId: null, total: "24.90" },
      { id: "r2", saleId: "s2", orderId: null, total: "5.00" },
    ]);
    // 1.ª llamada: notas del mes (ninguna). 2.ª: notas de las ventas devueltas.
    P.notaCredito.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ saleId: "s2", orderId: null }]);

    const e = await LibrosContadorDB.ventas(T, rango);

    expect(e.devoluciones).toEqual([
      { id: "r1", origen: "pos", total: 24.9, conNotaCredito: false },
      { id: "r2", origen: "pos", total: 5, conNotaCredito: true },
    ]);
    const q = P.notaCredito.findMany.mock.calls[1][0];
    expect(q.where).toMatchObject({ tenantId: T, status: "EMITIDA", OR: [{ saleId: { in: ["s1", "s2"] } }] });
    expect(q.where.createdAt).toBeUndefined();
    expect(P.return.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: T, createdAt: { gte: rango.desde, lt: rango.hasta } });
  });

  it("pedido entregado: busca su boleta/factura SIN filtro de fecha y con el tenant", async () => {
    P.order.findMany.mockResolvedValue([{ id: "o1", createdAt: d("2026-10-31T20:00:00Z"), total: "59", customerName: "Ana", customerPhone: null, items: [] }]);
    // 1.ª llamada: comprobantes del mes (ninguno). 2.ª: comprobantes de los pedidos.
    P.sunatInvoice.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ orderId: "o1" }]);

    const e = await LibrosContadorDB.ventas(T, rango);

    expect(e.pedidosConComprobante).toEqual(["o1"]);
    const q = P.sunatInvoice.findMany.mock.calls[1][0];
    expect(q.where).toEqual({ tenantId: T, orderId: { in: ["o1"] }, type: { in: ["boleta", "factura"] }, sunatStatus: { not: "rejected" } });
  });

  it("nota de crédito de una venta POS con «B001-123»: serie y número partidos, como la fila del POS", async () => {
    P.notaCredito.findMany.mockResolvedValueOnce([
      { id: "nc1", numero: "NC-0001", createdAt: d("2026-10-09T15:00:00Z"), igv: "0", total: "10", motivoDesc: "Devolución", saleId: "s1", orderId: null },
    ]);
    P.sale.findMany
      .mockResolvedValueOnce([]) // ventas del mes
      .mockResolvedValueOnce([{ id: "s1", createdAt: d("2026-10-02T15:00:00Z"), comprobanteTipo: "boleta", comprobanteNumero: "B001-123" }]);

    const e = await LibrosContadorDB.ventas(T, rango);

    expect(e.notasCredito[0].referencia).toMatchObject({ tipo: "03", serie: "B001", numero: "123" });
  });
});

describe("LibrosContadorDB.compras", () => {
  it("gastos por día de Lima (como el IGV del mes), con el tenant en el WHERE", async () => {
    await LibrosContadorDB.compras(T, rango);
    expect(P.expense.findMany.mock.calls[0][0].where).toEqual({
      tenantId: T,
      recurring: false,
      AND: [
        { OR: [{ date: { gte: d("2026-10-01T05:00:00Z"), lt: d("2026-11-01T05:00:00Z") } }, { date: d("2026-10-01T00:00:00Z") }] },
        { NOT: { date: d("2026-11-01T00:00:00Z") } },
      ],
    });
    expect(P.purchaseOrder.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: T });
  });
});
