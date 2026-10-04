/**
 * ADR-448 — `AdelantosDB` con las dos direcciones, sin base.
 *
 * Lo que se prueba es lo que mueve plata o la cuenta: el tope (recibir no lo
 * valida), el sentido de la caja al crear / devolver / anular, la valuación de
 * un producto que el negocio entrega, la corrección de la dirección (sin
 * entregas, dentro del lock, sin tocar la caja) y que toda lectura sin pedir
 * nada devuelva sólo lo DADO.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    adelanto: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn(),
      /* El alta con caja va en una transacción: el mismo espía que el de afuera. */
      create: (...a: unknown[]) => prisma.adelanto.create(...a),
    },
    adelantoEntrega: { create: vi.fn(), aggregate: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
    cashMovement: { findMany: vi.fn() },
    activityLog: { create: vi.fn() },
    product: { findFirst: vi.fn(), updateMany: vi.fn() },
    adelantoEntregaPactada: { updateMany: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    adelantoBeneficiario: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
    adelanto: { aggregate: vi.fn(), create: vi.fn(), findMany: vi.fn(), groupBy: vi.fn(), findFirst: vi.fn() },
  };
  return { tx, prisma, moverCaja: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/db/contrato-propio.db", () => ({ contratoPropio: async () => null, contratoVigente: async () => null }));
vi.mock("@/lib/db/forest-directorio.db", () => ({ ForestDirectorioDB: { getParte: vi.fn() } }));
vi.mock("@/lib/adelantos/movimiento-caja", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/adelantos/movimiento-caja")>();
  return {
    ...real,
    moverCaja: (...a: unknown[]) => H.moverCaja(...a),
    moverCajaEnTx: (_tx: unknown, ...a: unknown[]) => H.moverCaja(...a),
  };
});

import { AdelantosDB, DireccionNoCorregibleError, IdempotenciaDistintaError, ReglaDeRecibidoError } from "@/lib/db/adelantos.db";
import { AdelantoScalarFieldEnum } from "@/lib/generated/prisma/internal/prismaNamespaceBrowser";
import { huellaDeEntrega } from "@/lib/adelantos/idempotencia";

const ahora = new Date("2026-09-29T15:00:00.000Z");
const beneficiario = { id: "b1", nombre: "Wasaco", documento: null, telefono: null, notas: null, createdAt: ahora };

/** Una fila completa de `Adelanto` con INCLUDE_FULL: TODAS las columnas escalares. */
const fila = (p: Record<string, unknown> = {}) => ({
  id: "a1",
  tenantId: "t1",
  codigoOperacion: "ADL-2026-0003",
  reciboManual: null,
  beneficiarioId: "b1",
  modalidad: "CUENTA_CORRIENTE",
  montoAdelantado: 1731,
  moneda: "PEN",
  fechaAdelanto: ahora,
  fechaVencimiento: null,
  status: "ABIERTO",
  saldoPendiente: 1731,
  notas: null,
  comprobanteUrl: null,
  piesTablares: null,
  piesTablaresTipo: null,
  direccion: "RECIBIDO",
  conceptoRecibido: "SERVICIO",
  createdAt: ahora,
  updatedAt: ahora,
  contratoId: null,
  beneficiario,
  entregas: [],
  entregasPactadas: [],
  ...p,
});

beforeEach(() => {
  vi.clearAllMocks();
  /* `mockClear` no vacía la cola de `…Once`: lo que un test no consumió se
     colaba al siguiente. Estos espías se vacían del todo. */
  for (const m of [
    H.tx.adelanto.findFirst,
    H.tx.adelanto.aggregate,
    H.tx.adelantoEntrega.findFirst,
    H.tx.adelantoEntrega.create,
    H.tx.adelantoEntrega.aggregate,
    H.tx.adelantoEntrega.count,
    H.tx.cashMovement.findMany,
    H.tx.product.findFirst,
    H.prisma.adelanto.findFirst,
  ]) m.mockReset();
  H.moverCaja.mockResolvedValue({ sinCaja: false, movimientoId: "mov-1" });
  H.prisma.adelantoBeneficiario.findFirst.mockResolvedValue({ nombre: "Wasaco", limiteCredito: 1000 });
  H.prisma.adelanto.findMany.mockResolvedValue([]);
  H.prisma.adelanto.aggregate.mockResolvedValue({ _sum: { saldoPendiente: 900 } });
  H.prisma.adelanto.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    fila({ ...data, fechaAdelanto: ahora, fechaVencimiento: null, entregasPactadas: [], entregas: [] }),
  );
  H.tx.$queryRaw.mockResolvedValue([{ id: "a1" }]);
  H.tx.cashMovement.findMany.mockResolvedValue([]);
  H.tx.activityLog.create.mockResolvedValue({ id: "log-1" });
});

/** Admin o dueño, como lo resuelve la ruta con `soloAdminODueno`. */
const ADMIN = { puedeSacarPlataDeRecibido: true };

// ── 3. El tope ───────────────────────────────────────────────────────────────

