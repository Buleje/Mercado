/**
 * `PagosSemanaDB.pagar` con una transacción falsa: dos clics no descuentan dos
 * veces, un neto que cambió no paga, el descuento lleva la clave del gasto y
 * todo va con el negocio del que paga.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conceptoDelPeriodo } from "@/lib/adelantos/planilla-lote";
import { periodoDelDescuento } from "@/lib/rrhh/descuentos-planilla";

const m = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    expense: { findFirst: vi.fn(), create: vi.fn() },
  };
  return {
    tx,
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    obtener: vi.fn(),
    periodo: vi.fn(),
    abiertos: vi.fn(),
    descuentos: vi.fn(),
    registrar: vi.fn(),
    anotarCaja: vi.fn(),
    logActivity: vi.fn(() => Promise.resolve()),
    // Para `semana` (la tira): fuera de la transacción.
    gastos: vi.fn(),
    listar: vi.fn(),
    planillaDePersonas: vi.fn(),
    clavesDePago: vi.fn(),
    descontadoPorPrefijo: vi.fn(),
    retiros: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: m.$transaction, expense: { findMany: m.gastos } } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: m.logActivity }));
vi.mock("@/lib/caja/invalidar-ventas-overview", () => ({ invalidarVentasOverview: vi.fn() }));
vi.mock("@/lib/db/adelantos.db", () => ({
  DescuentoDePlanillaError: class DescuentoDePlanillaError extends Error {},
  AdelantosDB: {
    abiertosDePlanillaEnTx: m.abiertos,
    descuentosDePlanillaEnTx: m.descuentos,
    registrarEntregaEnTx: m.registrar,
    invalidarResultado: vi.fn(),
    planillaDePersonas: m.planillaDePersonas,
    clavesDePagoDelConcepto: m.clavesDePago,
    descontadoPorPrefijo: m.descontadoPorPrefijo,
  },
}));
vi.mock("@/lib/db/cash-registers-movements.db", () => ({ CashRegistersMovementsDB: {} }));
vi.mock("@/lib/db/gasto-con-caja.db", () => ({
  anotarEnCajaAbiertaEnTx: m.anotarCaja,
  revalidarTrasEgreso: vi.fn(),
  GastoConCajaDB: { retirosDeGastos: m.retiros },
}));
vi.mock("@/lib/db/notification-center.db", () => ({ NotificationCenterDB: { sincronizarAvisos: vi.fn() } }));
vi.mock("@/lib/db/rrhh-ganado.db", () => ({ GanadoDB: { periodo: m.periodo } }));
vi.mock("@/lib/db/rrhh-colaboradores.db", () => ({ ColaboradoresDB: { obtener: m.obtener, listar: m.listar } }));

const { PagosSemanaDB, PagoSemanaError } = await import("@/lib/db/rrhh-pagos.db");

const LUNES = "2026-10-19";
const CONCEPTO = conceptoDelPeriodo(periodoDelDescuento(LUNES, "2026-10-25"));

const base = { colaboradorId: "c1", desde: LUNES, metodo: "efectivo" as const, saleDeCaja: false };

function adelantoAbierto(id: string, saldo: number) {
  return {
    id,
    codigoOperacion: `ADL-${id}`,
    modalidad: "DESCUENTO_PLANILLA",
    status: "ABIERTO",
    saldoPendiente: saldo,
    moneda: "PEN",
    direccion: "DADO",
    fechaAdelanto: "2026-10-20T15:00:00.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Un miércoles: el aviso del sábado no se refresca solo durante el test.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T17:00:00Z"));
  m.obtener.mockResolvedValue({ id: "c1", nombre: "Juan Pérez", estado: "ACTIVO", fechaIngreso: null, fechaCese: null });
  m.periodo.mockResolvedValue({ personas: [{ colaboradorId: "c1", referencia: { modalidad: "SEMANA", monto: 420 }, total: 420 }] });
  m.tx.$queryRaw.mockResolvedValue([{ id: "c1", beneficiarioId: "b1" }]);
  m.tx.expense.findFirst.mockResolvedValue(null);
  m.tx.expense.create.mockResolvedValue({ id: "g1" });
  m.abiertos.mockResolvedValue([adelantoAbierto("a1", 50)]);
  m.descuentos.mockResolvedValue([]);
  m.registrar.mockResolvedValue({ id: "e1" });
  m.anotarCaja.mockResolvedValue({ sinCaja: false });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PagosSemanaDB.pagar", () => {
  it("paga: gasto con la marca de la semana, descuento con la clave del gasto, neto = ganado − adelanto", async () => {
    const r = await PagosSemanaDB.pagar("t1", { ...base, netoEsperado: 370 }, "dueno");
    expect(r?.gastoId).toBe("g1");
    expect(r?.calculo?.neto).toBe(370);
    const gasto = m.tx.expense.create.mock.calls[0][0].data;
    expect(gasto).toMatchObject({ tenantId: "t1", category: "personal", amount: 420, documentType: "recibo", documentNumber: `RRHH-${LUNES}-c1` });
    expect(m.registrar).toHaveBeenCalledTimes(1);
    expect(m.registrar).toHaveBeenCalledWith(m.tx, "t1", "a1", {
      tipo: "LIBRE",
      valorManual: 50,
      descripcion: CONCEPTO,
      idempotencyKey: "rrhh-pago:g1:a1",
    });
    expect(m.anotarCaja).not.toHaveBeenCalled();
    expect(m.logActivity).toHaveBeenCalledTimes(1);
  });

  it("el segundo clic ve la marca bajo el lock del colaborador: repetido, sin gasto ni descuento nuevo", async () => {
    m.tx.expense.findFirst.mockResolvedValue({ id: "g-viejo", amount: 420 });
    const r = await PagosSemanaDB.pagar("t1", { ...base, netoEsperado: 370 }, "dueno");
    expect(r).toEqual({ repetido: true, gastoId: "g-viejo", calculo: null, caja: null });
    expect(m.tx.expense.create).not.toHaveBeenCalled();
    expect(m.registrar).not.toHaveBeenCalled();
    expect(m.abiertos).not.toHaveBeenCalled();
  });

  it("si el neto cambió (otro adelanto entró), 409 con los números nuevos y no paga", async () => {
    m.abiertos.mockResolvedValue([adelantoAbierto("a1", 50), adelantoAbierto("a2", 30)]);
    const err = await PagosSemanaDB.pagar("t1", { ...base, netoEsperado: 370 }, "dueno").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PagoSemanaError);
    expect(err).toMatchObject({ status: 409, code: "neto_cambio" });
    expect((err as InstanceType<typeof PagoSemanaError>).extra.calculo).toMatchObject({ neto: 340, aDescontar: 80 });
    expect(m.tx.expense.create).not.toHaveBeenCalled();
    expect(m.registrar).not.toHaveBeenCalled();
  });

  it("si el saldo del adelanto ya no alcanza bajo su lock (otro descuento entró), 409 y no paga", async () => {
    const { DescuentoDePlanillaError } = await import("@/lib/db/adelantos.db");
    m.registrar.mockRejectedValue(new DescuentoDePlanillaError("Debe S/ 20.00", 400, "descuento_excede_saldo"));
    await expect(PagosSemanaDB.pagar("t1", { ...base, netoEsperado: 370 }, "dueno")).rejects.toMatchObject({ status: 409, code: "adelanto_cambio" });
    expect(m.anotarCaja).not.toHaveBeenCalled();
  });

  it("lo descontado a mano para esta semana ya cuenta: no se descuenta dos veces", async () => {
    m.descuentos.mockResolvedValue([{ descripcion: CONCEPTO, fecha: new Date("2026-10-22T15:00:00Z"), valor: 400, idempotencyKey: null }]);
    m.abiertos.mockResolvedValue([adelantoAbierto("a1", 100)]);
    const r = await PagosSemanaDB.pagar("t1", { ...base, netoEsperado: 0 }, "dueno");
    // Tope del descuento: 420 − 400 = 20; el resto del adelanto queda abierto.
    expect(r?.calculo).toMatchObject({ descontadoPrevio: 400, aDescontar: 20, neto: 0, sigueDebiendo: 80 });
    expect(m.registrar.mock.calls[0][3].valorManual).toBe(20);
  });

  it("un pago cuyo gasto se borró a mano en Mi Plata bloquea pagar de nuevo (409 pago_sin_gasto)", async () => {
    m.descuentos.mockResolvedValue([
      { descripcion: CONCEPTO, fecha: new Date("2026-10-24T15:00:00Z"), valor: 50, idempotencyKey: "rrhh-pago:g-borrado:a1" },
    ]);
    const err = await PagosSemanaDB.pagar("t1", { ...base, netoEsperado: 370 }, "dueno").catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 409, code: "pago_sin_gasto", extra: { gastoId: "g-borrado" } });
    expect(m.tx.expense.create).not.toHaveBeenCalled();
  });

  it("todo con el negocio de quien paga: lock, marca y lectores reciben su tenantId", async () => {
    await PagosSemanaDB.pagar("t1", { ...base, netoEsperado: 370 }, "dueno");
    const [, ...valores] = m.tx.$queryRaw.mock.calls[0];
    expect(valores).toEqual(["c1", "t1"]);
    // La marca sin mayúsculas ni tipo «recibo»: si Mi Plata le reescribió el papel, igual se reconoce (no se paga dos veces).
    expect(m.tx.expense.findFirst.mock.calls[0][0].where).toEqual({ tenantId: "t1", documentNumber: { equals: `RRHH-${LUNES}-c1`, mode: "insensitive" } });
    expect(m.obtener).toHaveBeenCalledWith("t1", "c1");
    expect(m.periodo.mock.calls[0][0]).toBe("t1");
    expect(m.abiertos).toHaveBeenCalledWith(m.tx, "t1", "b1");
  });

  it("de otro negocio (no existe en el mío) → null, sin transacción", async () => {
    m.obtener.mockResolvedValue(null);
    expect(await PagosSemanaDB.pagar("t1", { ...base, netoEsperado: 370 }, "dueno")).toBeNull();
    expect(m.$transaction).not.toHaveBeenCalled();
  });

  it("de la caja sólo en efectivo; con caja, el retiro es el neto y va último", async () => {
    await expect(PagosSemanaDB.pagar("t1", { ...base, metodo: "yape", saleDeCaja: true, netoEsperado: 370 }, "dueno")).rejects.toMatchObject({
      status: 400,
      code: "solo_efectivo",
    });
    const r = await PagosSemanaDB.pagar("t1", { ...base, saleDeCaja: true, netoEsperado: 370 }, "dueno");
    expect(m.anotarCaja).toHaveBeenCalledWith(m.tx, "t1", expect.objectContaining({ monto: 370, id: "gasto-caja-g1" }));
    expect(m.anotarCaja.mock.invocationCallOrder[0]).toBeGreaterThan(m.registrar.mock.invocationCallOrder[0]);
    expect(r?.caja).toEqual({ sinCaja: false });
  });

  it("sin tarifa hace falta el monto escrito; con él, ése es la base", async () => {
    m.periodo.mockResolvedValue({ personas: [{ colaboradorId: "c1", referencia: null, total: 0 }] });
    await expect(PagosSemanaDB.pagar("t1", { ...base, netoEsperado: 0 }, "dueno")).rejects.toMatchObject({ status: 422, code: "falta_monto" });
    const r = await PagosSemanaDB.pagar("t1", { ...base, montoManual: 300, netoEsperado: 250 }, "dueno");
    expect(r?.calculo).toMatchObject({ tipo: "falta_definir", base: 300, neto: 250 });
  });

  it("una semana que no empieza en lunes o que todavía no llegó no se paga", async () => {
    await expect(PagosSemanaDB.pagar("t1", { ...base, desde: "2026-10-20", netoEsperado: 0 }, "dueno")).rejects.toMatchObject({ code: "semana_invalida" });
    await expect(PagosSemanaDB.pagar("t1", { ...base, desde: "2026-10-26", netoEsperado: 0 }, "dueno")).rejects.toMatchObject({ code: "semana_futura" });
  });
});

describe("PagosSemanaDB.semana: lo ganado cambió después de pagar (revisión 24-10)", () => {
  const persona = (total: number, referencia: { modalidad: string; monto: number } | null) => ({
    colaboradorId: "c1", nombre: "Juan Pérez", puesto: null, beneficiarioId: "b1", referencia, total,
    sinMarcar: [], avisos: [], adelantos: { abiertosPen: 0, abiertos: 0, descontadoPen: 50 },
  });

  beforeEach(() => {
    m.listar.mockResolvedValue([{ id: "c1", nombre: "Juan Pérez", estado: "ACTIVO", eventual: false, fechaIngreso: null, fechaCese: null }]);
    // Pagado con 420 (50 de adelanto descontado, 370 de la caja).
    m.gastos.mockResolvedValue([
      { id: "g1", amount: 420, documentNumber: `RRHH-${LUNES}-c1`, paymentMethod: "efectivo", paidAt: new Date("2026-10-24T14:00:00Z"), date: new Date("2026-10-24T14:00:00Z"), createdBy: "dueno" },
    ]);
    m.planillaDePersonas.mockResolvedValue([]);
    m.clavesDePago.mockResolvedValue([]);
    m.descontadoPorPrefijo.mockResolvedValue(new Map([["rrhh-pago:g1:", 50]]));
    m.retiros.mockResolvedValue({ g1: { monto: 370, abierta: true, dia: "2026-10-24" } });
  });

  it("marcó el sábado después de pagar (ahora 470): el pago avisa +50", async () => {
    m.periodo.mockResolvedValue({ personas: [persona(470, { modalidad: "SEMANA", monto: 470 })] });
    const s = await PagosSemanaDB.semana("t1", LUNES);
    expect(s.filas[0].pagado).toMatchObject({ gastoId: "g1", base: 420, neto: 370, diferencia: 50 });
  });

  it("si lo ganado sigue igual, no hay aviso", async () => {
    m.periodo.mockResolvedValue({ personas: [persona(420, { modalidad: "SEMANA", monto: 420 })] });
    const s = await PagosSemanaDB.semana("t1", LUNES);
    expect(s.filas[0].pagado?.diferencia).toBeNull();
  });

  it("la marca reescrita en MAYÚSCULAS sigue contando como pagada (segunda revisión 24-10)", async () => {
    m.gastos.mockResolvedValue([
      { id: "g1", amount: 420, documentNumber: `RRHH-${LUNES}-C1`, paymentMethod: "efectivo", paidAt: new Date("2026-10-24T14:00:00Z"), date: new Date("2026-10-24T14:00:00Z"), createdBy: "dueno" },
    ]);
    m.periodo.mockResolvedValue({ personas: [persona(420, { modalidad: "SEMANA", monto: 420 })] });
    const s = await PagosSemanaDB.semana("t1", LUNES);
    expect(s.filas[0].pagado).toMatchObject({ gastoId: "g1", base: 420 });
    expect(m.gastos.mock.calls[0][0].where).toEqual({ tenantId: "t1", documentNumber: { in: [`RRHH-${LUNES}-c1`], mode: "insensitive" } });
  });

  it("sin tarifa (monto escrito al pagar) no se compara con lo ganado", async () => {
    m.periodo.mockResolvedValue({ personas: [persona(0, null)] });
    const s = await PagosSemanaDB.semana("t1", LUNES);
    expect(s.filas[0].pagado?.diferencia).toBeNull();
  });
});
