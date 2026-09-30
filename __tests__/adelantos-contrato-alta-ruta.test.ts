/**
 * POST /api/adelantos con `contratoId` (2026-09-30).
 *
 * Con HEAD falla: un permiso de otro negocio o dado de baja se guardaba SIN
 * permiso y se respondía 201, en silencio. Ahora 422 con el motivo, sin crear
 * nada ni tocar la caja. Corre la ruta real y `AdelantosDB.create` real sobre un
 * Prisma falso, para poder contar las escrituras.
 *
 * Idempotencia: la clave sólo queda reservada al insertar la fila, así que un
 * rechazo de permiso no la quema — el reintento con el permiso corregido entra.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => {
  const tx = { adelanto: { create: (...a: unknown[]) => prisma.adelanto.create(...a) } };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    adelantoBeneficiario: { findFirst: vi.fn() },
    adelanto: { aggregate: vi.fn(), create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    forestContrato: { findFirst: vi.fn() },
  };
  return {
    prisma,
    moverCaja: vi.fn(),
    auth: { tenantId: "t1", username: "brandon", role: "admin" } as { tenantId: string; username: string; role: string },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/db/forest-directorio.db", () => ({ ForestDirectorioDB: { getParte: vi.fn() } }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn(async () => H.auth) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/adelantos/movimiento-caja", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/adelantos/movimiento-caja")>();
  return {
    ...real,
    moverCaja: (...a: unknown[]) => H.moverCaja(...a),
    moverCajaEnTx: (_tx: unknown, ...a: unknown[]) => H.moverCaja(...a),
  };
});

import { POST } from "@/app/api/adelantos/route";

const ahora = new Date("2026-09-30T15:00:00.000Z");
const MENSAJE = "Ese contrato no existe o está dado de baja: elige otro o crea el adelanto sin contrato";

const fila = (p: Record<string, unknown> = {}) => ({
  id: "a1",
  tenantId: "t1",
  codigoOperacion: "ADL-2026-0001",
  reciboManual: null,
  beneficiarioId: "b1",
  modalidad: "CUENTA_CORRIENTE",
  montoAdelantado: 100,
  moneda: "PEN",
  fechaAdelanto: ahora,
  fechaVencimiento: null,
  status: "ABIERTO",
  saldoPendiente: 100,
  notas: null,
  comprobanteUrl: null,
  piesTablares: null,
  piesTablaresTipo: null,
  direccion: "DADO",
  conceptoRecibido: null,
  createdAt: ahora,
  updatedAt: ahora,
  contratoId: null,
  beneficiario: { id: "b1", nombre: "Ana", documento: null, telefono: null, notas: null, createdAt: ahora },
  entregas: [],
  entregasPactadas: [],
  ...p,
});

const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest("http://localhost/api/adelantos", {
      method: "POST",
      body: JSON.stringify({ beneficiarioId: "b1", montoAdelantado: 100, ...body }),
    }),
  );

/** Escrituras que cuentan: el INSERT del adelanto y el movimiento de caja. */
const escrituras = () => H.prisma.adelanto.create.mock.calls.length + H.moverCaja.mock.calls.length;

beforeEach(() => {
  vi.clearAllMocks();
  H.auth = { tenantId: "t1", username: "brandon", role: "admin" };
  H.prisma.adelanto.findFirst.mockReset();
  H.prisma.adelanto.findFirst.mockResolvedValue(null);
  H.prisma.adelanto.findMany.mockResolvedValue([]);
  H.prisma.adelantoBeneficiario.findFirst.mockResolvedValue({ nombre: "Ana", limiteCredito: null });
  H.prisma.forestContrato.findFirst.mockReset();
  H.prisma.adelanto.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    fila({ ...data, fechaAdelanto: ahora, fechaVencimiento: null, entregasPactadas: [], entregas: [] }),
  );
  H.moverCaja.mockResolvedValue({ sinCaja: false, movimientoId: "mov-1" });
});

