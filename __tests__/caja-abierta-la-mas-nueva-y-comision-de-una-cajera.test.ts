/**
 * Dos consultas de plata que traían de más:
 *  - `CashRegistersDB.getOpen` elegía «una» caja abierta sin orden, mientras la
 *    pantalla muestra la más nueva (`GET /api/cash-registers?limit=1`, openedAt
 *    desc): con dos abiertas, el fondo mostrado no era el de la caja donde se
 *    guardaba.
 *  - La comisión estimada del POS cargaba las ventas de TODAS las cajeras para
 *    calcular la de una (`CommissionsDB.cashierSummary` sin filtro de cajera).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  cajaFindFirst: vi.fn(),
  saleFindMany: vi.fn(),
  returnFindMany: vi.fn(),
  adminUserFindMany: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    cashRegister: { findFirst: m.cajaFindFirst },
    sale: { findMany: m.saleFindMany },
    return: { findMany: m.returnFindMany },
    adminUser: { findMany: m.adminUserFindMany },
  },
}));
vi.mock("@/lib/prisma-rls", () => ({ withRlsTx: vi.fn() }));
vi.mock("@/lib/cache", () => ({ invalidate: vi.fn(), getOrSet: (_k: string, _t: number, fn: () => unknown) => fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { CashRegistersDB } from "@/lib/db/sales.db";
import { CommissionsDB } from "@/lib/db/commissions.db";

beforeEach(() => {
  vi.clearAllMocks();
  m.cajaFindFirst.mockResolvedValue(null);
  m.saleFindMany.mockResolvedValue([]);
  m.returnFindMany.mockResolvedValue([]);
  m.adminUserFindMany.mockResolvedValue([]);
});

describe("CashRegistersDB.getOpen", () => {
  it("la caja abierta MÁS NUEVA del negocio, la misma que muestra la pantalla", async () => {
    await CashRegistersDB.getOpen("t-bodega");
    const arg = m.cajaFindFirst.mock.calls[0][0];
    expect(arg.where).toEqual({ tenantId: "t-bodega", status: "abierta" });
    expect(arg.orderBy).toEqual({ openedAt: "desc" });
  });
});

describe("CommissionsDB.cashierSummary", () => {
  it("con cashierIds trae sólo las ventas de esa cajera (por sus dos formas de id)", async () => {
    const desde = new Date("2026-10-10T13:00:00.000Z");
    await CommissionsDB.cashierSummary("t-bodega", { from: desde, cashierIds: ["u-rosa", "rosa"] });
    expect(m.saleFindMany.mock.calls[0][0].where).toEqual({
      tenantId: "t-bodega",
      cashierId: { in: ["u-rosa", "rosa"] },
      createdAt: { gte: desde },
    });
  });

  it("sin cashierIds sigue como antes (Comisiones: todas las cajeras)", async () => {
    await CommissionsDB.cashierSummary("t-bodega", {});
    expect(m.saleFindMany.mock.calls[0][0].where).toEqual({ tenantId: "t-bodega", cashierId: { not: null } });
  });
});