describe("create — el tope es de lo que se DA", () => {
  it("con tope 1 000 y deuda 900, recibir 5 000 pasa sin forzar y no consulta el tope", async () => {
    const r = await AdelantosDB.create("t1", {
      beneficiarioId: "b1",
      montoAdelantado: 5000,
      direccion: "RECIBIDO",
      conceptoRecibido: "PRESTAMO",
    });
    expect(r.direccion).toBe("RECIBIDO");
    expect(H.prisma.adelanto.aggregate).not.toHaveBeenCalled();
    expect(H.prisma.adelanto.create.mock.calls[0][0].data).toMatchObject({ direccion: "RECIBIDO", conceptoRecibido: "PRESTAMO", saldoPendiente: 5000 });
  });

  it("dar 200 más sí choca, y el aggregate del tope sólo suma lo DADO", async () => {
    await expect(AdelantosDB.create("t1", { beneficiarioId: "b1", montoAdelantado: 200 })).rejects.toThrow(/límite de crédito/);
    expect(H.prisma.adelanto.aggregate.mock.calls[0][0].where).toMatchObject({ status: "ABIERTO", moneda: "PEN", direccion: "DADO" });
  });

  it("sin dirección queda DADO sin concepto (el asistente IA sigue igual)", async () => {
    H.prisma.adelantoBeneficiario.findFirst.mockResolvedValue({ nombre: "Ana", limiteCredito: null });
    await AdelantosDB.create("t1", { beneficiarioId: "b1", montoAdelantado: 50 });
    expect(H.prisma.adelanto.create.mock.calls[0][0].data).toMatchObject({ direccion: "DADO", conceptoRecibido: null });
  });

  it("RECIBIDO sin concepto o por planilla no llega a la base", async () => {
    await expect(AdelantosDB.create("t1", { beneficiarioId: "b1", montoAdelantado: 50, direccion: "RECIBIDO" })).rejects.toThrow(/Elige/);
    await expect(
      AdelantosDB.create("t1", {
        beneficiarioId: "b1",
        montoAdelantado: 50,
        direccion: "RECIBIDO",
        conceptoRecibido: "SERVICIO",
        modalidad: "DESCUENTO_PLANILLA",
      }),
    ).rejects.toThrow(/planilla/);
    expect(H.prisma.adelanto.create).not.toHaveBeenCalled();
  });
});

// ── 4. La caja ───────────────────────────────────────────────────────────────

describe("la caja según la dirección", () => {
  it("crear un RECIBIDO en efectivo es un INGRESO, y el resultado vuelve", async () => {
    const r = await AdelantosDB.create("t1", {
      beneficiarioId: "b1",
      montoAdelantado: 1731,
      direccion: "RECIBIDO",
      conceptoRecibido: "SERVICIO",
      metodoCaja: "efectivo",
    });
    expect(H.moverCaja.mock.calls[0][1]).toMatchObject({ tipo: "ingreso", monto: 1731 });
    expect(H.moverCaja.mock.calls[0][1].etiqueta).toMatch(/^Adelanto recibido ADL-\d{4}-\d{4} · Wasaco$/);
    expect(r.caja).toEqual({ sinCaja: false, movimientoId: "mov-1" });
  });

  it("crear un DADO sigue siendo un egreso; sin método, `caja: null`", async () => {
    H.prisma.adelantoBeneficiario.findFirst.mockResolvedValue({ nombre: "Ana", limiteCredito: null });
    await AdelantosDB.create("t1", { beneficiarioId: "b1", montoAdelantado: 100, metodoCaja: "efectivo" });
    expect(H.moverCaja.mock.calls[0][1]).toMatchObject({ tipo: "egreso", monto: 100 });
    const sin = await AdelantosDB.create("t1", { beneficiarioId: "b1", montoAdelantado: 100 });
    expect(sin.caja).toBeNull();
  });

  it("devolver en plata un RECIBIDO es un EGRESO (admin o dueño)", async () => {
    H.tx.adelanto.findFirst.mockResolvedValueOnce(fila()).mockResolvedValueOnce(fila({ saldoPendiente: 1231 }));
    H.tx.adelantoEntrega.create.mockResolvedValue({ id: "e1" });
    H.tx.adelantoEntrega.aggregate.mockResolvedValue({ _sum: { valor: 500 } });
    const r = await AdelantosDB.registrarEntrega("t1", "a1", { tipo: "LIBRE", valorManual: 500, metodoCaja: "efectivo" }, ADMIN);
    expect(H.moverCaja.mock.calls[0][1]).toMatchObject({
      tipo: "egreso",
      monto: 500,
      etiqueta: "Devolución de adelanto recibido ADL-2026-0003 · Wasaco",
    });
    expect(r?.caja?.movimientoId).toBe("mov-1");
  });

  it("la amortización (caso 2) sobre un DADO sigue entrando a la caja", async () => {
    H.tx.adelanto.findFirst
      .mockResolvedValueOnce(fila({ direccion: "DADO", conceptoRecibido: null }))
      .mockResolvedValueOnce(fila({ direccion: "DADO", conceptoRecibido: null }));
    H.tx.adelantoEntrega.create.mockResolvedValue({ id: "e1" });
    H.tx.adelantoEntrega.aggregate.mockResolvedValue({ _sum: { valor: 300 } });
    await AdelantosDB.registrarEntrega("t1", "a1", { tipo: "LIBRE", valorManual: 300, metodoCaja: "yape" });
    expect(H.moverCaja.mock.calls[0][1]).toMatchObject({ tipo: "ingreso", monto: 300, metodo: "yape" });
  });

  it("anular un RECIBIDO devolviendo la plata es un EGRESO del saldo (admin o dueño)", async () => {
    H.tx.adelanto.findFirst
      .mockResolvedValueOnce({ status: "ABIERTO", saldoPendiente: 1731, codigoOperacion: "ADL-2026-0003", direccion: "RECIBIDO", beneficiario: { nombre: "Wasaco" } })
      .mockResolvedValueOnce(fila({ status: "CANCELADO" }));
    H.tx.adelanto.updateMany.mockResolvedValue({ count: 1 });
    await AdelantosDB.cancel("t1", "a1", "efectivo", ADMIN);
    expect(H.moverCaja.mock.calls[0][1]).toMatchObject({
      tipo: "egreso",
      monto: 1731,
      etiqueta: "Anulación de adelanto recibido ADL-2026-0003 · Wasaco (devolución)",
    });
  });
});

