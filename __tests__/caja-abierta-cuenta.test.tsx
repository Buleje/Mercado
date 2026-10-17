/**
 * Tests — el aviso de caja abierta dice QUÉ hay adentro (2026-09-30).
 *
 * Medido en el negocio real: caja abierta desde el 11/06 (111 días), apertura
 * S/ 100, 3 ventas en 2 días. El aviso sólo decía la fecha y el arqueo mostraba
 * la apertura como «Esperado» (expectedAmount recién existe al cerrar): cerrar
 * daba miedo porque nadie sabía cuánto contar.
 *
 * Escenario de los tests (mismas cifras de forma, montos inventados):
 *   V1 efectivo 80 · V2 mixto (efectivo 65 + yape 30) · V3 yape 50
 *   → 3 ventas, S/ 145 en efectivo, esperado 100 + 145 = S/ 245.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const findFirst = vi.fn();
const findMany = vi.fn();
const groupBy = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    cashRegister: { findFirst: (...a: unknown[]) => findFirst(...a), findMany: (...a: unknown[]) => findMany(...a) },
    cashMovement: { groupBy: (...a: unknown[]) => groupBy(...a) },
    tenant: { findFirst: vi.fn().mockResolvedValue(null) },
    deliveryPartner: { count: vi.fn().mockResolvedValue(0) },
    deliveryOffer: { count: vi.fn().mockResolvedValue(0) },
    order: { count: vi.fn().mockResolvedValue(0) },
  },
}));
vi.mock("@/lib/prisma-rls", () => ({ withRlsTx: vi.fn() }));
vi.mock("@/lib/cache", () => ({
  invalidate: vi.fn(),
  getOrSet: (_k: string, _ttl: number, fn: () => unknown) => fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { contarVentas, cuentaEfectivoCaja, type MovimientoCaja } from "@/lib/caja/efectivo-esperado";
import { avisoCajaAbierta } from "@/lib/caja/caja-abierta";
import { CashRegistersDB } from "@/lib/db/sales.db";
import { AlertsDB } from "@/lib/db/alerts.db";
import AdminAlertsBanner from "@/components/admin/AdminAlertsBanner";

const MOVIMIENTOS: MovimientoCaja[] = [
  { type: "apertura", method: "efectivo", amount: 100 },
  { type: "venta", method: "efectivo", amount: 80 },
  { type: "venta", method: "efectivo", amount: 65 },
  { type: "venta", method: "yape", amount: 30 },
  { type: "venta", method: "yape", amount: 50 },
];
const CUENTA_BLAS = { ventas: 3, apertura: 100, ventasEfectivo: 145, ingresos: 0, egresos: 0, esperado: 245 };
const ABIERTA = "2026-06-11T12:41:00Z";
const HOY = new Date("2026-09-30T15:00:00Z");

beforeEach(() => {
  findFirst.mockReset();
  findMany.mockReset();
  groupBy.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("cuentaEfectivoCaja — la fórmula del arqueo, en un solo lugar", () => {
  it("apertura + ventas en efectivo: Yape y tarjeta no dejan billetes en el cajón", () => {
    expect(cuentaEfectivoCaja(100, MOVIMIENTOS)).toEqual({ apertura: 100, ventasEfectivo: 145, ingresos: 0, egresos: 0, esperado: 245 });
  });

  it("suma ingresos y resta egresos; ignora el movimiento de apertura, arqueo y cierre", () => {
    const c = cuentaEfectivoCaja(100, [
      ...MOVIMIENTOS,
      { type: "ingreso", method: "efectivo", amount: 20 },
      { type: "egreso", method: "efectivo", amount: 35.5 },
      { type: "arqueo", method: "efectivo", amount: 999 },
      { type: "cierre", method: "efectivo", amount: 999 },
    ]);
    expect(c).toMatchObject({ ingresos: 20, egresos: 35.5, esperado: 229.5 });
  });

  it("redondea al céntimo: 0,10 + 0,20 no deja 0,30000000000000004", () => {
    const c = cuentaEfectivoCaja(0, [
      { type: "venta", method: "efectivo", amount: 0.1 },
      { type: "venta", method: "efectivo", amount: 0.2 },
    ]);
    expect(c.esperado).toBe(0.3);
  });

  it("montos ya sumados por tipo y método (groupBy) dan lo mismo que sueltos", () => {
    const agrupados = [
      { type: "apertura", method: "efectivo", amount: 100 },
      { type: "venta", method: "efectivo", amount: 145 },
      { type: "venta", method: "yape", amount: 80 },
    ];
    expect(cuentaEfectivoCaja(100, agrupados)).toEqual(cuentaEfectivoCaja(100, MOVIMIENTOS));
  });
});

describe("contarVentas", () => {
  it("un pago mixto son dos líneas pero UNA venta; las líneas sin saleId cuentan una cada una", () => {
    expect(contarVentas([
      { saleId: "v1", movimientos: 1 },
      { saleId: "v2", movimientos: 2 },
      { saleId: "v3", movimientos: 1 },
    ])).toBe(3);
    expect(contarVentas([{ saleId: "v1", movimientos: 1 }, { saleId: null, movimientos: 2 }])).toBe(3);
  });
});

describe("avisoCajaAbierta con la cuenta de la caja", () => {
  it("el caso medido: 111 días · 3 ventas · S/ 245.00 esperados en efectivo", () => {
    const aviso = avisoCajaAbierta(ABIERTA, HOY, CUENTA_BLAS);
    expect(aviso).toMatchObject({
      dias: 111,
      titulo: "La caja está abierta hace 111 días",
      resumen: "3 ventas · S/ 245.00 esperados en efectivo",
      efectivoEsperado: 245,
    });
    expect(aviso?.detalle).toContain("Se abrió el jueves 11/06 con S/ 100.00");
    expect(aviso?.detalle).toContain("3 ventas, S/ 145.00 en efectivo");
    expect(aviso?.detalle).toContain("deberías tener S/ 245.00");
  });

  it("sin ventas dice «sin ventas» y el esperado es la apertura", () => {
    const aviso = avisoCajaAbierta(ABIERTA, HOY, { ventas: 0, apertura: 100, ventasEfectivo: 0, ingresos: 0, egresos: 0, esperado: 100 });
    expect(aviso?.resumen).toBe("sin ventas · S/ 100.00 esperados en efectivo");
  });

  it("una venta en singular y los egresos a la vista", () => {
    const aviso = avisoCajaAbierta(ABIERTA, HOY, { ventas: 1, apertura: 100, ventasEfectivo: 40, ingresos: 0, egresos: 25, esperado: 115 });
    expect(aviso?.resumen).toBe("1 venta · S/ 115.00 esperados en efectivo");
    expect(aviso?.detalle).toContain("egresos S/ 25.00");
  });

  it("un esperado negativo no se presenta como lo que hay que contar", () => {
    const aviso = avisoCajaAbierta(ABIERTA, HOY, { ventas: 0, apertura: 0, ventasEfectivo: 0, ingresos: 0, egresos: 30, esperado: -30 });
    expect(aviso?.resumen).toBe("sin ventas · el efectivo esperado da negativo");
    expect(aviso?.detalle).toContain("revisa los egresos");
    expect(aviso?.detalle).not.toContain("deberías tener");
  });

  it("sin cuenta (backend viejo) sigue diciendo la fecha", () => {
    const aviso = avisoCajaAbierta(ABIERTA, HOY);
    expect(aviso?.resumen).toBe("desde el jueves 11/06");
    expect(aviso?.efectivoEsperado).toBeNull();
  });
});

/** groupBy falso: por tipo+método o por saleId, como los arma la DB class. */
function groupByFalso(args: { by: string[] }) {
  if (args.by.includes("saleId")) {
    return Promise.resolve([
      { saleId: "v1", _count: { _all: 1 } },
      { saleId: "v2", _count: { _all: 2 } },
      { saleId: "v3", _count: { _all: 1 } },
    ]);
  }
  return Promise.resolve([
    { type: "apertura", method: "efectivo", _sum: { amount: 100 } },
    { type: "venta", method: "efectivo", _sum: { amount: 145 } },
    { type: "venta", method: "yape", _sum: { amount: 80 } },
  ]);
}

