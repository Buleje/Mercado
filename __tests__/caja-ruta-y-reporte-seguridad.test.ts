/**
 * Revisión de seguridad del cambio de caja (F4, ADR-448), hallazgos 1-5:
 *
 *   1. ALTO — el cajero mandaba cualquier texto como medio de pago (el cuerpo se
 *      casteaba `as {…}`) y el reporte impreso lo escribía sin escapar en la
 *      ventana del admin. Ahora Zod en la ruta + `htmlReporteDeCaja` escapa todo.
 *   2. MEDIO — la venta del POS perdía su movimiento en silencio si la caja se
 *      cerraba en el medio (`anotarVentaEnCaja`).
 *   3. BAJO — caja cerrada en la ruta de movimientos manuales = 409, no 503.
 *   5. BAJO — la alerta de arqueo leía `expectedAmount` (vacío con la caja
 *      abierta) y nunca saltaba.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => {
  class CajaNoAbiertaError extends Error {}
  return {
    CajaNoAbiertaError,
    addMovement: vi.fn(),
    getById: vi.fn(),
    close: vi.fn(),
    assertOwnership: vi.fn(async () => true),
    createNotification: vi.fn(async (_aviso: { title: string; body: string }) => {}),
    findCurrentOpenRegister: vi.fn(),
    createMovement: vi.fn(),
    findOpenRegisterById: vi.fn(async () => ({ id: "c1" })),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

vi.mock("@/lib/require-admin", () => ({ requireAdmin: async () => ({ tenantId: "t1", username: "cajero1", role: "cajero" }) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null, getClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/logger", () => ({ logger: H.logger }));
vi.mock("@/lib/create-notification", () => ({ createNotification: H.createNotification }));
vi.mock("@/lib/mailer", () => ({ sendCashSummaryEmail: vi.fn(async () => {}) }));
vi.mock("@/lib/db/sales.db", () => ({ CashRegistersDB: { addMovement: H.addMovement, getById: H.getById, close: H.close } }));
vi.mock("@/lib/db/cash-registers-by-id.db", () => ({ CashRegisterOwnershipDB: { assertOwnership: H.assertOwnership } }));
vi.mock("@/lib/db/cash-registers-movements.db", () => ({
  CajaNoAbiertaError: H.CajaNoAbiertaError,
  CashRegistersMovementsDB: {
    findCurrentOpenRegister: H.findCurrentOpenRegister,
    createMovement: H.createMovement,
    findOpenRegisterById: H.findOpenRegisterById,
  },
}));

import { PATCH } from "@/app/api/cash-registers/[id]/route";
import { POST as crearMovimiento } from "@/app/api/cash-registers/movements/route";
import { htmlReporteDeCaja } from "@/lib/caja/reporte-impreso";
import { anotarVentaEnCaja } from "@/lib/caja/anotar-venta";
import { ConflictError } from "@/lib/api-error";

const MALO = `<img src=x onerror="fetch('/api/x?c='+document.cookie)">`;
const patch = (body: unknown) =>
  PATCH(new NextRequest("http://localhost/api/cash-registers/c1", { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "c1" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  H.addMovement.mockResolvedValue({ id: "m1" });
  H.assertOwnership.mockResolvedValue(true);
});

describe("1 · la ruta de caja valida el cuerpo (Zod)", () => {
  it("un medio de pago con HTML → 400 y no se anota nada", async () => {
    const r = await patch({ action: "movement", type: "egreso", amount: 10, method: MALO, description: "x" });
    expect(r.status).toBe(400);
    expect(H.addMovement).not.toHaveBeenCalled();
  });

  it("monto negativo, cero, sin tope o acción desconocida → 400", async () => {
    for (const body of [
      { action: "movement", type: "egreso", amount: -50, method: "efectivo" },
      { action: "movement", type: "ingreso", amount: 0, method: "efectivo" },
      { action: "movement", type: "ingreso", amount: 50_000_000, method: "efectivo" },
      { action: "movement", type: "venta", amount: 5, method: "efectivo" },
      { action: "close", closingAmount: -1 },
      { action: "arqueo", closingAmount: "mucho" },
      { action: "borrar" },
    ]) {
      expect((await patch(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(H.addMovement).not.toHaveBeenCalled();
    expect(H.close).not.toHaveBeenCalled();
  });

  it("un movimiento válido pasa con el tenant del JWT", async () => {
    const r = await patch({ action: "movement", type: "egreso", amount: 12.5, method: "yape", description: "Pago flete" });
    expect(r.status).toBe(201);
    expect(H.addMovement).toHaveBeenCalledWith("c1", { type: "egreso", amount: 12.5, method: "yape", description: "Pago flete", saleId: undefined }, "t1");
  });
});

describe("1 · el reporte impreso escapa todo lo que viene de la base", () => {
  it("un medio o un texto con HTML sale como texto", () => {
    const html = htmlReporteDeCaja(
      {
        openingAmount: 100,
        movements: [
          { type: "venta", method: MALO, amount: 20 },
          { type: "egreso", method: "<script>alert(1)</script>", amount: 5 },
        ],
      },
      { fecha: "<b>hoy</b>", hora: "08:00" },
      (n) => `S/ ${n.toFixed(2)}`,
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>hoy</b>");
    expect(html).toContain("&lt;img");
    /* Y los números son los de la pantalla: 100 + 0 − 0 (la venta y el egreso no son en efectivo). */
    expect(html).toContain("Efectivo esperado: S&#x2F; 100.00");
  });
});

