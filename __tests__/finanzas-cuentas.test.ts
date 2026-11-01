/**
 * «Cuentas» (ADR-527): periodo de Lima, cada peso una vez, monedas y tope.
 * Lógica pura de `lib/finance/cuentas-del-periodo.ts`, sin base.
 */
import { describe, expect, it } from "vitest";
import {
  armarCuentas,
  diaDe,
  filaDeCaja,
  filaDeCobroDeFiado,
  filaDeGasto,
  filaDeLiquidacion,
  filaDePagoAProveedor,
  filaDePedido,
  porCobrarDe,
  rangoDelPeriodo,
  type FilaCruda,
  type MovCajaCrudo,
} from "@/lib/finance/cuentas-del-periodo";
import { TOPE_MOVIMIENTOS } from "@/lib/finance/cuentas-tipos";

const sinVentas = { monto: 0, n: 0 };
const fila = (p: Partial<FilaCruda> & Pick<FilaCruda, "id" | "grupo" | "monto">): FilaCruda => ({
  fuente: "gasto", tipo: "Gasto", fecha: "2026-11-01T15:00:00.000Z", clase: "instante",
  persona: "", detalle: "", moneda: "PEN", ...p,
});
const caja = (p: Partial<MovCajaCrudo> & Pick<MovCajaCrudo, "id" | "type">): MovCajaCrudo => ({
  amount: 10, description: "", saleId: null, createdAt: "2026-11-01T15:00:00.000Z", ...p,
});

