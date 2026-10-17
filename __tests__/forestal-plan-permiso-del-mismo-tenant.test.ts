/**
 * Atar un plan a un permiso: sólo si el permiso es de ESTE negocio (ADR-426).
 *
 * `ForestPlan.contratoId` va **sin clave foránea** a propósito. El ensayo de la
 * migración mostró por qué una FK no alcanzaba: compara ids y no tenants, así
 * que habría aceptado el permiso de otro negocio sin chistar. El aislamiento de
 * este repo es app-level, y esto prueba que el guard existe y que no se saltea.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  const estado = {
    /** El contrato que la consulta encuentra; `null` = no es de este tenant o está de baja. */
    contrato: null as Record<string, unknown> | null,
  };
  const wheres: Record<string, unknown>[] = [];
  const creados: Record<string, unknown>[] = [];
  const updates: { where: unknown; data: Record<string, unknown> }[] = [];
  return { estado, wheres, creados, updates };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    forestContrato: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        H.wheres.push({ modelo: "contrato", ...where });
        return H.estado.contrato;
      },
    },
    forestPlan: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        H.creados.push(data);
        return { id: "plan-nuevo", ...data };
      },
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        H.updates.push(args);
        return { id: "plan-1", ...args.data };
      },
    },
  },
}));

vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: () => {} }));

const { ContratoAjenoError, ForestPlanDB } = await import("@/lib/db/forest-plan.db");

const base = { titularName: "Maderera El Aguajal SAC", createdBy: "qaadmin" };

beforeEach(() => {
  H.estado.contrato = null;
  H.wheres.length = 0;
  H.creados.length = 0;
  H.updates.length = 0;
});

describe("crear un plan atado a un permiso", () => {
  it("la consulta del permiso lleva el tenantId y descarta los dados de baja", async () => {
    H.estado.contrato = { id: "ctr-9" };
    await ForestPlanDB.createPlan("t-main", { ...base, contratoId: "ctr-9" });
    const w = H.wheres.find((x) => x.modelo === "contrato");
    expect(w).toMatchObject({ tenantId: "t-main", id: "ctr-9", deletedAt: null });
  });

  it("guarda el vínculo cuando el permiso es de este negocio", async () => {
    H.estado.contrato = { id: "ctr-9" };
    await ForestPlanDB.createPlan("t-main", { ...base, contratoId: "ctr-9" });
    expect(H.creados[0].contratoId).toBe("ctr-9");
  });

  it("**rompe** si el permiso es de otro negocio, en vez de guardarlo en silencio", async () => {
    H.estado.contrato = null; // la consulta con tenantId no lo encuentra
    await expect(ForestPlanDB.createPlan("t-main", { ...base, contratoId: "ctr-de-otro" })).rejects.toBeInstanceOf(
      ContratoAjenoError,
    );
    expect(H.creados).toHaveLength(0);
  });

  it("sin permiso elegido no consulta nada y guarda null", async () => {
    await ForestPlanDB.createPlan("t-main", { ...base });
    expect(H.wheres.filter((x) => x.modelo === "contrato")).toHaveLength(0);
    expect(H.creados[0].contratoId).toBeNull();
  });

  it("una cadena en blanco es «sin permiso», no un id inválido", async () => {
    await ForestPlanDB.createPlan("t-main", { ...base, contratoId: "   " });
    expect(H.creados[0].contratoId).toBeNull();
  });

  it("guarda los campos de identidad recortados, y los vacíos como null", async () => {
    await ForestPlanDB.createPlan("t-main", {
      ...base,
      alias: "  el de Puerto Inca  ",
      propietarioNombre: "Comunidad X",
      sector: "   ",
      cuenca: "Pichis",
    });
    expect(H.creados[0].alias).toBe("el de Puerto Inca");
    expect(H.creados[0].propietarioNombre).toBe("Comunidad X");
    expect(H.creados[0].sector).toBeNull();
    expect(H.creados[0].cuenca).toBe("Pichis");
  });
});

describe("editar el permiso de un plan", () => {
  it("valida antes de escribir", async () => {
    H.estado.contrato = null;
    await expect(ForestPlanDB.updatePlan("t-main", "plan-1", { contratoId: "ctr-de-otro" })).rejects.toBeInstanceOf(
      ContratoAjenoError,
    );
    expect(H.updates).toHaveLength(0);
  });

  it("soltar el permiso (null) no consulta nada y se guarda", async () => {
    await ForestPlanDB.updatePlan("t-main", "plan-1", { contratoId: null });
    expect(H.wheres.filter((x) => x.modelo === "contrato")).toHaveLength(0);
    expect(H.updates[0].data.contratoId).toBeNull();
  });

  it("el update siempre lleva el tenantId en el where", async () => {
    await ForestPlanDB.updatePlan("t-main", "plan-1", { alias: "otro apodo" });
    expect(H.updates[0].where).toMatchObject({ id: "plan-1", tenantId: "t-main" });
  });
});