describe("CashRegistersDB — la cuenta sale del backend y respeta el tenant", () => {
  it("cuentaCajaAbierta: la caja más vieja del tenant, sumada en la base", async () => {
    findFirst.mockResolvedValue({ id: "caja-1", openedAt: new Date(ABIERTA), openingAmount: 100 });
    groupBy.mockImplementation(groupByFalso);

    const r = await CashRegistersDB.cuentaCajaAbierta("tenant-blas");

    expect(r).toEqual({ id: "caja-1", openedAt: new Date(ABIERTA).toISOString(), ventas: 3, cuenta: { apertura: 100, ventasEfectivo: 145, ingresos: 0, egresos: 0, esperado: 245 } });
    expect(findFirst.mock.calls[0][0]).toMatchObject({ where: { tenantId: "tenant-blas", status: "abierta", closedAt: null }, orderBy: { openedAt: "asc" } });
    // CashMovement no tiene tenantId: el aislamiento va por la relación, en el WHERE.
    for (const [args] of groupBy.mock.calls) {
      expect(args.where).toMatchObject({ cashRegisterId: "caja-1", cashRegister: { tenantId: "tenant-blas" } });
    }
  });

  it("otro tenant sin caja abierta no ve nada (ni suma movimientos)", async () => {
    findFirst.mockResolvedValue(null);
    expect(await CashRegistersDB.cuentaCajaAbierta("tenant-ajeno")).toBeNull();
    expect(groupBy).not.toHaveBeenCalled();
  });

  it("getAll le pone el esperado vivo a la caja ABIERTA y no toca las cerradas", async () => {
    findMany.mockResolvedValue([
      { id: "caja-1", openedAt: new Date(ABIERTA), closedAt: null, openingAmount: 100, closingAmount: null, expectedAmount: null, difference: null, status: "abierta", notes: null, movements: [] },
      { id: "caja-0", openedAt: new Date("2026-06-10T12:00:00Z"), closedAt: new Date("2026-06-10T23:00:00Z"), openingAmount: 50, closingAmount: 70, expectedAmount: 70, difference: 0, status: "cerrada", notes: null, movements: [] },
    ]);
    groupBy.mockImplementation(groupByFalso);

    const [abierta, cerrada] = await CashRegistersDB.getAll("tenant-blas");

    expect(abierta.efectivoEsperado).toBe(245);
    expect(abierta.expectedAmount).toBeUndefined();
    expect(cerrada.efectivoEsperado).toBeUndefined();
    expect(cerrada.expectedAmount).toBe(70);
    expect(groupBy).toHaveBeenCalledTimes(1);
  });

  it("AlertsDB manda la cuenta junto con la fecha", async () => {
    findFirst.mockResolvedValue({ id: "caja-1", openedAt: new Date(ABIERTA), openingAmount: 100 });
    groupBy.mockImplementation(groupByFalso);
    const s = await AlertsDB.getSummary("tenant-blas");
    expect(s.cajaAbiertaDesde).toBe(new Date(ABIERTA).toISOString());
    expect(s.cajaAbiertaCuenta).toEqual(CUENTA_BLAS);
  });
});

describe("AdminAlertsBanner con la cuenta de la caja", () => {
  it("la fila compacta dice cuántas ventas y cuánto efectivo esperar", async () => {
    const desde = new Date(Date.now() - 10 * 86_400_000).toISOString();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        solicitudesPendientes: 0, pedidosSinPartner: 0, partnersOnline: 0, recentExpiredOffers: 0, trialDaysLeft: null,
        cajaAbiertaDesde: desde, cajaAbiertaCuenta: CUENTA_BLAS,
      }),
    }));
    render(<AdminAlertsBanner userRole="admin" authReady={true} />);
    expect(await screen.findByText("La caja está abierta hace 10 días")).toBeTruthy();
    expect(screen.getByText("· 3 ventas · S/ 245.00 esperados en efectivo")).toBeTruthy();
    expect(screen.getByText("Cuadrar caja")).toBeTruthy();
  });
});