describe("rangoDelPeriodo", () => {
  it("semana: desde el lunes de Lima, aunque en UTC ya sea lunes", () => {
    // 02-11 03:00 UTC = domingo 01-11 22:00 en Lima: sigue la semana del 26-10.
    const r = rangoDelPeriodo("semana", new Date("2026-11-02T03:00:00.000Z"));
    expect(r).toMatchObject({ desde: "2026-10-26", hasta: "2026-11-01" });
    expect(r.inicio?.toISOString()).toBe("2026-10-26T05:00:00.000Z");
    expect(r.fin.toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(rangoDelPeriodo("semana", new Date("2026-11-02T05:00:00.000Z")).desde).toBe("2026-11-02");
  });

  it("mes: desde el 1 de Lima con el corte de las 05:00 UTC", () => {
    const antes = rangoDelPeriodo("mes", new Date("2026-11-01T04:59:59.999Z"));
    expect(antes).toMatchObject({ desde: "2026-10-01", hasta: "2026-10-31" });
    expect(antes.inicio?.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    const despues = rangoDelPeriodo("mes", new Date("2026-11-01T05:00:00.000Z"));
    expect(despues).toMatchObject({ desde: "2026-11-01", hasta: "2026-11-01" });
  });

  it("todo: sin desde", () => {
    expect(rangoDelPeriodo("todo", new Date("2026-11-01T15:00:00.000Z"))).toMatchObject({ desde: null, inicio: null, hasta: "2026-11-01" });
  });
});

describe("fecha y hora", () => {
  it("un día guardado sin hora es ese día, sin hora, al mediodía de Lima", () => {
    expect(diaDe(new Date("2026-11-01T00:00:00.000Z"), "fecha")).toEqual({ dia: "2026-11-01", cuando: "2026-11-01T17:00:00.000Z", conHora: false });
    expect(diaDe(new Date("2026-09-19T17:00:00.000Z"), "fecha")?.conHora).toBe(false); // alta de adelantos
    expect(diaDe(new Date("2026-08-02T21:14:30.424Z"), "fecha")).toMatchObject({ dia: "2026-08-02", conHora: true });
    // Un instante a medianoche UTC son las 19:00 del día anterior en Lima.
    expect(diaDe(new Date("2026-11-01T00:00:00.000Z"), "instante")).toMatchObject({ dia: "2026-10-31", conHora: true });
  });

  it("el gasto del 01-11 (00:00 UTC) cuenta en noviembre; la caja de las 21:00 del 31-10 no", () => {
    const r = rangoDelPeriodo("mes", new Date("2026-11-01T15:00:00.000Z"));
    const c = armarCuentas(r, {
      filas: [
        fila({ id: "g1", grupo: "gastos", monto: 20, fecha: new Date("2026-11-01T00:00:00.000Z"), clase: "fecha" }),
        fila({ id: "c1", fuente: "caja", grupo: "gastos", monto: 7, fecha: new Date("2026-11-01T02:00:00.000Z") }),
      ],
      ventasDelPeriodo: sinVentas, abiertos: [],
    });
    expect(c.totales.gastos).toEqual({ monto: 20, n: 1 });
    expect(c.movimientos.map((m) => m.id)).toEqual(["gasto:g1"]);
    expect(c.movimientos[0].conHora).toBe(false);
  });
});

describe("cada peso una vez (la caja)", () => {
  const vivos = { gastosVivos: new Set(["exp1"]), adelantosAnulados: new Set(["ADL-2026-0038"]) };
  it("la venta con saleId, el retiro de un gasto vivo y las caras del adelanto no se suman", () => {
    expect(filaDeCaja(caja({ id: "v", type: "venta", saleId: "s1" }), vivos)).toBeNull();
    expect(filaDeCaja(caja({ id: "gasto-caja-exp1", type: "egreso", description: "Gasto · poda" }), vivos)).toBeNull();
    expect(filaDeCaja(caja({ id: "a", type: "egreso", description: "Adelanto ADL-2026-0001 · MAMA DE ALEX" }), vivos)).toBeNull();
    expect(filaDeCaja(caja({ id: "b", type: "ingreso", description: "Anulación de adelanto ADL-2026-0005 · Juan (devolución)" }), vivos)).toBeNull();
    expect(filaDeCaja(caja({ id: "r", type: "ingreso", description: "Adelanto recibido ADL-2026-0009 · Pepe" }), vivos)).toBeNull();
    for (const type of ["apertura", "arqueo", "cierre"]) expect(filaDeCaja(caja({ id: type, type }), vivos)).toBeNull();
  });

  it("la plata que vuelve de un adelanto es ingreso, con la persona", () => {
    const f = filaDeCaja(caja({ id: "l", type: "ingreso", amount: 1200, description: "Liquidación de adelanto ADL-2026-0001 · MAMA DE ALEX" }), vivos);
    expect(f).toMatchObject({ grupo: "ingresos", tipo: "Te devolvieron un adelanto", persona: "MAMA DE ALEX", monto: 1200 });
  });

  it("adelanto anulado: su devolución parcial tampoco suma (salieron 400, volvieron 100 + 300 → 0)", () => {
    const movs = [
      caja({ id: "1", type: "egreso", amount: 400, description: "Adelanto ADL-2026-0038 · Wasaco" }),
      caja({ id: "2", type: "ingreso", amount: 100, description: "Liquidación de adelanto ADL-2026-0038 · Wasaco" }),
      caja({ id: "3", type: "ingreso", amount: 300, description: "Anulación de adelanto ADL-2026-0038 · Wasaco (devolución)" }),
    ];
    expect(movs.map((m) => filaDeCaja(m, vivos))).toEqual([null, null, null]);
  });

  it("gasto borrado: su retiro y su devolución quedan y se anulan", () => {
    const r = rangoDelPeriodo("todo", new Date("2026-11-01T15:00:00.000Z"));
    const filas = [
      caja({ id: "gasto-caja-exp9", type: "egreso", amount: 15, description: "Gasto · cinta" }),
      caja({ id: "gasto-caja-exp9-devuelto", type: "ingreso", amount: 15, description: "Gasto borrado · cinta (vuelve a la caja)" }),
      caja({ id: "venta-suelta", type: "venta", amount: 5 }),
      caja({ id: "manual", type: "egreso", amount: 3, description: "Compra de insumos — clavos" }),
    ].map((m) => filaDeCaja(m, vivos)).filter((f): f is FilaCruda => f !== null);
    const c = armarCuentas(r, { filas, ventasDelPeriodo: sinVentas, abiertos: [] });
    expect(c.totales).toEqual({ adelantos: { monto: 0, n: 0 }, gastos: { monto: 18, n: 2 }, ingresos: { monto: 20, n: 2 } });
    expect(c.queda).toBe(2);
  });

  it("las ventas suman por su agregado, no fila a fila (no se cuentan dos veces)", () => {
    const r = rangoDelPeriodo("todo", new Date("2026-11-01T15:00:00.000Z"));
    const c = armarCuentas(r, {
      filas: [fila({ id: "s1", fuente: "venta", tipo: "Venta", grupo: "ingresos", monto: 50 })],
      ventasDelPeriodo: { monto: 1070, n: 6 }, abiertos: [],
    });
    expect(c.totales.ingresos).toEqual({ monto: 1070, n: 6 });
    expect(c.movimientos).toHaveLength(1);
  });
});

describe("totales", () => {
  const r = rangoDelPeriodo("todo", new Date("2026-11-01T15:00:00.000Z"));

  it("otras monedas se listan y no suman", () => {
    const c = armarCuentas(r, {
      filas: [
        fila({ id: "a1", fuente: "adelanto", grupo: "adelantos", monto: 100, moneda: "USD" }),
        fila({ id: "a2", fuente: "adelanto", grupo: "adelantos", monto: 0.1 }),
        fila({ id: "a3", fuente: "adelanto", grupo: "adelantos", monto: 0.2 }),
      ],
      ventasDelPeriodo: sinVentas, abiertos: [],
    });
    expect(c.totales.adelantos).toEqual({ monto: 0.3, n: 2 });
    expect(c.otrasMonedas).toBe(1);
    expect(c.movimientos).toHaveLength(3);
  });

  it(`tope de ${TOPE_MOVIMIENTOS}: la lista se corta, los totales no; lo más nuevo primero`, () => {
    const filas = Array.from({ length: 600 }, (_, i) =>
      fila({ id: `g${String(i).padStart(3, "0")}`, grupo: "gastos", monto: 1, fecha: new Date(Date.UTC(2026, 9, 1, 12, i)) }),
    );
    const c = armarCuentas(r, { filas, ventasDelPeriodo: sinVentas, abiertos: [] });
    expect(c.movimientos).toHaveLength(TOPE_MOVIMIENTOS);
    expect(c.truncado).toBe(true);
    expect(c.totales.gastos).toEqual({ monto: 600, n: 600 });
    expect(c.movimientos[0].id).toBe("gasto:g599");
  });

  it("queda puede ser negativo: entro − (adelantos + gastos)", () => {
    const c = armarCuentas(r, {
      filas: [
        fila({ id: "i", fuente: "caja", grupo: "ingresos", monto: 1200 }),
        fila({ id: "a", fuente: "adelanto", grupo: "adelantos", monto: 3642 }),
        fila({ id: "g", grupo: "gastos", monto: 20 }),
      ],
      ventasDelPeriodo: sinVentas, abiertos: [],
    });
    expect([c.entro, c.salio, c.queda]).toEqual([1200, 3662, -2462]);
  });
});

describe("por cobrar", () => {
  it("agrupa por persona, solo soles con saldo, de mayor a menor", () => {
    const p = porCobrarDe([
      { beneficiarioId: "w", persona: "Wasaco", saldo: 3217, moneda: "PEN" },
      { beneficiarioId: "w", persona: "Wasaco", saldo: 1731, moneda: "PEN" },
      { beneficiarioId: "w", persona: "Wasaco", saldo: 1300, moneda: "PEN" },
      { beneficiarioId: "v", persona: "Quispe Galindo Victor", saldo: 17000, moneda: "PEN" },
      { beneficiarioId: "m", persona: "MAMA DE ALEX", saldo: 2442, moneda: "PEN" },
      { beneficiarioId: "u", persona: "Gringo", saldo: 50, moneda: "USD" },
    ]);
    expect(p.total).toBe(25690);
    expect(p.deudores).toEqual([
      { persona: "Quispe Galindo Victor", saldo: 17000, adelantos: 1 },
      { persona: "Wasaco", saldo: 6248, adelantos: 3 },
      { persona: "MAMA DE ALEX", saldo: 2442, adelantos: 1 },
    ]);
  });
});

describe("plata que entró y salió de verdad (revisión 01-11)", () => {
  const r = rangoDelPeriodo("todo", new Date("2026-11-01T15:00:00.000Z"));
  const ctx = { gastosVivos: new Set(["exp-rrhh"]), adelantosAnulados: new Set<string>() };
  const pedido = (status: string, deuda: boolean | null) => ({
    id: `p-${status}-${deuda}`, total: 50, status, deuda, deliveredAt: "2026-10-20T15:00:00.000Z",
    createdAt: "2026-10-18T15:00:00.000Z", customerName: "Rosa", paymentMethod: "yape",
  });

  it("pedido: solo el entregado y no a cuenta, en el día de la entrega", () => {
    expect(filaDePedido(pedido("entregado", true))).toBeNull();
    expect(filaDePedido(pedido("confirmado", null))).toBeNull();
    expect(filaDePedido(pedido("en_camino", false))).toBeNull();
    const ok = filaDePedido(pedido("entregado", null));
    expect(ok).toMatchObject({ grupo: "ingresos", monto: 50, fecha: "2026-10-20T15:00:00.000Z" });
    expect(filaDePedido(pedido("entregado", false))).not.toBeNull();
  });

  it("pago de la semana: gasto bruto 300 + retiro neto 200 + adelanto 100 → salió 300", () => {
    const gasto = filaDeGasto({
      id: "exp-rrhh", amount: 300, date: "2026-10-31T15:00:00.000Z", paidAt: "2026-10-31T15:00:00.000Z",
      gtfNumber: null, persona: "Juan", detalle: "Pago de la semana · Juan", descontado: 100,
    });
    const retiro = filaDeCaja(caja({ id: "gasto-caja-exp-rrhh", type: "egreso", amount: 200, description: "Gasto · Pago de la semana · Juan" }), ctx);
    expect(retiro).toBeNull();
    const adelanto = fila({ id: "a1", fuente: "adelanto", grupo: "adelantos", monto: 100, fecha: "2026-10-25T17:00:00.000Z", clase: "fecha" });
    const c = armarCuentas(r, { filas: [gasto!, adelanto], ventasDelPeriodo: sinVentas, abiertos: [] });
    expect(c.totales.gastos.monto).toBe(200);
    expect(c.salio).toBe(300);
    expect(gasto?.detalle).toContain("100 descontado de adelantos");
  });

  it("gasto de guía sin pagar no salió; pagado cuenta el día del pago", () => {
    const base = { id: "g", amount: 80, date: "2026-10-01T00:00:00.000Z", gtfNumber: "001-123", persona: "", detalle: "", descontado: 0 };
    expect(filaDeGasto({ ...base, paidAt: null })).toBeNull();
    expect(filaDeGasto({ ...base, paidAt: "2026-10-09T15:00:00.000Z" })?.fecha).toBe("2026-10-09T15:00:00.000Z");
  });

  it("cobro de fiado: entra una vez, con o sin caja abierta", () => {
    const cuota = filaDeCobroDeFiado({ id: "c1", monto: 35, pagadoEn: "2026-10-30T15:00:00.000Z", cliente: "Rosa Pérez", notas: null });
    const suCaja = filaDeCaja(caja({ id: "m1", type: "ingreso", amount: 35, description: "Cobro de fiado · Rosa Pérez" }), ctx);
    expect(suCaja).toBeNull();
    const conCaja = armarCuentas(r, { filas: [cuota], ventasDelPeriodo: sinVentas, abiertos: [] });
    expect(conCaja.entro).toBe(35);
    expect(conCaja.movimientos).toHaveLength(1);
  });

  it("pago a proveedor: por transferencia (sin caja) y en efectivo (con su retiro), cada uno una vez", () => {
    const transf = filaDePagoAProveedor({ id: "PAY-1", amount: 500, date: "2026-10-15T00:00:00.000Z", proveedor: "Maderera", detalle: "Factura 12", method: "transferencia", reference: "OP 99" });
    const efectivo = filaDePagoAProveedor({ id: "PAY-2", amount: 120, date: "2026-10-16T00:00:00.000Z", proveedor: "Maderera", detalle: "", method: "efectivo", reference: null });
    const retiro = filaDeCaja(caja({ id: "m2", type: "egreso", amount: 120, description: "Pago a proveedor · Maderera" }), ctx);
    expect(retiro).toBeNull();
    const c = armarCuentas(r, { filas: [transf, efectivo], ventasDelPeriodo: sinVentas, abiertos: [] });
    expect(c.totales.gastos).toEqual({ monto: 620, n: 2 });
  });

  it("la persona de una anotación a mano sale de «Motivo — detalle»", () => {
    const f = filaDeCaja(caja({ id: "m3", type: "ingreso", description: "Liquidación de adelanto ADL-2026-0001 — Victor" }), ctx);
    expect(f?.persona).toBe("Victor");
  });

  it("liquidación: el pago de la cabecera una vez, pase o no por la caja; la de caja no suma", () => {
    const pagada = filaDeLiquidacion({ id: "l1", codigo: "LIQ-2026-0002", fecha: "2026-09-26T00:00:00.000Z", pagoDireccion: "hecho", pagoMonto: 2986.4, persona: "Wasaco" });
    expect(pagada).toMatchObject({ grupo: "gastos", tipo: "Liquidación pagada", monto: 2986.4 });
    expect(filaDeLiquidacion({ id: "l2", codigo: "LIQ-2026-0005", fecha: "2026-10-25T00:00:00.000Z", pagoDireccion: null, pagoMonto: null, persona: "" })).toBeNull();
    expect(filaDeCaja(caja({ id: "m4", type: "ingreso", amount: 70, description: "Liquidación LIQ-2026-0004 · Wasaco" }), ctx)).toBeNull();
    expect(filaDeCaja(caja({ id: "m5", type: "egreso", amount: 70, description: "Anulación de liquidación LIQ-2026-0004 · Wasaco" }), ctx)).toBeNull();
    // La devolución de un adelanto NO es una liquidación de cuenta: sigue sumando.
    expect(filaDeCaja(caja({ id: "m6", type: "ingreso", amount: 40, description: "Liquidación de adelanto ADL-2026-0028 · Wasaco" }), ctx)).not.toBeNull();
  });
});
