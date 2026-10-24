// @vitest-environment node
/**
 * Aviso de «estamos cerrados»: un aviso que Meta rechazó no cuenta como
 * avisado (revisión 11-10). Antes `ultimoAviso` contaba también los fallidos y
 * el cliente se quedaba 12 h sin el aviso; y la reserva del tramo
 * (`waMessageId` único) seguía tomada. Ahora el fallido libera la reserva y
 * el próximo mensaje lo reintenta, hasta `FALLIDOS_TOPE` seguidos.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Fila = { createdAt: Date; status: string };

const H = vi.hoisted(() => ({
  filas: [] as Fila[],
  findMany: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsAppMessage: {
      findMany: (...a: unknown[]) => H.findMany(...a),
      findFirst: (...a: unknown[]) => H.findFirst(...a),
      updateMany: (...a: unknown[]) => H.updateMany(...a),
    },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn() }));
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: {} }));
vi.mock("@/lib/db/whatsapp-messages.db", () => ({ WhatsAppMessagesDB: {} }));

import { FALLIDOS_TOPE, WhatsAppFueraDeHorarioDB } from "@/lib/db/whatsapp-fuera-de-horario.db";

const AHORA = new Date("2026-10-11T03:00:00Z");
const hace = (min: number) => new Date(AHORA.getTime() - min * 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  // La base devuelve las filas del más nuevo al más viejo, hasta `take`.
  H.findMany.mockImplementation(async ({ take }: { take: number }) =>
    [...H.filas].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, take),
  );
});

describe("ultimoAviso: los fallidos no cuentan", () => {
  it("sólo un fallido hace 10 min → null (el próximo mensaje lo reintenta)", async () => {
    H.filas = [{ createdAt: hace(10), status: "failed" }];
    expect(await WhatsAppFueraDeHorarioDB.ultimoAviso("t1", "51999", AHORA)).toBeNull();
  });

  it("uno mandado y después un fallido → cuenta el mandado", async () => {
    H.filas = [
      { createdAt: hace(60), status: "sent" },
      { createdAt: hace(10), status: "failed" },
    ];
    expect(await WhatsAppFueraDeHorarioDB.ultimoAviso("t1", "51999", AHORA)).toEqual(hace(60));
  });

  it(`${FALLIDOS_TOPE} fallidos seguidos → se deja de intentar (un token vencido no llena la bandeja)`, async () => {
    H.filas = Array.from({ length: FALLIDOS_TOPE }, (_, i) => ({ createdAt: hace(10 + i), status: "failed" }));
    expect(await WhatsAppFueraDeHorarioDB.ultimoAviso("t1", "51999", AHORA)).toEqual(hace(10));
  });

  it("filtra por negocio, cliente, salida y las últimas 12 h", async () => {
    H.filas = [];
    await WhatsAppFueraDeHorarioDB.ultimoAviso("t1", "51999", AHORA);
    const { where } = H.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(where).toMatchObject({
      tenantId: "t1",
      customerPhone: "51999",
      direction: "out",
      waMessageId: { startsWith: "aviso-cerrado:t1:" },
      createdAt: { gte: new Date(AHORA.getTime() - 12 * 3_600_000) },
    });
  });
});

describe("marcarFallido libera la reserva del tramo", () => {
  it("pasa a failed y el waMessageId a «…:fallo:<id>» (sigue con el prefijo)", async () => {
    H.findFirst.mockResolvedValue({ waMessageId: "aviso-cerrado:t1:51999:42" });
    await WhatsAppFueraDeHorarioDB.marcarFallido("t1", "m1");
    expect(H.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "m1", tenantId: "t1" } }));
    expect(H.updateMany).toHaveBeenCalledWith({
      where: { id: "m1", tenantId: "t1" },
      data: { status: "failed", waMessageId: "aviso-cerrado:t1:51999:42:fallo:m1" },
    });
  });

  it("de otro negocio (no lo encuentra) → no cambia el waMessageId y el WHERE lleva el tenant", async () => {
    H.findFirst.mockResolvedValue(null);
    await WhatsAppFueraDeHorarioDB.marcarFallido("t2", "m1");
    expect(H.updateMany).toHaveBeenCalledWith({ where: { id: "m1", tenantId: "t2" }, data: { status: "failed" } });
  });
});