describe("POST /api/adelantos — permiso (contratoId)", () => {
  it("un permiso de OTRO negocio → 422 con el mensaje, 0 escrituras y la caja intacta", async () => {
    H.prisma.forestContrato.findFirst.mockResolvedValue(null); // el WHERE con tenantId no lo encuentra
    const r = await post({ contratoId: "ctr-de-otro", metodoCaja: "efectivo" });
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ error: MENSAJE, code: "contrato_invalido" });
    expect(H.prisma.forestContrato.findFirst.mock.calls[0][0].where).toEqual({ id: "ctr-de-otro", tenantId: "t1", deletedAt: null });
    expect(escrituras()).toBe(0);
    expect(H.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("un permiso dado de baja → 422 (mismo filtro `deletedAt: null`)", async () => {
    H.prisma.forestContrato.findFirst.mockResolvedValue(null);
    const r = await post({ contratoId: "ctr-baja" });
    expect(r.status).toBe(422);
    expect(H.prisma.forestContrato.findFirst.mock.calls[0][0].where).toMatchObject({ deletedAt: null });
    expect(escrituras()).toBe(0);
  });

  it("un permiso válido → 201 y queda atado", async () => {
    H.prisma.forestContrato.findFirst.mockResolvedValue({ id: "ctr1", codigo: "19-SEC/REG-PLT-2018-020" });
    const r = await post({ contratoId: "ctr1" });
    expect(r.status).toBe(201);
    expect(H.prisma.adelanto.create.mock.calls[0][0].data).toMatchObject({ tenantId: "t1", contratoId: "ctr1" });
  });

  it.each([[{}], [{ contratoId: null }], [{ contratoId: "" }], [{ contratoId: "   " }]])(
    "%j → 201 sin permiso, sin consultar contratos",
    async (extra) => {
      const r = await post(extra);
      expect(r.status).toBe(201);
      expect(H.prisma.adelanto.create.mock.calls[0][0].data.contratoId).toBeNull();
      expect(H.prisma.forestContrato.findFirst).not.toHaveBeenCalled();
    },
  );

  it("idempotencia: el rechazo no quema la clave — el reintento con el permiso corregido entra (201)", async () => {
    const idempotencyKey = "intento-123456";
    H.prisma.forestContrato.findFirst.mockResolvedValueOnce(null);
    const malo = await post({ contratoId: "ctr-ajeno", idempotencyKey });
    expect(malo.status).toBe(422);
    expect(H.prisma.adelanto.create).not.toHaveBeenCalled();

    H.prisma.forestContrato.findFirst.mockResolvedValueOnce({ id: "ctr1", codigo: "X" });
    const bueno = await post({ contratoId: "ctr1", idempotencyKey });
    expect(bueno.status).toBe(201);
    expect(H.prisma.adelanto.create.mock.calls[0][0].data).toMatchObject({ idempotencyKey, contratoId: "ctr1" });
  });

  it("idempotencia: reintentar un alta YA hecha devuelve 200 repetido aunque el permiso se haya dado de baja después", async () => {
    const idempotencyKey = "intento-123456";
    const ya = fila({ contratoId: "ctr1", idempotencyKey, idempotencyHuella: null });
    H.prisma.adelanto.findFirst.mockResolvedValue(ya);
    H.prisma.forestContrato.findFirst.mockResolvedValue(null); // ya dado de baja
    const r = await post({ contratoId: "ctr1", idempotencyKey });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ repetido: true });
    expect(escrituras()).toBe(0);
  });

  it("la ruta sigue sin dejar pasar el permiso de otro negocio aunque mande `x-tenant-id` ajeno: el tenant sale del JWT", async () => {
    H.prisma.forestContrato.findFirst.mockResolvedValue(null);
    const r = await POST(
      new NextRequest("http://localhost/api/adelantos", {
        method: "POST",
        headers: { "x-tenant-id": "otro" },
        body: JSON.stringify({ beneficiarioId: "b1", montoAdelantado: 100, contratoId: "ctr-x" }),
      }),
    );
    expect(r.status).toBe(422);
    expect(H.prisma.forestContrato.findFirst.mock.calls[0][0].where.tenantId).toBe("t1");
  });
});
