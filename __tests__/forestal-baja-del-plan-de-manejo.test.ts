/**
 * Dar de baja un Plan de Manejo, mirado desde el lado que ESCRIBE.
 *
 * El plan sólo se podía marcar «cerrado»: seguía en el selector y se podía
 * volver a elegir. `DELETE /api/admin/forestal/plan` respondía 405. Lo que se
 * prueba acá es lo que un borrado mal hecho rompería en un libro legal:
 *
 *  1. que la baja sea LÓGICA (`deletedAt` + `isActive:false`) y jamás un
 *     `delete` físico — los asientos del LO-TH y las guías que citan el plan
 *     son lo que se declara ante la ARFFS y no pueden desaparecer con él;
 *  2. que el «¿estás seguro?» diga QUÉ cuelga, contado en la base;
 *  3. que un plan de OTRO tenant no se pueda dar de baja (el WHERE lleva
 *     `tenantId`, no un `if` posterior), y que el segundo intento sea 404;
 *  4. que quede rastro con lo que colgaba.
 *
 * Los números de las fixtures son los medidos en el tenant de QA `main` el
 * 2026-09-21 con `GET ?planId=…&usos=1` sobre el plan real `PO 12`:
 *
 * | Lo medido                    | Valor   |
 * |------------------------------|---------|
 * | especies autorizadas         | 3       |
 * | árboles del censo            | 4       |
 * | asientos del LO-TH           | 11      |
 * | guías emitidas               | 0       |
 * | permisos (contratos) atados  | 0       |
 * | volumen autorizado           | 185 m³  |
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  const estado = {
    /** El plan que la consulta encuentra, o `null` si no es de este tenant. */
    plan: null as Record<string, unknown> | null,
    /** Conteos que devuelve cada tabla, en el orden en que los pide `usosDelPlan`. */
    conteos: { especies: 3, censo: 4, asientos: 11, guias: 0, contratos: 0 },
    /** Suma de `volumenAutorizadoM3`; `null` = plan sin especies cargadas. */
    sumaAutorizada: null as number | null,
  };
  const wheres: Record<string, unknown>[] = [];
  const updates: { where: unknown; data: Record<string, unknown> }[] = [];
  const deletes: unknown[] = [];
  const audits: Record<string, unknown>[] = [];
  const invalidados: string[] = [];

  const contar =
    (clave: keyof typeof estado.conteos) =>
    async ({ where }: { where: Record<string, unknown> }) => {
      wheres.push({ modelo: clave, ...where });
      return estado.conteos[clave];
    };

  return { estado, wheres, updates, deletes, audits, invalidados, contar };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    forestPlan: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        H.wheres.push({ modelo: "planFindFirst", ...where });
        return H.estado.plan;
      },
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        H.updates.push(args);
        return { ...(H.estado.plan ?? {}), ...args.data };
      },
      delete: async (args: unknown) => {
        H.deletes.push(args);
        return null;
      },
    },
    forestPlanSpecies: {
      count: H.contar("especies"),
      aggregate: async ({ where }: { where: Record<string, unknown> }) => {
        H.wheres.push({ modelo: "aggregate", ...where });
        return { _sum: { volumenAutorizadoM3: H.estado.sumaAutorizada } };
      },
    },
    forestCensusTree: { count: H.contar("censo") },
    forestLothEntry: { count: H.contar("asientos") },
    forestGtf: { count: H.contar("guias") },
    forestContrato: { count: H.contar("contratos") },
  },
}));

vi.mock("@/lib/cache", () => ({
  invalidateByPrefix: (p: string) => {
    H.invalidados.push(p);
  },
}));

vi.mock("@/lib/forestal/ctp-audit", () => ({
  auditCtp: (p: Record<string, unknown>) => {
    H.audits.push(p);
  },
}));

const { ForestPlanDB } = await import("@/lib/db/forest-plan.db");

const PLAN = {
  id: "cmpq6yhdu000073vzx1khmlap",
  tenantId: "t-main",
  planType: "PO",
  planNumber: "PO 12",
  titularName: "Maderera El Aguajal SAC",
};

