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
    /** Lo que `bajaDelPlan` desata de sus guías (25-10) y las que deja por mes cerrado. */
    desatado: { guias: 0, despachos: 0, trozados: 0, avisos: [] as string[] },
    enMesCerrado: [] as string[],
  };
  const bajas: { tenantId: string; planId: string }[] = [];
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

  return { estado, wheres, updates, deletes, audits, invalidados, contar, bajas };
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

/* La baja corre dentro de la tx de `bajaDelPlan`, que primero desata sus guías: acá, la tx es el mock de prisma. */
vi.mock("@/lib/db/forest-loth-guia-desatar.db", () => ({
  ForestLothGuiaDesatarDB: {
    bajaDelPlan: async (tenantId: string, planId: string, darDeBaja: (tx: unknown) => Promise<unknown>) => {
      H.bajas.push({ tenantId, planId });
      const { prisma } = await import("@/lib/prisma");
      return { resultado: await darDeBaja(prisma), desatado: H.estado.desatado, enMesCerrado: H.estado.enMesCerrado };
    },
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
  H.estado.desatado = { guias: 0, despachos: 0, trozados: 0, avisos: [] };
  H.estado.enMesCerrado = [];
  H.bajas.length = 0;
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

  it("sus guías vuelven a sin plan en la MISMA transacción, y el rastro dice cuáles quedan", async () => {
    H.estado.desatado = {
      guias: 2,
      despachos: 14,
      trozados: 3,
      avisos: ["Con esto el plan PO 9 queda pasado por 1,500 m³ de Shihuahuaco: lo sin plan cuenta en su saldo hasta que lo ates."],
    };
    H.estado.enMesCerrado = ["001-0000123"];
    await ForestPlanDB.eliminarPlan("t-main", PLAN.id, "qaadmin");
    expect(H.bajas).toEqual([{ tenantId: "t-main", planId: PLAN.id }]);
    expect(H.updates).toHaveLength(1); // el update del plan corrió dentro de bajaDelPlan
    const detalle = String(H.audits[0].detail);
    expect(detalle).toContain("Vuelven a sin plan: 2 guía(s), 14 línea(s) de despacho y 3 de trozado");
    expect(detalle).toContain("Quedan atadas por mes cerrado: GTF 001-0000123");
    expect(detalle).toContain("PO 9 queda pasado por 1,500 m³");
  });

  it("sin guías atadas el rastro no inventa un desatado", async () => {
    await ForestPlanDB.eliminarPlan("t-main", PLAN.id, "qaadmin");
    expect(String(H.audits[0].detail)).not.toContain("Vuelven a sin plan");
    expect(String(H.audits[0].detail)).not.toContain("mes cerrado");
  });

  it("un plan de otro tenant devuelve null y no escribe nada (404, no update a ciegas)", async () => {
    H.estado.plan = null; // el findFirst lleva tenantId en el WHERE
    const r = await ForestPlanDB.eliminarPlan("t-otro", PLAN.id, "qaadmin");
    expect(r).toBeNull();
    expect(H.updates).toHaveLength(0);
    expect(H.audits).toHaveLength(0);
    expect(H.bajas).toHaveLength(0); // ni siquiera se desata nada
    expect(H.wheres[0]).toMatchObject({ modelo: "planFindFirst", tenantId: "t-otro", deletedAt: null });
  });

  it("exige tenantId y planId", async () => {
    await expect(ForestPlanDB.eliminarPlan("", PLAN.id, "qaadmin")).rejects.toThrow("tenantId is required");
    await expect(ForestPlanDB.eliminarPlan("t-main", "", "qaadmin")).rejects.toThrow("planId is required");
  });
});

describe("reactivarPlan — revierte una baja, auditado", () => {
  it("sólo busca planes DE BAJA del tenant y los vuelve vivos y activos", async () => {
    H.estado.plan = { ...PLAN, deletedAt: new Date(), isActive: false };
    await ForestPlanDB.reactivarPlan("t-main", PLAN.id, "qaadmin");
    expect(H.wheres[0]).toMatchObject({ modelo: "planFindFirst", tenantId: "t-main", deletedAt: { not: null } });
    expect(H.updates).toHaveLength(1);
    expect(H.updates[0].where).toMatchObject({ id: PLAN.id, tenantId: "t-main" });
    expect(H.updates[0].data).toEqual({ deletedAt: null, isActive: true });
    expect(H.invalidados).toEqual(["forest-plan:t-main"]);
  });

  it("deja rastro con lo que vuelve a colgar", async () => {
    H.estado.plan = { ...PLAN, deletedAt: new Date(), isActive: false };
    await ForestPlanDB.reactivarPlan("t-main", PLAN.id, "qaadmin");
    expect(H.audits[0]).toMatchObject({ action: "ctp_plan_reactivado", entityId: PLAN.id, user: "qaadmin" });
    expect(String(H.audits[0].detail)).toContain("11 asientos");
  });

  it("un plan vivo o de otro tenant devuelve null y no escribe nada", async () => {
    H.estado.plan = null;
    expect(await ForestPlanDB.reactivarPlan("t-otro", PLAN.id, "qaadmin")).toBeNull();
    expect(H.updates).toHaveLength(0);
    expect(H.audits).toHaveLength(0);
  });
});
