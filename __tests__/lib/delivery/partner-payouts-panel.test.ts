/**
 * Retiros del repartidor desde el panel (2026-10-09): aprobar, pagar, rechazar.
 *
 * Es plata: lo que se prueba es que un retiro se pague UNA sola vez (la
 * condición de estado va en el WHERE del UPDATE y el segundo intento no crea
 * otro gasto ni otro retiro de caja), que el tenant esté en el WHERE (un
 * retiro ajeno = 404), que pagar nazca el gasto «Pago a repartidor · <nombre>»
 * y que el efectivo salga de la caja sólo si hay una abierta.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => {
  const tx = {
    partnerPayout: { updateMany: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
    expense: { create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    cashMovement: { create: vi.fn(), findMany: vi.fn() },
    activityLog: { create: vi.fn() },
    deliveryAssignment: { aggregate: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    partnerPayout: tx.partnerPayout,
    deliveryAssignment: tx.deliveryAssignment,
  };
  return { tx, prisma, bloquearCaja: vi.fn(), bloquearCajaPorId: vi.fn(), invalidarVentas: vi.fn(), invalidarIgv: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/cache", () => ({ invalidate: vi.fn(), invalidateByPrefix: vi.fn() }));
vi.mock("@/lib/finance/resultado-del-negocio", () => ({ claveCacheResultado: (t: string) => `resultado:${t}` }));
vi.mock("@/lib/caja/invalidar-ventas-overview", () => ({ invalidarVentasOverview: H.invalidarVentas }));
vi.mock("@/lib/db/cash-registers-movements.db", () => ({
  CashRegistersMovementsDB: {
    bloquearCajaAbiertaEnTx: (...a: unknown[]) => H.bloquearCaja(...a),
    bloquearCajaParaAnotarEnTx: (...a: unknown[]) => H.bloquearCajaPorId(...a),
  },
}));
vi.mock("@/lib/db/igv-del-mes.db", () => ({ invalidarIgvDelMes: H.invalidarIgv }));

import { PartnerPayoutsDB } from "@/lib/db/partner-payouts.db";
import { veredicto, idGastoDeRetiro, accionRetiroSchema, esGastoDeRetiro } from "@/lib/delivery/payout-transiciones";
import { idDevolucionDeGasto, idRetiroDeGasto } from "@/lib/caja/egreso-de-caja";

const T = "tenant-a";
const ahora = new Date("2026-10-09T15:00:00.000Z");
const GASTO = idGastoDeRetiro("po1", ahora);

function fila(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: "po1",
    partnerId: "p1",
    amount: 80,
    yapeNumber: "987654321",
    status,
    note: null,
    createdAt: new Date("2026-10-08T14:00:00.000Z"),
    resolvedAt: null,
    partner: { name: "Juan Pérez", phone: "987654321" },
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  H.tx.expense.create.mockResolvedValue({ id: GASTO });
  H.tx.cashMovement.findMany.mockResolvedValue([]);
  H.tx.cashMovement.create.mockResolvedValue({ id: "mov" });
  H.tx.activityLog.create.mockResolvedValue({});
});

describe("veredicto (transiciones)", () => {
  it("pagar sale de pendiente o aprobado; repetirlo es «ya estaba»", () => {
    expect(veredicto("pagar", "pending")).toEqual({ tipo: "cambia", hacia: "paid" });
    expect(veredicto("pagar", "approved")).toEqual({ tipo: "cambia", hacia: "paid" });
    expect(veredicto("pagar", "paid")).toEqual({ tipo: "ya-estaba" });
    expect(veredicto("pagar", "rejected").tipo).toBe("no-se-puede");
  });
  it("rechazar un pagado no se puede; aprobar un pagado no hace nada", () => {
    expect(veredicto("rechazar", "paid").tipo).toBe("no-se-puede");
    expect(veredicto("rechazar", "rejected")).toEqual({ tipo: "ya-estaba" });
    expect(veredicto("aprobar", "paid")).toEqual({ tipo: "ya-estaba" });
    expect(veredicto("aprobar", "rejected").tipo).toBe("no-se-puede");
  });
  it("el schema exige motivo al rechazar y pone Yape por defecto al pagar", () => {
    expect(accionRetiroSchema.safeParse({ accion: "rechazar", motivo: "" }).success).toBe(false);
    const p = accionRetiroSchema.safeParse({ accion: "pagar" });
    expect(p.success && p.data.accion === "pagar" && p.data.metodo).toBe("yape");
  });
});

describe("PartnerPayoutsDB.pagar", () => {
  it("paga UNA vez: estado en el WHERE con el tenant, nace el gasto con id del retiro", async () => {
    H.tx.partnerPayout.updateMany.mockResolvedValueOnce({ count: 1 });
    H.tx.partnerPayout.findFirst.mockResolvedValueOnce(fila("paid"));

    const r = await PartnerPayoutsDB.pagar(T, "po1", { metodo: "yape", salidaDeCaja: false, referencia: "123", usuario: "qa" }, ahora);

    expect(r.ok && !r.yaEstaba && r.gastoId).toBe(GASTO);
    expect(H.invalidarIgv).toHaveBeenCalledWith(T);
    expect(H.tx.partnerPayout.updateMany).toHaveBeenCalledWith({
      where: { id: "po1", tenantId: T, status: { in: ["pending", "approved"] } },
      data: { status: "paid", note: "Yape · 123", resolvedAt: ahora },
    });
    const gasto = H.tx.expense.create.mock.calls[0][0].data;
    expect(gasto).toMatchObject({
      id: GASTO,
      tenantId: T,
      category: "Transporte",
      description: "Pago a repartidor · Juan Pérez",
      amount: 80,
      paymentMethod: "yape",
      recurring: false,
    });
    expect(H.bloquearCaja).not.toHaveBeenCalled();
    expect(H.tx.cashMovement.create).not.toHaveBeenCalled();
  });

  it("el segundo pago (doble clic) no crea otro gasto ni toca la caja", async () => {
    H.tx.partnerPayout.updateMany.mockResolvedValueOnce({ count: 0 });
    H.tx.partnerPayout.findFirst.mockResolvedValueOnce(fila("paid", { resolvedAt: ahora }));

    const r = await PartnerPayoutsDB.pagar(T, "po1", { metodo: "efectivo", salidaDeCaja: true, usuario: "qa" }, new Date("2026-10-09T15:00:05.000Z"));

    // El gasto del PRIMER pago (su instante), no uno con la hora del segundo clic.
    expect(r).toMatchObject({ ok: true, yaEstaba: true, gastoId: GASTO });
    expect(H.tx.expense.create).not.toHaveBeenCalled();
    expect(H.tx.activityLog.create).not.toHaveBeenCalled();
    expect(H.bloquearCaja).not.toHaveBeenCalled();
    expect(H.invalidarVentas).not.toHaveBeenCalled();
  });

  it("un retiro rechazado no se paga (409) y uno de otro negocio es 404", async () => {
    H.tx.partnerPayout.updateMany.mockResolvedValueOnce({ count: 0 });
    H.tx.partnerPayout.findFirst.mockResolvedValueOnce(fila("rejected"));
    const rechazado = await PartnerPayoutsDB.pagar(T, "po1", { metodo: "yape", salidaDeCaja: false, usuario: "qa" }, ahora);
    expect(rechazado).toMatchObject({ ok: false, status: 409 });

    H.tx.partnerPayout.updateMany.mockResolvedValueOnce({ count: 0 });
    H.tx.partnerPayout.findFirst.mockResolvedValueOnce(null);
    const ajeno = await PartnerPayoutsDB.pagar("tenant-b", "po1", { metodo: "yape", salidaDeCaja: false, usuario: "qa" }, ahora);
    expect(ajeno).toMatchObject({ ok: false, status: 404 });
    expect(H.tx.partnerPayout.findFirst.mock.calls[1][0].where).toEqual({ id: "po1", tenantId: "tenant-b" });
    expect(H.tx.expense.create).not.toHaveBeenCalled();
  });

  it("efectivo desde la caja abierta: egreso con el id de retiro del gasto", async () => {
    H.tx.partnerPayout.updateMany.mockResolvedValueOnce({ count: 1 });
    H.tx.partnerPayout.findFirst.mockResolvedValueOnce(fila("paid"));
    H.bloquearCaja.mockResolvedValueOnce({ id: "caja1" });

    const r = await PartnerPayoutsDB.pagar(T, "po1", { metodo: "efectivo", salidaDeCaja: true, usuario: "qa" }, ahora);

    expect(r).toMatchObject({ ok: true, caja: { sinCaja: false } });
    expect(H.tx.cashMovement.create).toHaveBeenCalledWith({
      data: {
        id: idRetiroDeGasto(GASTO),
        cashRegisterId: "caja1",
        type: "egreso",
        amount: 80,
        method: "efectivo",
        description: "Gasto · Pago a repartidor · Juan Pérez",
      },
    });
    expect(H.invalidarVentas).toHaveBeenCalledWith(T);
  });

  it("sin caja abierta el pago y el gasto quedan igual (sinCaja)", async () => {
    H.tx.partnerPayout.updateMany.mockResolvedValueOnce({ count: 1 });
    H.tx.partnerPayout.findFirst.mockResolvedValueOnce(fila("paid"));
    H.bloquearCaja.mockResolvedValueOnce(null);

    const r = await PartnerPayoutsDB.pagar(T, "po1", { metodo: "efectivo", salidaDeCaja: true, usuario: "qa" }, ahora);

    expect(r).toMatchObject({ ok: true, caja: { sinCaja: true } });
    expect(H.tx.expense.create).toHaveBeenCalledTimes(1);
    expect(H.tx.cashMovement.create).not.toHaveBeenCalled();
    // La nota no dice «de la caja» si no salió del cajón.
    expect(r.ok && r.retiro.note).toBe("Efectivo");
    expect(H.tx.partnerPayout.updateMany).toHaveBeenLastCalledWith({ where: { id: "po1", tenantId: T }, data: { note: "Efectivo" } });
  });

  it("con Yape no sale de la caja aunque pidan salidaDeCaja", async () => {
    H.tx.partnerPayout.updateMany.mockResolvedValueOnce({ count: 1 });
    H.tx.partnerPayout.findFirst.mockResolvedValueOnce(fila("paid"));
    const r = await PartnerPayoutsDB.pagar(T, "po1", { metodo: "yape", salidaDeCaja: true, usuario: "qa" }, ahora);
    expect(r).toMatchObject({ ok: true, caja: null });
    expect(H.bloquearCaja).not.toHaveBeenCalled();
  });
});

describe("PartnerPayoutsDB.rechazar / aprobar / saldo", () => {
  it("rechazar un pagado = 409 sin escribir auditoría", async () => {
    H.tx.partnerPayout.updateMany.mockResolvedValueOnce({ count: 0 });
    H.tx.partnerPayout.findFirst.mockResolvedValueOnce(fila("paid"));
    const r = await PartnerPayoutsDB.rechazar(T, "po1", "No corresponde", "qa");
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(H.tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("aprobar sólo sale de pendiente", async () => {
    H.tx.partnerPayout.updateMany.mockResolvedValueOnce({ count: 1 });
    H.tx.partnerPayout.findFirst.mockResolvedValueOnce(fila("approved"));
    const r = await PartnerPayoutsDB.aprobar(T, "po1", "qa");
    expect(r).toMatchObject({ ok: true, yaEstaba: false });
    expect(H.tx.partnerPayout.updateMany.mock.calls[0][0].where).toEqual({ id: "po1", tenantId: T, status: { in: ["pending"] } });
  });

  it("un retiro aprobado sigue apartando saldo (no se puede volver a pedir)", async () => {
    H.tx.deliveryAssignment.aggregate.mockResolvedValueOnce({ _sum: { fee: 100, tipAmount: 0 } });
    H.tx.partnerPayout.aggregate.mockResolvedValueOnce({ _sum: { amount: 80 } }).mockResolvedValueOnce({ _sum: { amount: 80 } });
    const saldo = await PartnerPayoutsDB.getBalance(T, "p1");
    expect(saldo.available).toBe(20);
    const comprometidos = H.tx.partnerPayout.aggregate.mock.calls[0][0].where.status.in;
    expect(comprometidos).toEqual(expect.arrayContaining(["pending", "approved", "paid"]));
    expect(comprometidos).not.toContain("rejected");
  });
});

describe("deshacer un pago (el camino de vuelta)", () => {
  const pagado = () => fila("paid", { resolvedAt: ahora, note: "Efectivo (de la caja)" });

  it("vuelve a aprobado con el instante del pago en el WHERE, borra SU gasto y devuelve el efectivo a la caja abierta", async () => {
    H.tx.partnerPayout.findFirst.mockResolvedValueOnce(pagado());
    H.tx.partnerPayout.updateMany.mockResolvedValueOnce({ count: 1 });
    H.tx.expense.deleteMany.mockResolvedValueOnce({ count: 1 });
    H.tx.cashMovement.findMany.mockResolvedValueOnce([
      { id: idRetiroDeGasto(GASTO), amount: 80, cashRegisterId: "caja1", cashRegister: { openedAt: ahora } },
    ]);
    H.bloquearCajaPorId.mockResolvedValueOnce({ status: "abierta" });

    const r = await PartnerPayoutsDB.deshacerPago(T, "po1", "  Le pagué al que no era  ", "qa");

    expect(H.tx.partnerPayout.updateMany).toHaveBeenCalledWith({
      where: { id: "po1", tenantId: T, status: "paid", resolvedAt: ahora },
      data: { status: "approved", resolvedAt: null, note: "Pago deshecho: Le pagué al que no era" },
    });
    expect(H.tx.expense.deleteMany).toHaveBeenCalledWith({ where: { id: GASTO, tenantId: T } });
    expect(H.bloquearCajaPorId).toHaveBeenCalledWith(H.tx, T, "caja1");
    expect(H.tx.cashMovement.create).toHaveBeenCalledWith({
      data: {
        id: idDevolucionDeGasto(GASTO),
        cashRegisterId: "caja1",
        type: "ingreso",
        amount: 80,
        method: "efectivo",
        description: "Gasto borrado · Pago a repartidor · Juan Pérez (vuelve a la caja)",
      },
    });
    expect(r).toMatchObject({ ok: true, yaEstaba: false, gastoBorrado: true, devolucion: { estado: "devuelto", monto: 80 } });
    expect(r.ok && r.retiro.status).toBe("approved");
    expect(H.tx.activityLog.create.mock.calls[0][0].data).toMatchObject({ tenantId: T, action: "Deshacer pago de retiro" });
    expect(H.invalidarVentas).toHaveBeenCalledWith(T);
    expect(H.invalidarIgv).toHaveBeenCalledWith(T);
  });

  it("si el gasto ya lo habían borrado en Gastos, sólo vuelve el estado: la plata no se devuelve dos veces", async () => {
    H.tx.partnerPayout.findFirst.mockResolvedValueOnce(pagado());
    H.tx.partnerPayout.updateMany.mockResolvedValueOnce({ count: 1 });
    H.tx.expense.deleteMany.mockResolvedValueOnce({ count: 0 });

    const r = await PartnerPayoutsDB.deshacerPago(T, "po1", "Lo borraron en Gastos", "qa");

    expect(r).toMatchObject({ ok: true, yaEstaba: false, gastoBorrado: false, devolucion: null });
    expect(H.tx.cashMovement.findMany).not.toHaveBeenCalled();
    expect(H.tx.cashMovement.create).not.toHaveBeenCalled();
  });

  it("caja ya cerrada o devolución ya anotada: no se anota nada en el cajón", async () => {
    const egreso = { id: idRetiroDeGasto(GASTO), amount: 80, cashRegisterId: "caja1", cashRegister: { openedAt: ahora } };
    H.tx.partnerPayout.findFirst.mockResolvedValueOnce(pagado());
    H.tx.partnerPayout.updateMany.mockResolvedValueOnce({ count: 1 });
    H.tx.expense.deleteMany.mockResolvedValueOnce({ count: 1 });
    H.tx.cashMovement.findMany.mockResolvedValueOnce([egreso]);
    H.bloquearCajaPorId.mockResolvedValueOnce({ status: "cerrada" });
    const cerrada = await PartnerPayoutsDB.deshacerPago(T, "po1", "Error de monto", "qa");
    expect(cerrada).toMatchObject({ ok: true, devolucion: { estado: "cerrada", monto: 80 } });

    H.tx.partnerPayout.findFirst.mockResolvedValueOnce(pagado());
    H.tx.partnerPayout.updateMany.mockResolvedValueOnce({ count: 1 });
    H.tx.expense.deleteMany.mockResolvedValueOnce({ count: 1 });
    H.tx.cashMovement.findMany.mockResolvedValueOnce([egreso, { ...egreso, id: idDevolucionDeGasto(GASTO) }]);
    const yaDevuelto = await PartnerPayoutsDB.deshacerPago(T, "po1", "Error de monto", "qa");
    expect(yaDevuelto).toMatchObject({ ok: true, devolucion: { estado: "ya-devuelto" } });

    expect(H.tx.cashMovement.create).not.toHaveBeenCalled();
    expect(H.invalidarVentas).not.toHaveBeenCalled();
  });

  it("dos «deshacer» a la vez: el segundo cuenta 0, relee y no borra nada", async () => {
    H.tx.partnerPayout.findFirst.mockResolvedValueOnce(pagado()).mockResolvedValueOnce(fila("approved"));
    H.tx.partnerPayout.updateMany.mockResolvedValueOnce({ count: 0 });

    const r = await PartnerPayoutsDB.deshacerPago(T, "po1", "Doble clic", "qa");

    expect(r).toMatchObject({ ok: true, yaEstaba: true });
    expect(H.tx.expense.deleteMany).not.toHaveBeenCalled();
    expect(H.tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("pendiente = 409 sin escribir; de otro negocio = 404 con el tenant en el WHERE", async () => {
    H.tx.partnerPayout.findFirst.mockResolvedValueOnce(fila("pending"));
    expect(await PartnerPayoutsDB.deshacerPago(T, "po1", "No va", "qa")).toMatchObject({ ok: false, status: 409 });

    H.tx.partnerPayout.findFirst.mockResolvedValueOnce(null);
    expect(await PartnerPayoutsDB.deshacerPago("tenant-b", "po1", "No va", "qa")).toMatchObject({ ok: false, status: 404 });
    expect(H.tx.partnerPayout.findFirst.mock.calls[1][0].where).toEqual({ id: "po1", tenantId: "tenant-b" });
    expect(H.tx.partnerPayout.updateMany).not.toHaveBeenCalled();
    expect(H.tx.expense.deleteMany).not.toHaveBeenCalled();
  });

  it("reglas puras: deshacer sale de pagado; rechazar un pagado manda a «Deshacer pago»; Gastos reconoce el gasto", () => {
    expect(veredicto("deshacer", "paid")).toEqual({ tipo: "cambia", hacia: "approved" });
    expect(veredicto("deshacer", "approved")).toEqual({ tipo: "ya-estaba" });
    expect(veredicto("deshacer", "pending").tipo).toBe("no-se-puede");
    const r = veredicto("rechazar", "paid");
    expect(r.tipo === "no-se-puede" && r.motivo).toContain("Deshacer pago");
    expect(accionRetiroSchema.safeParse({ accion: "deshacer", motivo: " " }).success).toBe(false);
    // Pagar → deshacer → pagar otra vez: el gasto (y su egreso de caja) no choca con el del primer pago.
    expect(idGastoDeRetiro("po1", ahora)).not.toBe(idGastoDeRetiro("po1", new Date(ahora.getTime() + 1)));
    expect(esGastoDeRetiro(GASTO)).toBe(true);
    expect(esGastoDeRetiro("gasto-123")).toBe(false);
  });
});

describe("historial del panel filtrado en la base", () => {
  it("«Pagados» pide sólo pagados al WHERE; sin filtro, todo lo resuelto", async () => {
    H.tx.partnerPayout.findMany.mockResolvedValue([]);
    H.tx.partnerPayout.aggregate.mockResolvedValue({ _sum: { amount: null }, _count: { _all: 0 } });
    await PartnerPayoutsDB.listForTenant(T, { historial: "paid" }, ahora);
    expect(H.tx.partnerPayout.findMany.mock.calls[1][0].where).toEqual({ tenantId: T, status: { equals: "paid" } });
    await PartnerPayoutsDB.listForTenant(T, {}, ahora);
    expect(H.tx.partnerPayout.findMany.mock.calls[3][0].where).toEqual({ tenantId: T, status: { notIn: ["pending", "approved"] } });
  });
});