// ── 2 (revisión). Quién saca plata por un recibido, y cuánta ─────────────────

describe("sacar plata de la caja por un RECIBIDO", () => {
  it("un cajero o almacenero no puede devolverlo en plata: 403 antes de escribir", async () => {
    H.tx.adelanto.findFirst.mockResolvedValueOnce(fila({ saldoPendiente: 1 }));
    const e = await AdelantosDB.registrarEntrega("t1", "a1", { tipo: "LIBRE", valorManual: 5000, metodoCaja: "efectivo" }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ReglaDeRecibidoError);
    expect(e).toMatchObject({ status: 403, code: "solo_admin_o_dueno" });
    expect(H.tx.adelantoEntrega.create).not.toHaveBeenCalled();
    expect(H.moverCaja).not.toHaveBeenCalled();
  });

  it("sin caja (le diste servicio o madera) cualquiera puede anotarlo", async () => {
    H.tx.adelanto.findFirst.mockResolvedValueOnce(fila()).mockResolvedValueOnce(fila({ saldoPendiente: 1231 }));
    H.tx.adelantoEntrega.create.mockResolvedValue({ id: "e1" });
    H.tx.adelantoEntrega.aggregate.mockResolvedValue({ _sum: { valor: 500 } });
    await AdelantosDB.registrarEntrega("t1", "a1", { tipo: "LIBRE", valorManual: 500, descripcion: "Aserrío 1000 pt" });
    expect(H.tx.adelantoEntrega.create).toHaveBeenCalledTimes(1);
    expect(H.moverCaja).not.toHaveBeenCalled();
  });

  it("ni un admin devuelve más de lo que debe: recibido S/ 1, devolución 5 000 → 400", async () => {
    H.tx.adelanto.findFirst.mockResolvedValueOnce(fila({ montoAdelantado: 1, saldoPendiente: 1 }));
    await expect(
      AdelantosDB.registrarEntrega("t1", "a1", { tipo: "LIBRE", valorManual: 5000, metodoCaja: "efectivo" }, ADMIN),
    ).rejects.toMatchObject({ status: 400, code: "excede_saldo" });
    expect(H.tx.adelantoEntrega.create).not.toHaveBeenCalled();
  });

  it("anular un recibido devolviendo la plata, sin ser admin o dueño → 403 y nada cambia", async () => {
    H.tx.adelanto.findFirst.mockResolvedValueOnce({
      status: "ABIERTO",
      saldoPendiente: 1731,
      codigoOperacion: "ADL-2026-0003",
      direccion: "RECIBIDO",
      beneficiario: { nombre: "Wasaco" },
    });
    await expect(AdelantosDB.cancel("t1", "a1", "efectivo")).rejects.toMatchObject({ status: 403, code: "solo_admin_o_dueno" });
    expect(H.tx.adelanto.updateMany).not.toHaveBeenCalled();
    expect(H.moverCaja).not.toHaveBeenCalled();
  });

  it("lo DADO sigue como hoy: la amortización con caja no pide permiso", async () => {
    H.tx.adelanto.findFirst
      .mockResolvedValueOnce(fila({ direccion: "DADO", conceptoRecibido: null }))
      .mockResolvedValueOnce(fila({ direccion: "DADO", conceptoRecibido: null }));
    H.tx.adelantoEntrega.create.mockResolvedValue({ id: "e1" });
    H.tx.adelantoEntrega.aggregate.mockResolvedValue({ _sum: { valor: 5000 } });
    await AdelantosDB.registrarEntrega("t1", "a1", { tipo: "LIBRE", valorManual: 5000, metodoCaja: "efectivo" });
    expect(H.moverCaja.mock.calls[0][1]).toMatchObject({ tipo: "ingreso", monto: 5000 });
  });
});

// ── 4 (revisión). Producto en un RECIBIDO ────────────────────────────────────

