// @vitest-environment node
/**
 * ADR-491 — el cajero entrega, y NADA más de Adelantos.
 *
 * 1. Matriz: el cajero tiene SOLO `adelantos-entregar:write` (ni `adelantos`
 *    read/write/delete); almacenero y analista, nada del recurso nuevo.
 * 2. Las rutas viejas siguen cerradas para el cajero: editar (PATCH), entregas,
 *    personas, anular (DELETE) → 403 sin tocar la base.
 * 3. `AdelantosDB.create` con `exigirCajaAbierta` y sin caja abierta tira
 *    `SinCajaError` DENTRO de la transacción del alta (rollback: no queda el
 *    adelanto), y sin `metodoCaja` ni siquiera la abre.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  auth: { tenantId: "t1", username: "caja1", role: "cajero" } as { tenantId: string; username: string; role: string },
  tocado: vi.fn(),
  txCreate: vi.fn(),
  mover: vi.fn(),
  transaccion: vi.fn(),
  lock: vi.fn(),
  sumaHoy: vi.fn(async () => ({ _sum: { montoAdelantado: 0 } })),
  benef: vi.fn(async () => ({ nombre: "Juan", limiteCredito: null }) as unknown),
  yaCreado: vi.fn(async () => null as unknown),
  txFindFirst: vi.fn(async () => null as unknown),
  aggPrevio: vi.fn(async () => ({ _sum: { saldoPendiente: 0 } })),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn(async () => H.auth) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), cacheStore: { get: () => null, set: () => {} } }));
vi.mock("@/lib/adelantos/movimiento-caja", async (orig) => ({
  ...(await orig<typeof import("@/lib/adelantos/movimiento-caja")>()),
  moverCajaEnTx: (...a: unknown[]) => H.mover(...a),
}));
vi.mock("@/lib/prisma", () => {
  const tx = {
    adelanto: {
      create: (...a: unknown[]) => H.txCreate(...a),
      aggregate: (...a: unknown[]) => H.sumaHoy(...(a as [])),
      findFirst: (...a: unknown[]) => H.txFindFirst(...(a as [])),
    },
    $executeRaw: (...a: unknown[]) => H.lock(...a),
  };
  return {
    prisma: {
      adelanto: {
        findFirst: (...a: unknown[]) => H.yaCreado(...(a as [])),
        findMany: vi.fn(async () => []),
        aggregate: (...a: unknown[]) => H.aggPrevio(...(a as [])),
        create: (...a: unknown[]) => H.tocado("adelanto.create", ...a),
      },
      adelantoBeneficiario: { findFirst: (...a: unknown[]) => H.benef(...(a as [])) },
      $transaction: async (fn: (t: typeof tx) => unknown) => {
        H.transaccion();
        return fn(tx);
      },
    },
  };
});

import { checkPermission, getAccessibleResources, type Role } from "@/lib/auth/role-permissions";
import { esModoCajero, permisoEntregar } from "@/lib/adelantos/permisos";
import { AdelantosDB, SinCajaError, TopeCajeroError } from "@/lib/db/adelantos.db";

describe("matriz: el cajero sólo entrega", () => {
  it("cajero: adelantos-entregar = [write]; adelantos = nada", () => {
    expect(checkPermission("cajero", "adelantos-entregar", "write")).toBe(true);
    expect(checkPermission("cajero", "adelantos-entregar", "read")).toBe(false);
    expect(checkPermission("cajero", "adelantos-entregar", "delete")).toBe(false);
    for (const a of ["read", "write", "delete"] as const) expect(checkPermission("cajero", "adelantos", a)).toBe(false);
    expect(getAccessibleResources("cajero").filter((r) => r.startsWith("adelantos"))).toEqual(["adelantos-entregar"]);
  });

  it.each([
    ["admin", true],
    ["owner", true],
    ["manager", true],
    ["cajero", true],
    ["almacenero", false],
    ["analista", false],
    ["delivery", false],
    ["proveedor", false],
  ])("%s → entregar %s", (role, puede) => {
    expect(permisoEntregar(role) === null).toBe(puede);
    expect(checkPermission(role as Role, "adelantos-entregar", "write")).toBe(puede);
  });

  it("modo cajero = no gestiona adelantos (lo dice la matriz, no el nombre)", () => {
    expect(esModoCajero("cajero")).toBe(true);
    expect(esModoCajero("admin")).toBe(false);
    expect(esModoCajero("owner")).toBe(false);
    expect(esModoCajero("manager")).toBe(false);
  });
});

describe("las rutas viejas siguen cerradas para el cajero", () => {
  beforeEach(() => H.tocado.mockClear());
  const req = (url: string, method: string, body?: unknown) =>
    new NextRequest(`http://localhost${url}`, { method, ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) });
  const params = { params: Promise.resolve({ id: "a1" }) };

  it("PATCH /api/adelantos/[id] (editar notas) → 403", async () => {
    const { PATCH } = await import("@/app/api/adelantos/[id]/route");
    const r = (await PATCH(req("/api/adelantos/a1", "PATCH", { notas: "x" }), params)) as NextResponse;
    expect(r.status).toBe(403);
  });

  it("DELETE /api/adelantos/[id] (anular) → 403", async () => {
    const { DELETE } = await import("@/app/api/adelantos/[id]/route");
    const r = (await DELETE(req("/api/adelantos/a1", "DELETE"), params)) as NextResponse;
    expect(r.status).toBe(403);
  });

  it("POST /api/adelantos/[id]/entregas → 403", async () => {
    const { POST } = await import("@/app/api/adelantos/[id]/entregas/route");
    const r = (await POST(req("/api/adelantos/a1/entregas", "POST", { tipo: "LIBRE", valor: 10 }), params)) as NextResponse;
    expect(r.status).toBe(403);
  });

  it("POST /api/adelantos (alta clásica) y POST /api/adelantos/beneficiarios → 403", async () => {
    const { POST } = await import("@/app/api/adelantos/route");
    expect(((await POST(req("/api/adelantos", "POST", { beneficiarioId: "b1", montoAdelantado: 10 }))) as NextResponse).status).toBe(403);
    const { POST: POST_B } = await import("@/app/api/adelantos/beneficiarios/route");
    expect(((await POST_B(req("/api/adelantos/beneficiarios", "POST", { nombre: "Nueva" }))) as NextResponse).status).toBe(403);
    expect(H.tocado).not.toHaveBeenCalled();
  });
});

describe("AdelantosDB.create con exigirCajaAbierta", () => {
  beforeEach(() => {
    H.txCreate.mockReset().mockResolvedValue({ id: "a1", codigoOperacion: "ADL-2026-0001", beneficiario: { nombre: "Juan" } });
    H.mover.mockReset();
    H.transaccion.mockClear();
  });

  it("sin caja abierta: SinCajaError DENTRO de la transacción (rollback del alta)", async () => {
    H.mover.mockResolvedValue({ sinCaja: true });
    await expect(
      AdelantosDB.create("t1", { beneficiarioId: "b1", montoAdelantado: 100, metodoCaja: "efectivo", exigirCajaAbierta: true }),
    ).rejects.toBeInstanceOf(SinCajaError);
    expect(H.transaccion).toHaveBeenCalledTimes(1);
    /* El INSERT corrió dentro de la tx que tiró: Postgres lo deshace. */
    expect(H.txCreate).toHaveBeenCalledTimes(1);
  });

  it("sin método de caja: SinCajaError sin abrir la transacción ni insertar", async () => {
    await expect(AdelantosDB.create("t1", { beneficiarioId: "b1", montoAdelantado: 100, metodoCaja: null, exigirCajaAbierta: true })).rejects.toBeInstanceOf(SinCajaError);
    expect(H.transaccion).not.toHaveBeenCalled();
    expect(H.txCreate).not.toHaveBeenCalled();
  });

  it("sin exigir (admin): sin caja abierta igual se guarda con `sinCaja`", async () => {
    H.mover.mockResolvedValue({ sinCaja: true });
    H.txCreate.mockResolvedValue({
      id: "a1", tenantId: "t1", codigoOperacion: "ADL-2026-0001", beneficiarioId: "b1", modalidad: "CUENTA_CORRIENTE",
      montoAdelantado: 100, saldoPendiente: 100, moneda: "PEN", fechaAdelanto: new Date(), status: "ABIERTO",
      direccion: "DADO", entregas: [], entregasPactadas: [], createdAt: new Date(), updatedAt: new Date(), beneficiario: null,
    });
    const r = await AdelantosDB.create("t1", { beneficiarioId: "b1", montoAdelantado: 100, metodoCaja: "efectivo" });
    expect(r.caja).toEqual({ sinCaja: true });
  });
});

