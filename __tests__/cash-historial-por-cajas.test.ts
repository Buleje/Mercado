// @vitest-environment node
/**
 * Historial de quién abrió/cerró cada caja (2026-10-08): Cuadrar caja pedía las
 * «últimas 200 filas» de todo el rastro y los ingresos/egresos manuales dejaban
 * a las cajas viejas sin nombre. Ahora pide el de SUS cajas.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  auth: { tenantId: "t1", username: "brandon", role: "admin" } as unknown,
}));

vi.mock("@/lib/prisma", () => ({ prisma: { activityLog: { findMany: vi.fn(async () => []) } } }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn(async () => H.auth) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { GET } from "@/app/api/cash-registers/historial/route";
import { CashAuditTrailDB } from "@/lib/db/cash-audit-trail.db";
import { prisma } from "@/lib/prisma";

const findMany = vi.mocked(prisma.activityLog.findMany);
const get = (qs: string) => GET(new NextRequest(`http://localhost/api/cash-registers/historial?${qs}`));
const ultimoWhere = () => (findMany.mock.calls.at(-1)?.[0] as { where: Record<string, unknown>; take: number });

beforeEach(() => {
  vi.clearAllMocks();
  H.auth = { tenantId: "t1", username: "brandon", role: "admin" };
});

describe("CashAuditTrailDB.list", () => {
  it("con registerIds: sólo esas cajas, sólo aperturas/cierres y 4 filas por caja (mín. 200, tope 800)", async () => {
    await CashAuditTrailDB.list("t1", { registerIds: ["a", "b", "a"], soloCaja: true });
    expect(ultimoWhere().where).toEqual({ tenantId: "t1", entity: "caja", entityId: { in: ["a", "b"] } });
    expect(ultimoWhere().take).toBe(200);

    const muchas = Array.from({ length: 150 }, (_, i) => `c${i}`);
    await CashAuditTrailDB.list("t1", { registerIds: muchas });
    expect(ultimoWhere().take).toBe(600);
    expect(ultimoWhere().where.entity).toEqual({ in: ["caja", "movimiento_caja"] });

    await CashAuditTrailDB.list("t1", { registerIds: muchas, limit: 5000 });
    expect(ultimoWhere().take).toBe(600);
  });

  it("sin registerIds: como antes (50 por defecto, tope 200)", async () => {
    await CashAuditTrailDB.list("t1", { limit: 999 });
    expect(ultimoWhere()).toMatchObject({ where: { tenantId: "t1", entity: { in: ["caja", "movimiento_caja"] } }, take: 200 });
    await CashAuditTrailDB.list("t1");
    expect(ultimoWhere().take).toBe(50);
  });
});

describe("GET /api/cash-registers/historial", () => {
  it("parte los ids por coma, quita vacíos y repetidos; entity=caja = sólo aperturas/cierres", async () => {
    const res = await get("entity=caja&registerIds=a,%20b,,a");
    expect(res.status).toBe(200);
    expect(ultimoWhere().where).toEqual({ tenantId: "t1", entity: "caja", entityId: { in: ["a", "b"] } });
  });

  it("200 cuids caben; 201 cajas, un id de 51 caracteres o una entidad desconocida = 400", async () => {
    const cuid = (i: number) => `cm${String(i).padStart(23, "0")}`;
    const ok = await get(`registerIds=${Array.from({ length: 200 }, (_, i) => cuid(i)).join(",")}`);
    expect(ok.status).toBe(200);
    for (const qs of [
      `registerIds=${Array.from({ length: 201 }, (_, i) => cuid(i)).join(",")}`,
      `registerIds=${"x".repeat(51)}`,
      "entity=movimiento_caja",
      "limit=abc",
    ]) {
      expect((await get(qs)).status, qs.slice(0, 40)).toBe(400);
    }
  });

  it("el tenant sale del JWT: un id de otro negocio no trae nada de ese negocio", async () => {
    await get("registerIds=caja-de-otro", );
    expect(ultimoWhere().where.tenantId).toBe("t1");
  });

  it("sin sesión: 401", async () => {
    H.auth = NextResponse.json({ error: "No autorizado" }, { status: 401 });
    expect((await get("entity=caja")).status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });
});
