/**
 * ADR-449 — las rutas que pidió la revisión de seguridad (28-09):
 *
 *  · `vincular_parte` decide contra qué cuenta forestal se cruza la plata: sólo
 *    admin o dueño (un manager tiene `write` en Adelantos y pasa `requireAdmin`
 *    por el bypass de gestión), y la auditoría dice la parte de antes y la nueva;
 *  · anular un adelanto con un cruce vivo → 409 `con_liquidacion`;
 *  · la misma clave de una liquidación con otro cuerpo → 422 `idempotencia_distinta`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => {
  class AdelantoConLiquidacionError extends Error {
    readonly code = "con_liquidacion";
    constructor(readonly liquidacion: string) {
      super(`Tiene un cruce o pago de la liquidación ${liquidacion}: anula esa liquidación primero.`);
    }
  }
  class LiquidacionIdempotenciaDistintaError extends Error {
    constructor(readonly codigo: string) {
      super(`Esa clave ya se usó para ${codigo} con otros montos.`);
    }
  }
  class Otro extends Error {}
  return {
    auth: { tenantId: "t1", username: "brandon", role: "admin" },
    vincular: vi.fn(),
    cancel: vi.fn(),
    crear: vi.fn(),
    getParte: vi.fn(),
    logActivity: vi.fn(async () => {}),
    AdelantoConLiquidacionError,
    LiquidacionIdempotenciaDistintaError,
    Otro,
  };
});

vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn(async () => H.auth) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: (...a: unknown[]) => H.logActivity(...(a as [])) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/db/adelantos.db", () => ({
  AdelantosDB: {
    vincularParte: (...a: unknown[]) => H.vincular(...a),
    cancel: (...a: unknown[]) => H.cancel(...a),
  },
  AdelantoConLiquidacionError: H.AdelantoConLiquidacionError,
  AdelantoNoCancelableError: H.Otro,
  DireccionNoCorregibleError: H.Otro,
  ReglaDeRecibidoError: H.Otro,
  ParteDadaDeBajaError: H.Otro,
  ParteYaVinculadaError: H.Otro,
}));
vi.mock("@/lib/db/forest-directorio.db", () => ({
  ForestDirectorioDB: { getParte: (...a: unknown[]) => H.getParte(...a) },
}));
vi.mock("@/lib/db/liquidacion-cuenta.db", () => ({
  LiquidacionCuentaDB: { crear: (...a: unknown[]) => H.crear(...a) },
  LiquidacionIdempotenciaDistintaError: H.LiquidacionIdempotenciaDistintaError,
  ComprobanteNoValidoError: H.Otro,
  CuentaForestalDeshabilitadaError: H.Otro,
  PersonaNoEncontradaError: H.Otro,
  PlanCambioError: H.Otro,
  PlanInvalidoError: H.Otro,
  SinVinculoError: H.Otro,
}));

import { PATCH as PATCH_BENEF } from "@/app/api/adelantos/beneficiarios/[id]/route";
import { PATCH as PATCH_ADELANTO } from "@/app/api/adelantos/[id]/route";
import { POST as POST_LIQ } from "@/app/api/adelantos/cuentas/liquidaciones/route";

const vincular = (forestPartyId: string | null) =>
  PATCH_BENEF(
    new NextRequest("http://localhost/api/adelantos/beneficiarios/b1", { method: "PATCH", body: JSON.stringify({ action: "vincular_parte", forestPartyId }) }),
    { params: Promise.resolve({ id: "b1" }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  H.auth = { tenantId: "t1", username: "brandon", role: "admin" };
  H.vincular.mockResolvedValue({ id: "b1", nombre: "Wasaco", forestPartyIdAnterior: "p-vieja" });
  H.getParte.mockImplementation(async (_t: string, id: string) => ({ id, nombre: id === "p-vieja" ? "OTRA SAC" : "WASACO" }));
});

describe("vincular la ficha con su parte: sólo admin o dueño", () => {
  it("un manager recibe 403 y no se toca el vínculo", async () => {
    H.auth = { tenantId: "t1", username: "gerente", role: "manager" };
    const r = await vincular("p-nueva");
    expect(r.status).toBe(403);
    expect(H.vincular).not.toHaveBeenCalled();
  });

  it("el admin vincula y la auditoría dice la parte de antes y la nueva, con nombre", async () => {
    const r = await vincular("p-nueva");
    expect(r.status).toBe(200);
    expect(H.vincular).toHaveBeenCalledWith("t1", "b1", "p-nueva");
    const detalle = String((H.logActivity.mock.calls[0] as unknown[])[2]);
    expect(detalle).toContain("parte anterior: «OTRA SAC» (p-vieja)");
    expect(detalle).toContain("parte nueva: «WASACO» (p-nueva)");
  });
});

describe("anular un adelanto con un cruce vivo", () => {
  it("409 `con_liquidacion` con el código de la liquidación", async () => {
    H.cancel.mockRejectedValue(new H.AdelantoConLiquidacionError("LIQ-2026-0009"));
    const r = await PATCH_ADELANTO(
      new NextRequest("http://localhost/api/adelantos/a1", { method: "PATCH", body: JSON.stringify({ cancelar: true }) }),
      { params: Promise.resolve({ id: "a1" }) },
    );
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ code: "con_liquidacion", liquidacion: "LIQ-2026-0009" });
  });
});

describe("liquidación: la misma clave con otro cuerpo", () => {
  it("422 `idempotencia_distinta`", async () => {
    H.crear.mockRejectedValue(new H.LiquidacionIdempotenciaDistintaError("LIQ-2026-0009"));
    const r = await POST_LIQ(
      new NextRequest("http://localhost/api/adelantos/cuentas/liquidaciones", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: "0b8f6c1e-1b1f-4e0a-9f0a-0c1d2e3f4a5b",
          persona: { beneficiarioId: "b1" },
          fecha: "2026-09-01",
          compensar: 0,
          cruzarRecibido: 3000,
          pago: null,
          huella: "h1",
        }),
      }),
    );
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ error: "idempotencia_distinta", codigo: "LIQ-2026-0009" });
  });
});
