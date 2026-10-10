/**
 * El reverso del guard: un permiso no se ata a un plan de otro negocio (ADR-426).
 *
 * `ForestContrato.planId` y `ForestPlan.contratoId` son refs **app-level**: sin
 * clave foránea, porque una FK compara ids y no tenants (medido en el ensayo de
 * la migración). El lado del plan ya estaba cubierto; esto cubre el otro, que
 * es el que quedaba abierto a un PATCH hecho a mano contra la API.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  const estado = {
    /** El plan que encuentra la consulta; `null` = no es de este tenant o está de baja. */
    plan: null as Record<string, unknown> | null,
    /** El contrato que se está editando. */
    contrato: { id: "ctr-1", codigo: "CON-25-UCA-0207" } as Record<string, unknown> | null,
    /** OTRO permiso vivo que ya tiene el plan (la consulta lleva `planId` en el where). */
    ocupante: null as Record<string, unknown> | null,
  };
  const wheres: Record<string, unknown>[] = [];
  const updates: { where: unknown; data: Record<string, unknown> }[] = [];
  const creados: Record<string, unknown>[] = [];
  return { estado, wheres, updates, creados };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    forestPlan: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        H.wheres.push({ modelo: "plan", ...where });
        return H.estado.plan;
      },
    },
    forestContrato: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (where.planId !== undefined) {
          H.wheres.push({ modelo: "ocupante", ...where });
          return H.estado.ocupante;
        }
        return H.estado.contrato;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        H.creados.push(data);
        return { id: "ctr-nuevo", createdAt: new Date(), estado: "vigente", isActive: true, ...data };
      },
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        H.updates.push(args);
        return { ...(H.estado.contrato ?? {}), createdAt: new Date(), estado: "vigente", isActive: true, ...args.data };
      },
    },
  },
}));

vi.mock("@/lib/cache", () => ({ invalidateByPrefix: async () => {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: () => {} }));

const { ForestContratoDB, PlanAjenoError, PlanOcupadoError } = await import("@/lib/db/forest-contrato.db");

beforeEach(() => {
  H.estado.plan = null;
  H.estado.contrato = { id: "ctr-1", codigo: "CON-25-UCA-0207" };
  H.estado.ocupante = null;
  H.wheres.length = 0;
  H.updates.length = 0;
  H.creados.length = 0;
});

describe("atar un permiso a un plan", () => {
  it("la consulta del plan lleva el tenantId y descarta los dados de baja", async () => {
    H.estado.plan = { id: "plan-9" };
    await ForestContratoDB.actualizar("t-main", "ctr-1", { planId: "plan-9" }, "qa");
    expect(H.wheres.find((w) => w.modelo === "plan")).toMatchObject({
      tenantId: "t-main",
      id: "plan-9",
      deletedAt: null,
    });
  });

  it("**rompe** si el plan es de otro negocio, antes de escribir", async () => {
    H.estado.plan = null;
    await expect(
      ForestContratoDB.actualizar("t-main", "ctr-1", { planId: "plan-de-otro" }, "qa"),
    ).rejects.toBeInstanceOf(PlanAjenoError);
    expect(H.updates).toHaveLength(0);
  });

  it("soltar el plan (null) no consulta nada", async () => {
    await ForestContratoDB.actualizar("t-main", "ctr-1", { planId: null }, "qa");
    expect(H.wheres.filter((w) => w.modelo === "plan")).toHaveLength(0);
    expect(H.updates).toHaveLength(1);
  });

  it("el alta valida igual que la edición", async () => {
    H.estado.plan = null;
    await expect(
      ForestContratoDB.crear("t-main", { codigo: "NUEVO-1", titularNombre: "X", planId: "plan-de-otro" }, "qa"),
    ).rejects.toBeInstanceOf(PlanAjenoError);
    expect(H.creados).toHaveLength(0);
  });

  it("un alta sin plan no consulta nada y entra", async () => {
    await ForestContratoDB.crear("t-main", { codigo: "NUEVO-2", titularNombre: "X" }, "qa");
    expect(H.wheres.filter((w) => w.modelo === "plan")).toHaveLength(0);
    expect(H.creados).toHaveLength(1);
  });
});

describe("un plan con OTRO permiso vivo no se vuelve a atar", () => {
  it("**rompe** con el código del permiso dueño, antes de escribir", async () => {
    H.estado.plan = { id: "plan-9" };
    H.estado.ocupante = { id: "ctr-2", codigo: "CON-25-PAS-0001" };
    const err = await ForestContratoDB.actualizar("t-main", "ctr-1", { planId: "plan-9" }, "qa").catch((e) => e);
    expect(err).toBeInstanceOf(PlanOcupadoError);
    expect(err.message).toBe("Ese plan ya está unido al permiso CON-25-PAS-0001.");
    expect(H.updates).toHaveLength(0);
  });

  it("la consulta lleva el tenant, descarta bajas y excluye al propio permiso", async () => {
    H.estado.plan = { id: "plan-9" };
    await ForestContratoDB.actualizar("t-main", "ctr-1", { planId: "plan-9" }, "qa");
    expect(H.wheres.find((w) => w.modelo === "ocupante")).toMatchObject({
      tenantId: "t-main",
      planId: "plan-9",
      deletedAt: null,
      id: { not: "ctr-1" },
    });
    expect(H.updates).toHaveLength(1);
  });

  it("el alta también lo rechaza; soltar el plan (null) no consulta", async () => {
    H.estado.plan = { id: "plan-9" };
    H.estado.ocupante = { id: "ctr-2", codigo: "CON-25-PAS-0001" };
    await expect(
      ForestContratoDB.crear("t-main", { codigo: "NUEVO-3", titularNombre: "X", planId: "plan-9" }, "qa"),
    ).rejects.toBeInstanceOf(PlanOcupadoError);
    expect(H.creados).toHaveLength(0);
    await ForestContratoDB.actualizar("t-main", "ctr-1", { planId: null }, "qa");
    expect(H.wheres.filter((w) => w.modelo === "ocupante")).toHaveLength(1); // sólo el del alta
  });
});