describe("el producto que el negocio entrega", () => {
  it("todavía no: 400 antes de escribir (el stock no bajaría)", async () => {
    H.tx.adelanto.findFirst.mockResolvedValueOnce(fila());
    await expect(
      AdelantosDB.registrarEntrega("t1", "a1", { tipo: "PRODUCTO", productId: 7, cantidad: 3 }, ADMIN),
    ).rejects.toMatchObject({ status: 400, code: "producto_en_recibido", message: expect.stringMatching(/entrega libre/) });
    expect(H.tx.adelantoEntrega.create).not.toHaveBeenCalled();
    expect(H.tx.product.findFirst).not.toHaveBeenCalled();
  });

  it("en un DADO sigue siendo al costo", async () => {
    H.tx.adelanto.findFirst
      .mockResolvedValueOnce(fila({ direccion: "DADO", conceptoRecibido: null }))
      .mockResolvedValueOnce(fila({ direccion: "DADO", conceptoRecibido: null }));
    H.tx.product.findFirst.mockResolvedValue({ price: 10, costPrice: 6 });
    H.tx.adelantoEntrega.create.mockResolvedValue({ id: "e1" });
    H.tx.adelantoEntrega.aggregate.mockResolvedValue({ _sum: { valor: 18 } });
    await AdelantosDB.registrarEntrega("t1", "a1", { tipo: "PRODUCTO", productId: 7, cantidad: 3 });
    expect(H.tx.adelantoEntrega.create.mock.calls[0][0].data).toMatchObject({ valor: 18 });
  });
});

// ── 9 (revisión). Doble clic ─────────────────────────────────────────────────

describe("create con idempotencyKey", () => {
  it("la misma clave devuelve el mismo adelanto, sin crear otro ni mover la caja de nuevo", async () => {
    H.prisma.adelantoBeneficiario.findFirst.mockResolvedValue({ nombre: "Ana", limiteCredito: null });
    H.prisma.adelanto.findFirst.mockResolvedValueOnce(null);
    const primero = await AdelantosDB.create("t1", { beneficiarioId: "b1", montoAdelantado: 100, metodoCaja: "efectivo", idempotencyKey: "clave-intento-1" });
    expect(primero).not.toHaveProperty("repetido");
    expect(H.prisma.adelanto.create.mock.calls[0][0].data).toMatchObject({ idempotencyKey: "clave-intento-1" });

    H.prisma.adelanto.findFirst.mockResolvedValueOnce(
      fila({ direccion: "DADO", conceptoRecibido: null, montoAdelantado: 100, idempotencyKey: "clave-intento-1", idempotencyHuella: H.prisma.adelanto.create.mock.calls[0][0].data.idempotencyHuella }),
    );
    const segundo = await AdelantosDB.create("t1", { beneficiarioId: "b1", montoAdelantado: 100, metodoCaja: "efectivo", idempotencyKey: "clave-intento-1" });
    expect(segundo).toMatchObject({ id: "a1", repetido: true, caja: null });
    expect(H.prisma.adelanto.create).toHaveBeenCalledTimes(1);
    expect(H.moverCaja).toHaveBeenCalledTimes(1);
    expect(H.prisma.adelanto.findFirst.mock.calls[1][0].where).toEqual({ tenantId: "t1", idempotencyKey: "clave-intento-1" });
  });

  it("dos a la vez: el índice único frena al segundo, que devuelve el primero", async () => {
    H.prisma.adelantoBeneficiario.findFirst.mockResolvedValue({ nombre: "Ana", limiteCredito: null });
    H.prisma.adelanto.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(fila({ direccion: "DADO", conceptoRecibido: null, montoAdelantado: 100 }));
    H.prisma.adelanto.create.mockRejectedValueOnce(Object.assign(new Error("Unique"), { code: "P2002" }));
    const r = await AdelantosDB.create("t1", { beneficiarioId: "b1", montoAdelantado: 100, metodoCaja: "efectivo", idempotencyKey: "clave-intento-2" });
    expect(r).toMatchObject({ repetido: true, caja: null });
    expect(H.moverCaja).not.toHaveBeenCalled();
  });

  it("la misma clave con OTRO cuerpo no devuelve el primero: 422 idempotencia_distinta", async () => {
    H.prisma.adelantoBeneficiario.findFirst.mockResolvedValue({ nombre: "Ana", limiteCredito: null });
    H.prisma.adelanto.findFirst.mockResolvedValueOnce(
      fila({ direccion: "DADO", conceptoRecibido: null, montoAdelantado: 100, idempotencyHuella: "alta|b1|100.00|PEN|DADO||efectivo" }),
    );
    const e = await AdelantosDB.create("t1", { beneficiarioId: "b1", montoAdelantado: 900, metodoCaja: "efectivo", idempotencyKey: "clave-intento-3" }).catch(
      (x: unknown) => x,
    );
    expect(e).toBeInstanceOf(IdempotenciaDistintaError);
    expect(e).toMatchObject({ status: 422, code: "idempotencia_distinta" });
    expect((e as Error).message).toBe("Ya guardaste un adelanto con otros datos en este intento; revísalo en la lista.");
    expect(H.prisma.adelanto.create).not.toHaveBeenCalled();
    expect(H.moverCaja).not.toHaveBeenCalled();
  });

  it("con caja, el alta y el movimiento van en la MISMA transacción (sin ventana para corregir)", async () => {
    H.prisma.adelantoBeneficiario.findFirst.mockResolvedValue({ nombre: "Ana", limiteCredito: null });
    await AdelantosDB.create("t1", { beneficiarioId: "b1", montoAdelantado: 300, metodoCaja: "efectivo" });
    expect(H.prisma.$transaction).toHaveBeenCalledTimes(1);
    // El movimiento se pide ANTES de que la transacción termine.
    expect(H.prisma.adelanto.create.mock.invocationCallOrder[0]).toBeLessThan(H.moverCaja.mock.invocationCallOrder[0]);
  });
});

