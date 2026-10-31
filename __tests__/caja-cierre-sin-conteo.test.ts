// @vitest-environment node
/**
 * Cierres de caja donde NADIE contó el cajón (2026-10-08).
 *
 * El cron de turnos olvidados cerraba turno y caja con `inicio + ventasTotal`,
 * con Yape y tarjeta dentro: `CashRegister.difference` quedaba con un
 * «sobrante» inventado que Arqueo, Caja y el aviso DIFERENCIA_CAJA leían como
 * real. Ahora cierra SIN conteo, con la misma marca que `close-shift` sin
 * monto, y `close-shift` acepta un monto contado opcional.
 *
 *  1. Las notas de los cierres sin conteo las reconocen sus dos lectores
 *     (`esCierreAutomatico` de la caja y `cifrasDeCajaDelTurno` del turno);
 *     las de un cierre CON conteo, no.
 *  2. close-shift: sin cuerpo = sin conteo (como siempre); con monto = arqueo
 *     real; monto inválido o cuerpo que no es JSON = 400; carrera = 409;
 *     siempre con el tenant del JWT.
 *  3. El cron: turno con el esperado EN EFECTIVO (no inicio + ventas), caja
 *     cerrada con `null` (esperado bajo el lock), registro «Cerrar caja» por
 *     «sistema»; no cierra una caja que usa otro turno vivo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  auth: { tenantId: "t1", username: "brandon", role: "admin" } as unknown,
  open: null as null | Record<string, unknown>,
  closeResult: undefined as undefined | null | Record<string, unknown>,
  zombies: [] as Record<string, unknown>[],
  cajas: new Map<string, Record<string, unknown>>(),
  turnosVivosEnLaCaja: 0,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    turno: {
      findMany: vi.fn(async () => H.zombies),
      count: vi.fn(async () => H.turnosVivosEnLaCaja),
    },
  },
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn(async () => H.auth) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/cron/health-tracker", () => ({ trackCronExecution: vi.fn(async () => {}) }));
vi.mock("@/lib/timing-safe", () => ({ timingSafeCompare: (a: string, b: string) => a === b }));
vi.mock("@/lib/jsondb", () => ({
  CashRegistersDB: {
    getOpen: vi.fn(async () => H.open),
    getById: vi.fn(async (_t: string, id: string) => H.cajas.get(id) ?? null),
    close: vi.fn(async (_t: string, id: string, contado: number | null, notes?: string) => {
      if (H.closeResult !== undefined) return H.closeResult;
      const esperado = 100;
      const c = contado ?? esperado;
      return { id, status: "cerrada", expectedAmount: esperado, closingAmount: c, difference: Math.round((c - esperado) * 100) / 100, notes };
    }),
  },
}));
vi.mock("@/lib/db/admin-users.db", () => ({
  AdminUsersDB: {
    resolveIdByUsername: vi.fn(async () => "u1"),
    getUsernameById: vi.fn(async () => "brandon"),
  },
}));
vi.mock("@/lib/db/turnos.db", async () => {
  const real = await vi.importActual<typeof import("@/lib/db/turnos.db")>("@/lib/db/turnos.db");
  return {
    ...real,
    TurnosDB: {
      getActivo: vi.fn(async () => ({ id: "turno-1", abrioEn: "2026-10-08T12:00:00.000Z" })),
      cerrar: vi.fn(async (id: string) => ({ id })),
    },
  };
});
vi.mock("@/lib/db/cash-shift-sales.db", () => ({
  CashShiftSalesDB: { aggregateByCashierShift: vi.fn(async () => 340) },
}));

import { POST as closeShift } from "@/app/api/cash-registers/close-shift/route";
import { GET as cronZombie } from "@/app/api/cron/turnos-zombie-close/route";
import { CashRegistersDB } from "@/lib/jsondb";
import { TurnosDB, cifrasDeCajaDelTurno } from "@/lib/db/turnos.db";
import { logActivity } from "@/lib/activity-logger";
import { esCierreAutomatico, veredictoArqueo } from "@/lib/caja/arqueo-veredicto";
import { armarParteDelDia } from "@/lib/caja/parte-del-dia";
import {
  NOTA_CAJA_CERRAR_SIN_CONTEO,
  NOTA_CAJA_ZOMBIE,
  NOTA_TURNO_CERRAR_SIN_CONTEO,
  NOTA_TURNO_ZOMBIE,
  notaCajaCerrarConConteo,
  notaTurnoCerrarConConteo,
} from "@/lib/caja/cierre-sin-conteo";

const close = vi.mocked(CashRegistersDB.close);
const cerrarTurno = vi.mocked(TurnosDB.cerrar);

function post(body?: string, headers: Record<string, string> = {}) {
  return closeShift(
    new NextRequest("http://localhost/api/cash-registers/close-shift", {
      method: "POST",
      ...(body !== undefined ? { body } : {}),
      headers,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  H.auth = { tenantId: "t1", username: "brandon", role: "admin" };
  H.open = { id: "caja-1", openingAmount: 50, movements: [], status: "abierta" };
  H.closeResult = undefined;
  H.zombies = [];
  H.cajas = new Map();
  H.turnosVivosEnLaCaja = 0;
  process.env.CRON_SECRET = "s3creto";
});

describe("1 · las notas sin conteo las reconocen sus dos lectores", () => {
  const turno = (notas: string) => cifrasDeCajaDelTurno(
    { cerroEn: new Date("2026-10-08T20:00:00Z"), notas },
    { closedAt: new Date("2026-10-08T20:00:30Z"), expectedAmount: 100, difference: -5 },
  );

  it("caja: el arqueo dice «sin conteo», nunca «conforme», aunque la diferencia sea 0", () => {
    for (const nota of [NOTA_CAJA_ZOMBIE, NOTA_CAJA_CERRAR_SIN_CONTEO, "Cierre automático del sistema"]) {
      expect(esCierreAutomatico(nota), nota).toBe(true);
      expect(veredictoArqueo({ expectedAmount: 100, countedAmount: 100, difference: 0, notes: nota, closedAt: "2026-10-08" })).toBe("sin_conteo");
      // Tercer lector: el parte del día busca la marca como PREFIJO (más estricto que el arqueo).
      expect(armarParteDelDia({ id: "c", status: "cerrada", openedAt: "2026-10-08T10:00:00Z", openingAmount: 100, closingAmount: 100, expectedAmount: 100, notes: nota, movements: [] }, []).contado, nota).toBeNull();
    }
    expect(esCierreAutomatico(notaCajaCerrarConConteo("Conteo manual | Total efectivo: S/95.00"))).toBe(false);
    expect(esCierreAutomatico(notaCajaCerrarConConteo())).toBe(false);
  });

  it("turno: sin conteo = sin diferencia; con conteo = la diferencia de la caja", () => {
    expect(turno(NOTA_TURNO_ZOMBIE)).toEqual({ esperado: null, diferencia: null, cerradoPorSistema: true });
    expect(turno(NOTA_TURNO_CERRAR_SIN_CONTEO).cerradoPorSistema).toBe(true);
    expect(turno(notaTurnoCerrarConConteo(95, "faltó un vuelto"))).toEqual({ esperado: 100, diferencia: -5, cerradoPorSistema: false });
  });
});

describe("2 · POST /api/cash-registers/close-shift", () => {
  it("sin cuerpo: cierre SIN conteo — el esperado se calcula bajo el lock (null) y lleva la marca", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(close).toHaveBeenCalledWith("t1", "caja-1", null, NOTA_CAJA_CERRAR_SIN_CONTEO);
    expect(cerrarTurno).toHaveBeenCalledWith("turno-1", "t1", { cierreEfectivo: 100, ventasTotal: 340, notas: NOTA_TURNO_CERRAR_SIN_CONTEO });
    const json = await res.json();
    expect(json).toMatchObject({ success: true, sinConteo: true, conteo: null, turno: { id: "turno-1", ventasTotal: 340 } });
    expect(vi.mocked(logActivity)).toHaveBeenCalledWith("Cerrar", "caja", expect.stringContaining("sin conteo"), "caja-1", "brandon", undefined, "t1");
  });

  it("`{}` y `closingAmount: null` también son sin conteo", async () => {
    await post("{}", { "content-type": "application/json" });
    await post(JSON.stringify({ closingAmount: null, notes: null }));
    expect(close.mock.calls.map((c) => c[2])).toEqual([null, null]);
  });

  it("con monto: arqueo real — diferencia contado − esperado y el turno cierra con lo contado", async () => {
    const res = await post(JSON.stringify({ closingAmount: 95, notes: "faltó un vuelto" }));
    expect(res.status).toBe(200);
    expect(close).toHaveBeenCalledWith("t1", "caja-1", 95, "faltó un vuelto");
    expect(cerrarTurno).toHaveBeenCalledWith("turno-1", "t1", {
      cierreEfectivo: 95,
      ventasTotal: 340,
      notas: notaTurnoCerrarConConteo(95, "faltó un vuelto"),
    });
    const json = await res.json();
    expect(json).toMatchObject({ sinConteo: false, conteo: { contado: 95, esperado: 100, diferencia: -5 } });
    expect(esCierreAutomatico(close.mock.calls[0][3])).toBe(false);
  });

  it("monto inválido o cuerpo que no es JSON: 400 sin cerrar nada", async () => {
    for (const body of [JSON.stringify({ closingAmount: -5 }), JSON.stringify({ closingAmount: 10_000_001 }), JSON.stringify({ closingAmount: "95" }), "monto=95", "[1]"]) {
      const res = await post(body);
      expect(res.status, body).toBe(400);
    }
    expect(close).not.toHaveBeenCalled();
  });

  it("otro cierre ganó la carrera: 409 y el turno queda como estaba", async () => {
    H.closeResult = null;
    const res = await post(JSON.stringify({ closingAmount: 95 }));
    expect(res.status).toBe(409);
    expect(cerrarTurno).not.toHaveBeenCalled();
  });

  it("sin caja abierta: 200 con el mensaje de siempre", async () => {
    H.open = null;
    const res = await post(JSON.stringify({ closingAmount: 95 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: "No hay caja abierta" });
  });

  it("sin sesión: 401; y el tenant sale del JWT, nunca de un header", async () => {
    H.auth = NextResponse.json({ error: "No autorizado" }, { status: 401 });
    expect((await post()).status).toBe(401);
    expect(close).not.toHaveBeenCalled();

    H.auth = { tenantId: "t1", username: "brandon", role: "admin" };
    await post(undefined, { "x-tenant-id": "otro-negocio" });
    expect(vi.mocked(CashRegistersDB.getOpen)).toHaveBeenLastCalledWith("t1");
    expect(close.mock.calls.at(-1)?.[0]).toBe("t1");
  });
});

describe("3 · cron de turnos olvidados", () => {
  const zombie = (over: Record<string, unknown> = {}) => ({
    id: "z1", tenantId: "t9", adminUserId: "u9", cashRegisterId: "caja-9", abrioEn: new Date("2026-10-07T08:00:00Z"), ...over,
  });
  const cajaAbierta = {
    id: "caja-9", status: "abierta", openingAmount: 100,
    movements: [
      { type: "venta", method: "efectivo", amount: 40 },
      { type: "venta", method: "yape", amount: 300 },
    ],
  };
  const llamar = (secret = "s3creto") =>
    cronZombie(new NextRequest("http://localhost/api/cron/turnos-zombie-close", { headers: { authorization: `Bearer ${secret}` } }));

  it("sin el secreto: 401", async () => {
    expect((await llamar("otro")).status).toBe(401);
  });

  it("turno con el esperado EN EFECTIVO (140), no inicio + ventas (440); caja cerrada sin conteo por el sistema", async () => {
    H.zombies = [zombie()];
    H.cajas.set("caja-9", cajaAbierta);
    const res = await llamar();
    expect(await res.json()).toMatchObject({ ok: true, closed: 1, cajasCerradas: 1 });
    expect(cerrarTurno).toHaveBeenCalledWith("z1", "t9", { cierreEfectivo: 140, ventasTotal: 340, notas: NOTA_TURNO_ZOMBIE });
    expect(close).toHaveBeenCalledWith("t9", "caja-9", null, NOTA_CAJA_ZOMBIE);
    expect(vi.mocked(logActivity)).toHaveBeenCalledWith("Cerrar", "caja", expect.stringContaining("sin conteo"), "caja-9", "sistema", undefined, "t9");
  });

  it("la caja la usa otro turno vivo: se cierra el turno olvidado, la caja NO", async () => {
    H.zombies = [zombie()];
    H.cajas.set("caja-9", cajaAbierta);
    H.turnosVivosEnLaCaja = 1;
    const res = await llamar();
    expect(await res.json()).toMatchObject({ closed: 1, cajasCerradas: 0 });
    expect(close).not.toHaveBeenCalled();
  });

  it("sin caja abierta: el turno cierra con cierreEfectivo null (nadie contó, no hay esperado)", async () => {
    H.zombies = [zombie({ cashRegisterId: null }), zombie({ id: "z2", cashRegisterId: "caja-cerrada" })];
    H.cajas.set("caja-cerrada", { ...cajaAbierta, id: "caja-cerrada", status: "cerrada" });
    await llamar();
    expect(cerrarTurno.mock.calls.map((c) => c[2].cierreEfectivo)).toEqual([null, null]);
    expect(close).not.toHaveBeenCalled();
  });
});
