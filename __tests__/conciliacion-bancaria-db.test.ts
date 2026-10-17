// @vitest-environment node
/**
 * Lo que el sistema pone al lado del extracto del banco (revisión 11-10):
 *  · una venta MIXTA (efectivo 30 + Yape 20) aporta los 20 de Yape; antes
 *    `payment: { in: digitales }` la dejaba afuera y el Yape quedaba «sólo en
 *    el banco»;
 *  · los pedidos son los que ya son plata (los estados de Mi Plata) o los que
 *    traen N° de operación; antes entraban los pendientes y preparando;
 *  · con una cuenta elegida, sólo los medios que caen en ella.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  tesoreria: vi.fn(),
  cuenta: vi.fn(),
  ventas: vi.fn(),
  caja: vi.fn(),
  pedidos: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    treasuryMovimiento: { findMany: (...a: unknown[]) => H.tesoreria(...a) },
    treasuryCuenta: { findFirst: (...a: unknown[]) => H.cuenta(...a) },
    sale: { findMany: (...a: unknown[]) => H.ventas(...a) },
    cashMovement: { findMany: (...a: unknown[]) => H.caja(...a) },
    order: { findMany: (...a: unknown[]) => H.pedidos(...a) },
  },
}));

import { ConciliacionBancariaDB } from "@/lib/db/conciliacion-bancaria.db";

const DIA = new Date("2026-10-15T17:00:00.000Z");
const PEDIDO = { desde: "2026-10-12", hasta: "2026-10-18", cuentaId: null, conVentas: true };

beforeEach(() => {
  vi.clearAllMocks();
  H.tesoreria.mockResolvedValue([]);
  H.cuenta.mockResolvedValue(null);
  H.ventas.mockResolvedValue([
    { id: "v1", total: 50, payment: "MIXTO", paymentDetails: JSON.stringify([{ method: "efectivo", amount: 30 }, { method: "yape", amount: 20 }]), comprobanteNumero: "B001-7", createdAt: DIA },
    { id: "v2", total: 12.5, payment: "plin", paymentDetails: null, comprobanteNumero: null, createdAt: DIA },
  ]);
  H.caja.mockResolvedValue([{ id: "c1", type: "ingreso", amount: 40, method: "yape", description: "Abono de fiado", createdAt: DIA }]);
  H.pedidos.mockResolvedValue([{ id: "pedido-0001", total: 33, paymentMethod: "Yape", yapeOperationNumber: "123", createdAt: DIA }]);
});

describe("movimientos del sistema para cuadrar el banco", () => {
  it("venta mixta: entra sólo la parte de Yape (20), no los 50 ni nada", async () => {
    const r = await ConciliacionBancariaDB.movimientosDelSistema("t1", PEDIDO);
    const ventas = r.pagos.filter((p) => p.id.startsWith("venta:"));
    expect(ventas.map((p) => [p.id, p.amount, p.method])).toEqual([
      ["venta:v1:0", 20, "Venta · yape"],
      ["venta:v2", 12.5, "Venta · plin"],
    ]);
    expect(r.porFuente).toEqual({ tesoreria: 0, ventas: 2, caja: 1, pedidos: 1 });
    // La consulta trae las mixtas además de las digitales.
    const where = H.ventas.mock.calls[0][0].where as { OR: unknown[] };
    expect(where.OR).toContainEqual({ payment: { equals: "mixto", mode: "insensitive" } });
  });

  it("pedidos: los estados de Mi Plata, o con N° de operación y no cancelados (nunca un pendiente sin N°)", async () => {
    await ConciliacionBancariaDB.movimientosDelSistema("t1", PEDIDO);
    const where = H.pedidos.mock.calls[0][0].where as { OR: unknown[]; status?: unknown; tenantId: string; deletedAt: null };
    expect(where.tenantId).toBe("t1");
    expect(where.deletedAt).toBeNull();
    expect(where.status).toBeUndefined();
    expect(where.OR).toEqual([
      { status: { in: ["confirmado", "en_camino", "entregado"] } },
      { status: { not: "cancelado" }, yapeOperationNumber: { gt: "" } },
    ]);
  });

  it("cuenta Yape (billetera): sólo lo cobrado por Yape; la venta por Plin queda afuera", async () => {
    H.cuenta.mockResolvedValue({ tipo: "MONEDERO_DIGITAL", nombre: "Yape", banco: null });
    const r = await ConciliacionBancariaDB.movimientosDelSistema("t1", { ...PEDIDO, cuentaId: "cy" });
    expect(H.cuenta).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "cy", tenantId: "t1" } }));
    expect(r.pagos.map((p) => p.id)).toEqual(["venta:v1:0", "caja:c1", "pedido:pedido-0001"]);
  });

  it("caja física: ningún cobro digital (ni consulta las ventas)", async () => {
    H.cuenta.mockResolvedValue({ tipo: "CAJA_FISICA", nombre: "Caja", banco: null });
    const r = await ConciliacionBancariaDB.movimientosDelSistema("t1", { ...PEDIDO, cuentaId: "cc" });
    expect(r.pagos).toEqual([]);
    expect(H.ventas).not.toHaveBeenCalled();
  });

  it("una venta ya anotada en Tesorería no se repite", async () => {
    H.tesoreria.mockResolvedValue([
      { id: "m1", tipo: "INGRESO", monto: 12.5, referencia: "v2", descripcion: "Plin", createdAt: DIA, cuenta: { nombre: "BCP" } },
    ]);
    const r = await ConciliacionBancariaDB.movimientosDelSistema("t1", PEDIDO);
    expect(r.pagos.filter((p) => p.id.startsWith("venta:")).map((p) => p.id)).toEqual(["venta:v1:0"]);
  });
});