// ── Idempotencia de las entregas (revisión) ──────────────────────────────────

describe("registrarEntrega con idempotencyKey", () => {
  const cuerpo = { tipo: "LIBRE" as const, valorManual: 200, metodoCaja: "efectivo" as const, idempotencyKey: "entrega-intento-1" };

  it("la primera guarda la clave y la huella; mueve la caja una vez", async () => {
    H.tx.adelanto.findFirst.mockResolvedValueOnce(fila({ direccion: "DADO", conceptoRecibido: null })).mockResolvedValueOnce(fila({ direccion: "DADO", conceptoRecibido: null }));
    H.tx.adelantoEntrega.findFirst.mockResolvedValue(null);
    H.tx.adelantoEntrega.create.mockResolvedValue({ id: "e1" });
    H.tx.adelantoEntrega.aggregate.mockResolvedValue({ _sum: { valor: 200 } });
    await AdelantosDB.registrarEntrega("t1", "a1", cuerpo);
    expect(H.tx.adelantoEntrega.create.mock.calls[0][0].data).toMatchObject({
      idempotencyKey: "entrega-intento-1",
      idempotencyHuella: huellaDeEntrega(cuerpo),
    });
    expect(H.moverCaja).toHaveBeenCalledTimes(1);
  });

  it("el reintento con el mismo cuerpo devuelve la misma entrega: ni otra fila ni otra caja", async () => {
    H.tx.adelanto.findFirst.mockResolvedValueOnce(fila({ direccion: "DADO", conceptoRecibido: null, saldoPendiente: 1531 })).mockResolvedValueOnce(fila({ direccion: "DADO", conceptoRecibido: null, saldoPendiente: 1531 }));
    H.tx.adelantoEntrega.findFirst.mockResolvedValue({ id: "e1", valor: 200, idempotencyHuella: huellaDeEntrega(cuerpo) });
    const r = await AdelantosDB.registrarEntrega("t1", "a1", cuerpo);
    expect(r).toMatchObject({ repetido: true, caja: null, saldoPendiente: 1531 });
    expect(H.tx.adelantoEntrega.findFirst.mock.calls[0][0].where).toEqual({ adelantoId: "a1", idempotencyKey: "entrega-intento-1" });
    expect(H.tx.adelantoEntrega.create).not.toHaveBeenCalled();
    expect(H.moverCaja).not.toHaveBeenCalled();
  });

  it("la misma clave con otro monto → 422 idempotencia_distinta", async () => {
    H.tx.adelanto.findFirst.mockResolvedValueOnce(fila({ direccion: "DADO", conceptoRecibido: null }));
    H.tx.adelantoEntrega.findFirst.mockResolvedValue({ id: "e1", valor: 200, idempotencyHuella: huellaDeEntrega(cuerpo) });
    await expect(AdelantosDB.registrarEntrega("t1", "a1", { ...cuerpo, valorManual: 999 })).rejects.toMatchObject({
      status: 422,
      code: "idempotencia_distinta",
    });
    expect(H.tx.adelantoEntrega.create).not.toHaveBeenCalled();
  });

  it("el reintento de una devolución que dejó el recibido en cero no rebota por «ya no le debes»", async () => {
    H.tx.adelanto.findFirst.mockResolvedValueOnce(fila({ saldoPendiente: 0, status: "LIQUIDADO" })).mockResolvedValueOnce(fila({ saldoPendiente: 0, status: "LIQUIDADO" }));
    H.tx.adelantoEntrega.findFirst.mockResolvedValue({ id: "e1", valor: 1731, idempotencyHuella: huellaDeEntrega({ ...cuerpo, valorManual: 1731 }) });
    const r = await AdelantosDB.registrarEntrega("t1", "a1", { ...cuerpo, valorManual: 1731 }, ADMIN);
    expect(r).toMatchObject({ repetido: true });
    expect(H.moverCaja).not.toHaveBeenCalled();
  });
});

// ── 10. mapAdelanto no se queda corto ────────────────────────────────────────

describe("mapAdelanto devuelve todas las columnas del modelo", () => {
  it("cada columna escalar de `Adelanto` llega al DTO", async () => {
    H.prisma.adelanto.findFirst.mockResolvedValue(fila());
    const dto = await AdelantosDB.getById("t1", "a1");
    const columnas = Object.keys(AdelantoScalarFieldEnum);
    expect(columnas).toContain("direccion");
    expect(columnas).toContain("conceptoRecibido");
    /* Lo que NO viaja a la pantalla, a propósito y con motivo. Una columna nueva
       que no esté acá ni en el DTO hace fallar el test. */
    const internas: Record<string, string> = {
      idempotencyKey: "clave del intento de alta: sólo la usa la DB class para no crear dos",
      idempotencyHuella: "el cuerpo de ese intento, para comparar un reintento: interno",
    };
    const faltan = columnas.filter((c) => !(c in (dto as object)) && !(c in internas));
    expect(faltan).toEqual([]);
    expect(dto).toMatchObject({ direccion: "RECIBIDO", conceptoRecibido: "SERVICIO" });
  });

  it("una fila sin la columna (cliente viejo, mock) se lee DADO", async () => {
    const { direccion: _d, conceptoRecibido: _c, ...vieja } = fila();
    H.prisma.adelanto.findFirst.mockResolvedValue(vieja);
    const dto = await AdelantosDB.getById("t1", "a1");
    expect(dto).toMatchObject({ direccion: "DADO", conceptoRecibido: null });
  });
});

