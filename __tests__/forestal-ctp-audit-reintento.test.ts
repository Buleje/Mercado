/**
 * La auditoría del libro CTP no se pierde en silencio (23-09).
 *
 * Medido en QA: 8 «Cobrar en tanda» a la vez sobre la misma corrida dejaron 13
 * de 16 renglones, y en la carrera del arreglo del trato el que faltó fue el
 * del cargo de verdad («Cargó S/ 53.37…»). `logActivity` tenía un `catch {}`
 * mudo, así que `auditCtpEsperando` «esperaba» un renglón que no se escribía.
 * Ahora: el log dice el fallo, y la auditoría del libro reintenta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  logActivity: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  withRlsTx: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger: H.logger }));

const PARAMS = {
  tenantId: "tenant-qa",
  action: "ctp_aserrio_cobrar" as const,
  entity: "ForestCtpEntry" as const,
  entityId: "corrida-19",
  detail: "Cargó S/ 53.37 de aserrío a QA SECURITY RACE 0923 E por la Corrida N° 19",
  user: "qaadmin",
};

beforeEach(() => {
  vi.useFakeTimers();
  H.logActivity.mockReset();
  Object.values(H.logger).forEach((f) => f.mockReset());
});
afterEach(() => vi.useRealTimers());

describe("auditCtpEsperando / auditCtp — reintentan antes de rendirse", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/activity-logger", () => ({ logActivity: H.logActivity }));
  });

  it("un fallo pasajero (sin conexión con el lock tomado) entra al segundo intento", async () => {
    H.logActivity.mockRejectedValueOnce(new Error("Unable to start a transaction in the given time")).mockResolvedValue(undefined);
    const { auditCtpEsperando } = await import("@/lib/forestal/ctp-audit");
    const p = auditCtpEsperando(PARAMS);
    await vi.advanceTimersByTimeAsync(1_500);
    await p;
    expect(H.logActivity).toHaveBeenCalledTimes(2);
    /* Le pide a `logActivity` que TIRE: si no, no hay forma de saber que falló. */
    expect(H.logActivity.mock.calls[1]).toEqual([
      "ctp_aserrio_cobrar",
      "ForestCtpEntry",
      PARAMS.detail,
      "corrida-19",
      "qaadmin",
      undefined,
      "tenant-qa",
      { tirar: true },
    ]);
    expect(H.logger.error).not.toHaveBeenCalled();
  });

  it("tres fallos: no tira (auditar no tumba el cobro), pero queda un error con los intentos", async () => {
    H.logActivity.mockRejectedValue(new Error("pool agotado"));
    const { auditCtpEsperando } = await import("@/lib/forestal/ctp-audit");
    const p = auditCtpEsperando(PARAMS);
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(p).resolves.toBeUndefined();
    expect(H.logActivity).toHaveBeenCalledTimes(3);
    expect(H.logger.error).toHaveBeenCalledWith(
      "[ctp-audit] no se pudo registrar el evento",
      expect.objectContaining({ intentos: 3, entityId: "corrida-19", error: { nombre: "Error" } }),
    );
  });

  it("el de fuego-y-olvido (`auditCtp`) reintenta igual", async () => {
    H.logActivity.mockRejectedValueOnce(new Error("x")).mockResolvedValue(undefined);
    const { auditCtp } = await import("@/lib/forestal/ctp-audit");
    auditCtp(PARAMS);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(H.logActivity).toHaveBeenCalledTimes(2);
    expect(H.logger.error).not.toHaveBeenCalled();
  });
});

describe("logActivity — un renglón perdido ya no es mudo", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/activity-logger");
    vi.doMock("@/lib/prisma-rls", () => ({ withRlsTx: H.withRlsTx }));
    vi.doMock("@/lib/queue/queues", () => ({ enqueueActivityLog: vi.fn() }));
    H.withRlsTx.mockReset();
    H.withRlsTx.mockRejectedValue(new Error("Unable to start a transaction in the given time"));
  });

  it("sin la opción no tira, pero lo loguea", async () => {
    const { logActivity } = await import("@/lib/activity-logger");
    await expect(logActivity("x", "Y", "d", "id", "u", undefined, "tenant-qa")).resolves.toBeUndefined();
    expect(H.logger.warn).toHaveBeenCalledWith(
      "[activity] no se pudo escribir el renglón",
      expect.objectContaining({ action: "x", tenantId: "tenant-qa" }),
    );
  });

  it("con `tirar` el que llama se entera", async () => {
    const { logActivity } = await import("@/lib/activity-logger");
    await expect(logActivity("x", "Y", "d", "id", "u", undefined, "tenant-qa", { tirar: true })).rejects.toThrow(
      /Unable to start a transaction/,
    );
  });
});

describe("errorSinDatos (security 23-09)", () => {
  it("no copia el mensaje: el de Prisma trae los valores del renglón", async () => {
    const { errorSinDatos } = await import("@/lib/error-sin-datos");
    const e = Object.assign(new Error('Invalid value for detail: "DNI 45871236 …"'), { code: "P2009" });
    expect(errorSinDatos(e)).toEqual({ nombre: "Error", codigo: "P2009" });
    expect(JSON.stringify(errorSinDatos(e))).not.toContain("45871236");
    expect(errorSinDatos("texto suelto")).toEqual({ nombre: "string" });
  });
});