describe("ADR-491 security — el alta del cajero", () => {
  beforeEach(() => {
    H.txCreate.mockReset().mockResolvedValue({ id: "a1", codigoOperacion: "ADL-2026-0001", beneficiario: { nombre: "Juan" } });
    H.mover.mockReset().mockResolvedValue({ sinCaja: false, movimientoId: "m1" });
    H.lock.mockReset();
    H.sumaHoy.mockReset().mockResolvedValue({ _sum: { montoAdelantado: 0 } });
    H.benef.mockClear();
  });
  const TOPE = { tope: 500, desde: new Date("2026-10-10T05:00:00Z"), prefijoClave: "cajero:" };

  it("tope diario: 4×500 a la misma persona no pasa — con 400 dados hoy, 120 más tira (queda 100) sin insertar", async () => {
    H.sumaHoy.mockResolvedValueOnce({ _sum: { montoAdelantado: 400 } });
    const e = await AdelantosDB.create("t1", { beneficiarioId: "b1", montoAdelantado: 120, metodoCaja: "efectivo", exigirCajaAbierta: true, topeCajero: TOPE }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(TopeCajeroError);
    expect((e as TopeCajeroError).queda).toBe(100);
    expect(H.txCreate).not.toHaveBeenCalled();
    /* El lock por persona va ANTES de sumar, y la suma es de hoy, dados, no anulados, de cajeros. */
    expect(H.lock.mock.invocationCallOrder[0]).toBeLessThan(H.sumaHoy.mock.invocationCallOrder[0]);
    expect((H.sumaHoy.mock.calls[0] as unknown[])[0]).toMatchObject({
      where: { tenantId: "t1", beneficiarioId: "b1", direccion: "DADO", status: { not: "CANCELADO" }, createdAt: { gte: TOPE.desde }, idempotencyKey: { startsWith: "cajero:" } },
    });
  });

  it("dentro del tope del día: inserta", async () => {
    H.sumaHoy.mockResolvedValueOnce({ _sum: { montoAdelantado: 380 } });
    H.txCreate.mockResolvedValueOnce({
      id: "a1", tenantId: "t1", codigoOperacion: "ADL-2026-0001", beneficiarioId: "b1", modalidad: "CUENTA_CORRIENTE", montoAdelantado: 120, saldoPendiente: 120,
      moneda: "PEN", fechaAdelanto: new Date(), status: "ABIERTO", direccion: "DADO", entregas: [], entregasPactadas: [], createdAt: new Date(), updatedAt: new Date(), beneficiario: null,
    });
    await AdelantosDB.create("t1", { beneficiarioId: "b1", montoAdelantado: 120, metodoCaja: "efectivo", exigirCajaAbierta: true, topeCajero: TOPE });
    expect(H.txCreate).toHaveBeenCalledTimes(1);
  });

  it("soloActivas: la persona se busca con activo:true (una dada de baja = no existe)", async () => {
    H.benef.mockResolvedValueOnce(null);
    await expect(AdelantosDB.create("t1", { beneficiarioId: "b-baja", montoAdelantado: 10, metodoCaja: "efectivo", soloActivas: true })).rejects.toThrow(/no existe/);
    expect((H.benef.mock.calls[0] as unknown as [{ where: unknown }])[0].where).toEqual({ id: "b-baja", tenantId: "t1", activo: true });
  });

  it("POST …/firmas: un rol sin permiso recibe 403 ANTES de leer el cuerpo", async () => {
    H.auth = { tenantId: "t1", username: "alm", role: "almacenero" };
    const { POST } = await import("@/app/api/adelantos/[id]/firmas/route");
    const r = (await POST(new NextRequest("http://localhost/api/adelantos/a1/firmas", { method: "POST", body: "esto no es multipart" }), { params: Promise.resolve({ id: "a1" }) })) as NextResponse;
    expect(r.status).toBe(403);
    H.auth = { tenantId: "t1", username: "caja1", role: "cajero" };
  });
});

describe("ADR-491 reviewer — misma clave mientras el 1.º se guarda; límite bajo el bloqueo", () => {
  const FILA = {
    id: "a1", tenantId: "t1", codigoOperacion: "ADL-2026-0001", beneficiarioId: "b1", modalidad: "CUENTA_CORRIENTE", montoAdelantado: 300, saldoPendiente: 300,
    moneda: "PEN", fechaAdelanto: new Date(), status: "ABIERTO", direccion: "DADO", entregas: [], entregasPactadas: [], createdAt: new Date(), updatedAt: new Date(),
    beneficiario: null, idempotencyKey: "cajero:k-1", idempotencyHuella: null,
  };
  const TOPE = { tope: 500, desde: new Date("2026-10-10T05:00:00Z"), prefijoClave: "cajero:" };
  const DATOS = { beneficiarioId: "b1", montoAdelantado: 300, moneda: "PEN", metodoCaja: "efectivo" as const, exigirCajaAbierta: true, idempotencyKey: "cajero:k-1", topeCajero: TOPE };
  beforeEach(() => {
    H.txCreate.mockReset();
    H.mover.mockReset().mockResolvedValue({ sinCaja: false, movimientoId: "m1" });
    H.lock.mockReset();
    H.yaCreado.mockReset().mockResolvedValue(null);
    H.txFindFirst.mockReset().mockResolvedValue(null);
    H.sumaHoy.mockReset().mockResolvedValue({ _sum: { montoAdelantado: 0 } });
    H.aggPrevio.mockReset().mockResolvedValue({ _sum: { saldoPendiente: 0 } });
    H.benef.mockReset().mockResolvedValue({ nombre: "Juan", limiteCredito: null });
  });

  it("2.º pedido con la MISMA clave: tras el bloqueo ve la fila del 1.º → «repetido», no 403 de tope", async () => {
    /* Antes del bloqueo no había nada (el 1.º seguía guardándose); bajo el
       bloqueo la clave ya está; la suma del día ya trae los S/ 300 del 1.º. */
    H.yaCreado.mockResolvedValueOnce(null).mockResolvedValueOnce(FILA);
    H.txFindFirst.mockResolvedValueOnce({ id: "a1" });
    H.sumaHoy.mockResolvedValue({ _sum: { montoAdelantado: 300 } });
    const r = await AdelantosDB.create("t1", DATOS);
    expect(r.repetido).toBe(true);
    expect(r.id).toBe("a1");
    expect(r.caja).toBeNull();
    expect(H.txCreate).not.toHaveBeenCalled();
    expect(H.mover).not.toHaveBeenCalled();
    expect((H.txFindFirst.mock.calls[0] as unknown[])[0]).toMatchObject({ where: { tenantId: "t1", idempotencyKey: "cajero:k-1" } });
  });

  it("si el tope salta igual (la clave entró justo después), el catch vuelve a mirar la clave → «repetido»", async () => {
    H.yaCreado.mockResolvedValueOnce(null).mockResolvedValueOnce(FILA);
    H.sumaHoy.mockResolvedValue({ _sum: { montoAdelantado: 300 } });
    const r = await AdelantosDB.create("t1", DATOS);
    expect(r.repetido).toBe(true);
  });

  it("otra clave con 300 ya dados hoy: 403 de tope de verdad", async () => {
    H.sumaHoy.mockResolvedValue({ _sum: { montoAdelantado: 300 } });
    await expect(AdelantosDB.create("t1", { ...DATOS, idempotencyKey: "cajero:k-2" })).rejects.toBeInstanceOf(TopeCajeroError);
  });

  it("límite de crédito: se vuelve a sumar BAJO el bloqueo (otra entrega a la vez lo llenó)", async () => {
    H.benef.mockResolvedValue({ nombre: "Juan", limiteCredito: 500 });
    H.aggPrevio.mockResolvedValue({ _sum: { saldoPendiente: 100 } });
    H.sumaHoy.mockImplementation((async (q: { _sum: Record<string, boolean> }) =>
      q._sum.saldoPendiente ? { _sum: { saldoPendiente: 400 } } : { _sum: { montoAdelantado: 0 } }) as never);
    await expect(AdelantosDB.create("t1", { ...DATOS, montoAdelantado: 200 })).rejects.toThrow(/Supera el límite de crédito/);
    expect(H.lock.mock.invocationCallOrder[0]).toBeLessThan(H.sumaHoy.mock.invocationCallOrder[0]);
    expect(H.txCreate).not.toHaveBeenCalled();
  });
});