// ── Lecturas: por defecto, sólo lo dado ──────────────────────────────────────

describe("lo que se lee sin pedir nada es lo DADO", () => {
  it("list: DADO por defecto, `todas` explícito", async () => {
    await AdelantosDB.list("t1");
    expect(H.prisma.adelanto.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: "t1", direccion: "DADO" });
    await AdelantosDB.list("t1", { direccion: "todas" });
    expect(H.prisma.adelanto.findMany.mock.calls[1][0].where).not.toHaveProperty("direccion");
  });

  it("saldosPorPersona agrupa por dirección y filtra DADO por defecto", async () => {
    H.prisma.adelanto.groupBy.mockResolvedValue([
      { beneficiarioId: "b1", status: "ABIERTO", moneda: "PEN", direccion: "RECIBIDO", _sum: { saldoPendiente: 3031 }, _count: 2 },
    ]);
    await AdelantosDB.saldosPorPersona("t1");
    const args = H.prisma.adelanto.groupBy.mock.calls[0][0];
    expect(args.by).toContain("direccion");
    expect(args.where).toMatchObject({ direccion: "DADO" });
    const todas = await AdelantosDB.saldosPorPersona("t1", { direccion: "todas" });
    expect(H.prisma.adelanto.groupBy.mock.calls[1][0].where).not.toHaveProperty("direccion");
    expect(todas[0]).toMatchObject({ direccion: "RECIBIDO", saldoPendiente: 3031, cantidad: 2 });
  });

  it("resumen: los KPIs de siempre son lo dado; lo recibido va en `recibido`", async () => {
    H.prisma.adelanto.findMany.mockResolvedValue([
      { montoAdelantado: 3217, saldoPendiente: 3217, status: "ABIERTO", moneda: "PEN", direccion: "DADO" },
      { montoAdelantado: 1731, saldoPendiente: 1731, status: "ABIERTO", moneda: "PEN", direccion: "RECIBIDO" },
      { montoAdelantado: 1300, saldoPendiente: 1300, status: "ABIERTO", moneda: "PEN", direccion: "RECIBIDO" },
    ]);
    H.prisma.adelantoBeneficiario.count.mockResolvedValue(1);
    const r = await AdelantosDB.resumen("t1");
    expect(r.saldoPendiente).toBe(3217);
    expect(r.adelantosAbiertos).toBe(1);
    expect(r.porMoneda).toEqual([{ moneda: "PEN", saldoPendiente: 3217, adelantosAbiertos: 1 }]);
    // Sólo por moneda: sin totales que mezclen soles y dólares.
    expect(r.recibido).toEqual({
      abiertos: 2,
      porMoneda: [{ moneda: "PEN", total: 3031, porDevolver: 3031, excedente: 0, abiertos: 2 }],
    });
  });

  it("el cron de recordatorios sólo mira lo DADO", async () => {
    H.prisma.adelanto.findMany.mockResolvedValue([{ tenantId: "t1", beneficiarioId: "b1", saldoPendiente: "250.00", moneda: "PEN" }]);
    const r = await AdelantosDB.vencidosParaRecordatorio(new Date("2026-08-30T00:00:00.000Z"));
    expect(H.prisma.adelanto.findMany.mock.calls[0][0].where).toMatchObject({ status: "ABIERTO", direccion: "DADO" });
    expect(r[0].saldoPendiente).toBe(250);
  });

  it("listBeneficiarios pide la dirección para que el resumen la separe", async () => {
    H.prisma.adelantoBeneficiario.findMany.mockResolvedValue([
      {
        ...beneficiario,
        adelantos: [
          { montoAdelantado: 3217, saldoPendiente: 3217, moneda: "PEN", status: "ABIERTO", fechaAdelanto: ahora, direccion: "DADO" },
          { montoAdelantado: 1731, saldoPendiente: 1731, moneda: "PEN", status: "ABIERTO", fechaAdelanto: ahora, direccion: "RECIBIDO" },
        ],
      },
    ]);
    const [p] = await AdelantosDB.listBeneficiarios("t1");
    expect(H.prisma.adelantoBeneficiario.findMany.mock.calls[0][0].include.adelantos.select.direccion).toBe(true);
    expect(p.saldoPendiente).toEqual({ PEN: 3217 });
    expect(p.leDebes).toEqual({ PEN: 1731 });
  });
});

// ── Corregir la dirección ────────────────────────────────────────────────────

