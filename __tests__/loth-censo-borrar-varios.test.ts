/**
 * Borrar varios árboles del censo (pedido de Brandon 07-10: «seleccionar varios
 * árboles y eliminarlos, o un botón directo para eliminar lo importado»).
 *
 *  - la ruta: el negocio sale del JWT, nunca del cuerpo; sin árboles elegidos
 *    → 400; el almacenero no borra; `todos` vacía el plan;
 *  - la DB: el filtro lleva negocio + plan + vivos, y los talados se cuentan
 *    pero NO se borran (son el origen de la cadena de custodia).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  borrarVarios: vi.fn(),
  updateMany: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: { forestCensusTree: { updateMany: H.updateMany, count: H.count } } }));
vi.mock("@/lib/cache", async (real) => ({ ...(await real<typeof import("@/lib/cache")>()), invalidateByPrefix: vi.fn() }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/session", async (real) => ({ ...(await real<typeof import("@/lib/session")>()), getSessionPayload: async () => H.payload }));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));

import { DELETE } from "@/app/api/admin/forestal/plan/census/route";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";

const borrar = (body: unknown) =>
  DELETE(new NextRequest("http://localhost/api/admin/forestal/plan/census", {
    method: "DELETE",
    headers: { cookie: "buleje-admin-sess=token-falso", "content-type": "application/json" },
    body: JSON.stringify(body),
  }));

beforeEach(() => {
  vi.restoreAllMocks();
  H.payload = { username: "qa-admin", role: "admin", tenantId: "t1" };
  H.updateMany.mockReset().mockResolvedValue({ count: 0 });
  H.count.mockReset().mockResolvedValue(0);
});

describe("DELETE /plan/census en bloque", () => {
  it("los elegidos: el negocio sale del JWT y no del cuerpo", async () => {
    const spy = vi.spyOn(ForestPlanDB, "softDeleteTrees").mockResolvedValue({ borrados: 2, taladosConservados: 1 });
    const r = await borrar({ planId: "P1", ids: ["a", "b", "c"], tenantId: "otro" });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, borrados: 2, taladosConservados: 1 });
    expect(spy).toHaveBeenCalledWith("t1", "P1", { ids: ["a", "b", "c"], todos: undefined }, expect.any(String));
  });

  it("«Borrar todos» manda todos: true sin ids", async () => {
    const spy = vi.spyOn(ForestPlanDB, "softDeleteTrees").mockResolvedValue({ borrados: 40, taladosConservados: 0 });
    expect((await borrar({ planId: "P1", todos: true })).status).toBe(200);
    /* El 4.º argumento es quién borra: va al historial (`ctp_plan_censo_baja`, 08-10). */
    expect(spy).toHaveBeenCalledWith("t1", "P1", { ids: undefined, todos: true }, expect.any(String));
  });

  it("sin árboles elegidos → 400 y no borra nada", async () => {
    const spy = vi.spyOn(ForestPlanDB, "softDeleteTrees");
    for (const body of [{ planId: "P1" }, { planId: "P1", ids: [] }, { ids: ["a"] }, null]) {
      expect((await borrar(body)).status).toBe(400);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("el almacenero no borra el censo", async () => {
    H.payload = { username: "qa-alm", role: "almacenero", tenantId: "t1" };
    const spy = vi.spyOn(ForestPlanDB, "softDeleteTrees");
    expect((await borrar({ planId: "P1", todos: true })).status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("ForestPlanDB.softDeleteTrees", () => {
  it("borra sólo los vivos de ESE negocio y plan, y deja los talados", async () => {
    H.updateMany.mockResolvedValue({ count: 2 });
    H.count.mockResolvedValue(1);
    const r = await ForestPlanDB.softDeleteTrees("t1", "P1", { ids: ["a", "b", "c"] });
    expect(r).toEqual({ borrados: 2, taladosConservados: 1 });
    const filtro = { tenantId: "t1", planId: "P1", deletedAt: null, id: { in: ["a", "b", "c"] } };
    expect(H.updateMany).toHaveBeenCalledWith({ where: { ...filtro, estado: { not: "talado" } }, data: { deletedAt: expect.any(Date) } });
    expect(H.count).toHaveBeenCalledWith({ where: { ...filtro, estado: "talado" } });
  });

  it("todos: el plan entero, sin lista de ids", async () => {
    await ForestPlanDB.softDeleteTrees("t1", "P1", { todos: true });
    expect(H.updateMany.mock.calls[0][0].where).toEqual({ tenantId: "t1", planId: "P1", deletedAt: null, estado: { not: "talado" } });
  });

  it("sin nada elegido no toca la base", async () => {
    expect(await ForestPlanDB.softDeleteTrees("t1", "P1", { ids: [] })).toEqual({ borrados: 0, taladosConservados: 0 });
    expect(H.updateMany).not.toHaveBeenCalled();
  });
});