beforeEach(() => {
  H.estado.plan = { ...PLAN };
  H.estado.conteos = { especies: 3, censo: 4, asientos: 11, guias: 0, contratos: 0 };
  H.estado.sumaAutorizada = 185;
  H.wheres.length = 0;
  H.updates.length = 0;
  H.deletes.length = 0;
  H.audits.length = 0;
  H.invalidados.length = 0;
});

describe("usosDelPlan — qué cuelga del plan", () => {
  it("devuelve el contrato que consume la pantalla, con los números de PO 12", async () => {
    const usos = await ForestPlanDB.usosDelPlan("t-main", PLAN.id);
    expect(usos).toEqual({
      especies: 3,
      censo: 4,
      asientos: 11,
      guias: 0,
      contratos: 0,
      volumenAutorizadoM3: 185,
    });
  });

  it("cuenta SIEMPRE acotado al tenant, al plan y a lo no borrado", async () => {
    await ForestPlanDB.usosDelPlan("t-main", PLAN.id);
    expect(H.wheres).toHaveLength(6); // 5 conteos + la suma
    for (const w of H.wheres) {
      expect(w.tenantId).toBe("t-main");
      expect(w.planId).toBe(PLAN.id);
      expect(w.deletedAt).toBeNull();
    }
  });

  it("sin especies cargadas el volumen es null, no 0 (desconocido ≠ nada autorizado)", async () => {
    H.estado.conteos = { especies: 0, censo: 0, asientos: 0, guias: 0, contratos: 0 };
    H.estado.sumaAutorizada = null;
    const usos = await ForestPlanDB.usosDelPlan("t-main", PLAN.id);
    expect(usos.volumenAutorizadoM3).toBeNull();
    expect(usos.especies).toBe(0);
  });

  it("exige tenantId", async () => {
    await expect(ForestPlanDB.usosDelPlan("", PLAN.id)).rejects.toThrow("tenantId is required");
  });
});

describe("eliminarPlan — baja lógica auditada", () => {
  it("marca deletedAt e isActive:false, y NUNCA borra físico", async () => {
    await ForestPlanDB.eliminarPlan("t-main", PLAN.id, "qaadmin");
    expect(H.deletes).toHaveLength(0);
    expect(H.updates).toHaveLength(1);
    expect(H.updates[0].data.isActive).toBe(false);
    expect(H.updates[0].data.deletedAt).toBeInstanceOf(Date);
    // El update también va acotado al tenant: un id ajeno no alcanza.
    expect(H.updates[0].where).toMatchObject({ id: PLAN.id, tenantId: "t-main" });
  });

  it("invalida la caché del tenant tras el write", async () => {
    await ForestPlanDB.eliminarPlan("t-main", PLAN.id, "qaadmin");
    expect(H.invalidados).toEqual(["forest-plan:t-main"]);
  });

  it("deja rastro con lo que colgaba del plan", async () => {
    await ForestPlanDB.eliminarPlan("t-main", PLAN.id, "qaadmin");
    expect(H.audits).toHaveLength(1);
    expect(H.audits[0]).toMatchObject({
      tenantId: "t-main",
      action: "ctp_plan_baja",
      entity: "ForestPlan",
      entityId: PLAN.id,
      user: "qaadmin",
    });
    // El detalle tiene que servirle a un fiscalizador sin otra consulta.
    expect(String(H.audits[0].detail)).toContain("PO 12");
    expect(String(H.audits[0].detail)).toContain("11 asientos");
  });

  it("un plan de otro tenant devuelve null y no escribe nada (404, no update a ciegas)", async () => {
    H.estado.plan = null; // el findFirst lleva tenantId en el WHERE
    const r = await ForestPlanDB.eliminarPlan("t-otro", PLAN.id, "qaadmin");
    expect(r).toBeNull();
    expect(H.updates).toHaveLength(0);
    expect(H.audits).toHaveLength(0);
    expect(H.wheres[0]).toMatchObject({ modelo: "planFindFirst", tenantId: "t-otro", deletedAt: null });
  });

  it("exige tenantId y planId", async () => {
    await expect(ForestPlanDB.eliminarPlan("", PLAN.id, "qaadmin")).rejects.toThrow("tenantId is required");
    await expect(ForestPlanDB.eliminarPlan("t-main", "", "qaadmin")).rejects.toThrow("planId is required");
  });
});