describe("corregirDireccion", () => {
  const actual = (p: Record<string, unknown> = {}) => ({
    status: "ABIERTO",
    modalidad: "CUENTA_CORRIENTE",
    direccion: "DADO",
    conceptoRecibido: null,
    codigoOperacion: "ADL-2026-0003",
    montoAdelantado: 1731,
    moneda: "PEN",
    createdAt: new Date("2026-09-28T01:01:00.000Z"),
    beneficiarioId: "b1",
    beneficiario: { nombre: "Wasaco", limiteCredito: null },
    ...p,
  });
  const pedido = { direccion: "RECIBIDO" as const, conceptoRecibido: "SERVICIO" as const, motivo: "Era el pago del aserrío de WASACO", usuario: "brandon" };

  it("sin entregas ni caja: cambia de lado, audita en la tx y no toca la caja", async () => {
    H.tx.adelanto.findFirst.mockResolvedValueOnce(actual()).mockResolvedValueOnce(fila());
    H.tx.adelantoEntrega.count.mockResolvedValue(0);
    const r = await AdelantosDB.corregirDireccion("t1", "a1", pedido);
    expect(r?.antes).toEqual({ direccion: "DADO", conceptoRecibido: null });
    expect(r?.despues).toEqual({ direccion: "RECIBIDO", conceptoRecibido: "SERVICIO" });
    expect(r?.excedeLimite).toBeNull();
    expect(H.tx.adelanto.update.mock.calls[0][0].data).toEqual({ direccion: "RECIBIDO", conceptoRecibido: "SERVICIO" });
    const log = H.tx.activityLog.create.mock.calls[0][0].data;
    expect(log).toMatchObject({ tenantId: "t1", action: "Corregir dirección", entity: "adelanto", entityId: "a1", user: "brandon" });
    expect(log.detail).toBe("ADL-2026-0003: dado → recibido (servicio). Motivo: Era el pago del aserrío de WASACO. La caja no se movió.");
    expect(H.moverCaja).not.toHaveBeenCalled();
    // Busca el movimiento del alta por su código, en las cajas de ESTE negocio.
    const where = H.tx.cashMovement.findMany.mock.calls[0][0].where;
    expect(where.cashRegister).toEqual({ tenantId: "t1" });
    expect(where.OR[0]).toEqual({ description: { contains: "ADL-2026-0003" } });
    // Y el mismo monto ese día en el sentido del alta (un egreso anotado a mano).
    expect(where.OR[1]).toMatchObject({ type: "egreso", amount: 1731 });
    // El lock va ANTES de contar las entregas: una simultánea espera.
    expect(H.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(H.tx.adelantoEntrega.count.mock.invocationCallOrder[0]);
  });

  it("DOBLE PAGO: un DADO cuya alta sacó plata de la caja no se pasa a recibido → 409 movio_caja", async () => {
    /* Blas ADL-0002: S/ 3 217 dados el 27/09 con egreso de caja y 0 entregas.
       Corregido a recibido, una devolución de 3 217 sacaba OTROS 3 217. */
    H.tx.adelanto.findFirst.mockResolvedValueOnce(actual({ codigoOperacion: "ADL-2026-0002", montoAdelantado: 3217 }));
    H.tx.adelantoEntrega.count.mockResolvedValue(0);
    H.tx.cashMovement.findMany.mockResolvedValue([
      { type: "egreso", amount: 3217, description: "Adelanto ADL-2026-0002 · Wasaco", createdAt: new Date("2026-09-28T00:59:32.271Z") },
    ]);
    const e = await AdelantosDB.corregirDireccion("t1", "a1", pedido).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(DireccionNoCorregibleError);
    expect(e).toMatchObject({ status: 409, code: "movio_caja", movimiento: { tipo: "egreso", monto: 3217 } });
    expect((e as Error).message).toMatch(/^Esta plata salió de tu caja el 27\/09 \(S\/ 3,217\.00\)\. Para cambiarla a recibida, anúlala devolviendo/);
    expect(H.tx.adelanto.update).not.toHaveBeenCalled();
    expect(H.tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("un código parecido (ADL-2026-00021) no bloquea al ADL-2026-0002", async () => {
    H.tx.adelanto.findFirst.mockResolvedValueOnce(actual({ codigoOperacion: "ADL-2026-0002" })).mockResolvedValueOnce(fila());
    H.tx.adelantoEntrega.count.mockResolvedValue(0);
    H.tx.cashMovement.findMany.mockResolvedValue([
      { type: "egreso", amount: 50, description: "Adelanto ADL-2026-00021 · Otro", createdAt: new Date("2026-09-28T00:59:32.271Z") },
    ]);
    await expect(AdelantosDB.corregirDireccion("t1", "a1", pedido)).resolves.toMatchObject({ despues: { direccion: "RECIBIDO" } });
  });

  it("con código, un egreso a mano del mismo monto ese día también bloquea", async () => {
    H.tx.adelanto.findFirst.mockResolvedValueOnce(actual());
    H.tx.adelantoEntrega.count.mockResolvedValue(0);
    H.tx.cashMovement.findMany.mockResolvedValue([
      { type: "egreso", amount: 1731, description: "Pago aserrío Wasaco", createdAt: new Date("2026-09-28T02:00:00.000Z") },
    ]);
    await expect(AdelantosDB.corregirDireccion("t1", "a1", pedido)).rejects.toMatchObject({ code: "movio_caja" });
  });

  it("sin código: la regla conservadora (monto exacto + mismo día de Lima + el sentido del alta)", async () => {
    H.tx.adelanto.findFirst.mockResolvedValueOnce(actual({ codigoOperacion: null, montoAdelantado: 17000, createdAt: new Date("2026-08-04T04:35:00.000Z") }));
    H.tx.adelantoEntrega.count.mockResolvedValue(0);
    H.tx.cashMovement.findMany.mockResolvedValue([
      { type: "egreso", amount: 17000, description: "Adelanto · Wasaco", createdAt: new Date("2026-08-04T04:35:02.000Z") },
    ]);
    await expect(AdelantosDB.corregirDireccion("t1", "a1", pedido)).rejects.toMatchObject({ code: "movio_caja" });
    const where = H.tx.cashMovement.findMany.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(1);
    expect(where.OR[0]).toMatchObject({ type: "egreso", amount: 17000 });
  });

  it("servicio ↔ préstamo no cambia el lado: no mira la caja", async () => {
    H.tx.adelanto.findFirst.mockResolvedValueOnce(actual({ direccion: "RECIBIDO", conceptoRecibido: "SERVICIO" })).mockResolvedValueOnce(fila());
    H.tx.adelantoEntrega.count.mockResolvedValue(0);
    await AdelantosDB.corregirDireccion("t1", "a1", { ...pedido, conceptoRecibido: "PRESTAMO" });
    expect(H.tx.cashMovement.findMany).not.toHaveBeenCalled();
  });

  it("RECIBIDO → DADO corre el tope y lo informa sin bloquear", async () => {
    H.tx.adelanto.findFirst
      .mockResolvedValueOnce(actual({ direccion: "RECIBIDO", conceptoRecibido: "SERVICIO", beneficiario: { nombre: "Wasaco", limiteCredito: 1000 } }))
      .mockResolvedValueOnce(fila({ direccion: "DADO", conceptoRecibido: null }));
    H.tx.adelantoEntrega.count.mockResolvedValue(0);
    H.tx.adelanto.aggregate.mockResolvedValue({ _sum: { saldoPendiente: 2631 } });
    const r = await AdelantosDB.corregirDireccion("t1", "a1", { direccion: "DADO", conceptoRecibido: null, motivo: "Era plata que le dimos", usuario: "brandon" });
    expect(r?.excedeLimite).toEqual({ limite: 1000, saldo: 2631 });
    expect(H.tx.adelanto.aggregate.mock.calls[0][0].where).toMatchObject({ beneficiarioId: "b1", status: "ABIERTO", moneda: "PEN", direccion: "DADO" });
    expect(H.tx.adelanto.update).toHaveBeenCalledTimes(1);
    expect(H.tx.activityLog.create.mock.calls[0][0].data.detail).toMatch(/Supera el tope/);
  });

  it("con una entrega viva: 409, sin escribir", async () => {
    H.tx.adelanto.findFirst.mockResolvedValueOnce(actual());
    H.tx.adelantoEntrega.count.mockResolvedValue(1);
    const e = await AdelantosDB.corregirDireccion("t1", "a1", pedido).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(DireccionNoCorregibleError);
    expect(e).toMatchObject({ status: 409, code: "con_entregas" });
    expect(H.tx.adelanto.update).not.toHaveBeenCalled();
  });

  it("anulado → 409; por planilla a RECIBIDO → 400; igual que antes → 409", async () => {
    H.tx.adelanto.findFirst.mockResolvedValueOnce(actual({ status: "CANCELADO" }));
    await expect(AdelantosDB.corregirDireccion("t1", "a1", pedido)).rejects.toMatchObject({ status: 409, code: "anulado" });

    H.tx.adelanto.findFirst.mockResolvedValueOnce(actual({ modalidad: "DESCUENTO_PLANILLA" }));
    H.tx.adelantoEntrega.count.mockResolvedValue(0);
    await expect(AdelantosDB.corregirDireccion("t1", "a1", pedido)).rejects.toMatchObject({ status: 400, code: "combinacion" });

    H.tx.adelanto.findFirst.mockResolvedValueOnce(actual({ direccion: "RECIBIDO", conceptoRecibido: "SERVICIO" }));
    await expect(AdelantosDB.corregirDireccion("t1", "a1", pedido)).rejects.toMatchObject({ status: 409, code: "sin_cambio" });
    expect(H.tx.adelanto.update).not.toHaveBeenCalled();
  });

  it("un motivo de invisibles no pasa", async () => {
    await expect(AdelantosDB.corregirDireccion("t1", "a1", { ...pedido, motivo: "\u200B\u202E\u00AD ab " })).rejects.toMatchObject({ status: 400, code: "motivo" });
    expect(H.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("otro negocio: el lock no encuentra la fila → null (la ruta da 404)", async () => {
    H.tx.$queryRaw.mockResolvedValue([]);
    await expect(AdelantosDB.corregirDireccion("t-ajeno", "a1", pedido)).resolves.toBeNull();
    expect(String(H.tx.$queryRaw.mock.calls[0][0].join("?"))).toMatch(/"tenantId" = \?/);
    expect(H.tx.$queryRaw.mock.calls[0]).toContain("t-ajeno");
    expect(H.tx.adelanto.update).not.toHaveBeenCalled();
  });
});