describe("2 · la venta del POS no pierde su movimiento en silencio", () => {
  const lineas = [
    { method: "efectivo", amount: 60 },
    { method: "yape", amount: 40 },
  ];

  it("si la caja se cierra a mitad, relee la abierta y reintenta lo que falta", async () => {
    H.findCurrentOpenRegister.mockResolvedValueOnce({ id: "vieja" }).mockResolvedValueOnce({ id: "nueva" });
    H.addMovement.mockResolvedValueOnce({ id: "m1" }).mockRejectedValueOnce(new H.CajaNoAbiertaError()).mockResolvedValueOnce({ id: "m2" });
    const r = await anotarVentaEnCaja("t1", "s1", lineas);
    expect(r).toEqual({ sinAnotar: [], motivo: null });
    expect(H.addMovement.mock.calls.map((c) => [c[0], c[1].method, c[2]])).toEqual([
      ["vieja", "efectivo", "t1"],
      ["vieja", "yape", "t1"],
      ["nueva", "yape", "t1"],
    ]);
  });

  it("si no hay otra caja, devuelve lo que no entró y avisa a Sentry", async () => {
    H.findCurrentOpenRegister.mockResolvedValueOnce({ id: "vieja" }).mockResolvedValueOnce(null);
    H.addMovement.mockResolvedValueOnce({ id: "m1" }).mockRejectedValueOnce(new H.CajaNoAbiertaError());
    const r = await anotarVentaEnCaja("t1", "s1", lineas);
    expect(r).toEqual({ sinAnotar: [{ method: "yape", amount: 40 }], motivo: "se_cerro" });
    expect(H.logger.error).toHaveBeenCalled();
  });

  it("sin caja abierta desde el principio: lo dice, sin alerta (vender sin caja es un modo de uso)", async () => {
    H.findCurrentOpenRegister.mockResolvedValueOnce(null);
    const r = await anotarVentaEnCaja("t1", "s1", lineas);
    expect(r).toEqual({ sinAnotar: lineas, motivo: "sin_caja" });
    expect(H.logger.error).not.toHaveBeenCalled();
    expect(H.logger.warn).toHaveBeenCalled();
  });
});

describe("3 · movimiento manual en caja cerrada = 409 en español", () => {
  it("no un 503 «Database error»", async () => {
    H.createMovement.mockRejectedValueOnce(new ConflictError("La caja ya está cerrada: el movimiento no se anotó. Abre una caja y vuelve a intentarlo."));
    const r = await crearMovimiento(
      new NextRequest("http://localhost/api/cash-registers/movements", { method: "POST", body: JSON.stringify({ cashRegisterId: "c1", type: "egreso", amount: 10 }) }),
    );
    expect(r.status).toBe(409);
    expect(JSON.stringify(await r.json())).toContain("La caja ya está cerrada");
    expect(H.createMovement).toHaveBeenCalledWith("t1", expect.objectContaining({ cashRegisterId: "c1" }));
  });
});

describe("5 · la alerta de arqueo salta con la caja abierta", () => {
  it("contado 20 contra esperado 150 → «Faltante en arqueo»", async () => {
    H.getById.mockResolvedValue({
      id: "c1",
      openingAmount: 100,
      movements: [
        { type: "venta", method: "efectivo", amount: 50 },
        { type: "egreso", method: "yape", amount: 500 },
      ],
    });
    const r = await patch({ action: "arqueo", closingAmount: 20, notes: "conteo" });
    expect(r.status).toBe(201);
    expect(H.createNotification).toHaveBeenCalledTimes(1);
    const n = H.createNotification.mock.calls[0][0];
    expect(n.title).toBe("Faltante en arqueo");
    /* El Yape no cuenta: esperado 150, no −350. */
    expect(n.body).toContain("esperado S/150.00");
  });
});
