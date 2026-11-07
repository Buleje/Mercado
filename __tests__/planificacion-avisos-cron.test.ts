/**
 * Cron `planificacion-avisos` (ADR-497, Brandon 16-10): licencias por vencer o
 * vencidas, objetivos atrasados y políticas por revisar llegan a la campana con
 * el MISMO texto del Resumen, sin duplicarse, y sólo los ve la gestión.
 *
 * `NotificationCenterDB` es el real sobre una tabla en memoria: la idempotencia
 * se prueba con las filas que quedan, no con cuántas veces se llamó a un mock.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { leerSeccion, type DatosPlan } from "@/lib/planificacion/secciones";

type Fila = {
  id: string;
  tenantId: string;
  type: string;
  severity: string;
  title: string;
  body: string;
  actionUrl: string | null;
  actionLabel: string | null;
  entityId: string | null;
  readAt: Date | null;
  createdAt: Date;
};

const H = vi.hoisted(() => ({
  filas: [] as Fila[],
  planes: new Map<string, unknown>(),
  seq: 0,
  ultimoWhere: [] as unknown[],
}));

/** Lo justo de un WHERE de Prisma: igualdad, null, in, notIn, not y OR. */
function coincide(fila: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, cond]) => {
    if (k === "OR") return (cond as Record<string, unknown>[]).some((w) => coincide(fila, w));
    const v = fila[k];
    if (cond === null) return v === null;
    if (cond instanceof Date || typeof cond !== "object") return v === cond;
    const c = cond as { in?: unknown[]; notIn?: unknown[]; not?: unknown };
    if (c.in) return c.in.includes(v);
    if (c.notIn) return v !== null && !c.notIn.includes(v);
    if ("not" in c) return v !== c.not;
    return false;
  });
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/cron/with-cron-health", () => ({ withCronHealth: (_n: string, h: () => Promise<Response>) => h }));
vi.mock("@/lib/logger", () => ({ logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} } }));
vi.mock("@/lib/db/plan-empresa.db", () => ({
  PlanEmpresaDB: { seccionesDeTodos: async () => H.planes },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      findMany: async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: unknown }) => {
        H.ultimoWhere.push(where);
        const r = H.filas.filter((f) => coincide(f, where));
        return orderBy ? r.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) : r;
      },
      count: async ({ where }: { where: Record<string, unknown> }) => {
        H.ultimoWhere.push(where);
        return H.filas.filter((f) => coincide(f, where)).length;
      },
      createMany: async ({ data }: { data: Omit<Fila, "id" | "readAt">[] }) => {
        for (const d of data) H.filas.push({ ...d, id: `n${++H.seq}`, readAt: null } as Fila);
        return { count: data.length };
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Fila> }) => {
        const r = H.filas.filter((f) => coincide(f, where));
        for (const f of r) Object.assign(f, data);
        return { count: r.length };
      },
    },
  },
}));

import { GET } from "@/app/api/cron/planificacion-avisos/route";
import { NotificationCenterDB } from "@/lib/db/notification-center.db";
import { avisosDelPlan, textoVencimientoLicencia } from "@/lib/planificacion/avisos";
import { chipLicencia } from "@/components/admin/planificacion/empresa/licencias-util";

const correr = async () => (await GET({} as never)).json() as Promise<Record<string, number>>;
const enLima = (dia: string) => vi.setSystemTime(new Date(`${dia}T15:00:00Z`));

function plan(over: { licencias?: unknown[]; objetivos?: unknown[]; politicas?: unknown[] } = {}): Partial<DatosPlan> {
  return {
    licencias: leerSeccion("licencias", {
      items: over.licencias ?? [
        { id: "lic-muni", nombre: "Licencia municipal", vence: "2026-10-26" },
        { id: "lic-digesa", nombre: "Registro DIGESA", vence: "2026-10-01" },
        { id: "lic-ok", nombre: "Defensa Civil", vence: "2026-12-31" },
        { id: "lic-tramite", nombre: "Certificado de bomberos", tramitada: false },
      ],
    }),
    objetivos: leerSeccion("objetivos", {
      items: over.objetivos ?? [
        { id: "obj-1", titulo: "Abrir la segunda caja", fin: "2026-10-14", estado: "en-curso" },
        { id: "obj-2", titulo: "Ya cumplido", fin: "2026-09-01", estado: "hecho" },
        { id: "obj-3", titulo: "En pausa", fin: "2026-09-01", estado: "pausado" },
      ],
    }),
    politicas: leerSeccion("politicas", {
      items: over.politicas ?? [
        { id: "pol-1", titulo: "Devoluciones", revisar: "2026-10-16" },
        { id: "pol-2", titulo: "Fiados", revisar: "2027-01-15" },
      ],
    }),
  };
}

const sinLeer = (tenantId = "t1") => H.filas.filter((f) => f.tenantId === tenantId && f.readAt === null);

beforeEach(() => {
  H.filas = [];
  H.seq = 0;
  H.ultimoWhere = [];
  H.planes = new Map([["t1", plan()]]);
  vi.useFakeTimers();
  enLima("2026-10-16");
});

describe("cron planificacion-avisos", () => {
  it("avisa los 3 tipos con el texto del Resumen, su gravedad y su enlace", async () => {
    const r = await correr();
    expect(r).toMatchObject({ negocios: 1, conAvisos: 1, creados: 4, fallidos: 0 });

    const porEntidad = Object.fromEntries(H.filas.map((f) => [f.entityId, f]));
    expect(Object.keys(porEntidad).sort()).toEqual([
      "licencia-lic-digesa@2026-10-01:vencida",
      "licencia-lic-muni@2026-10-26:30",
      "objetivo-obj-1@2026-10-14:1",
      "politica-pol-1@2026-10-16",
    ]);
    expect(porEntidad["licencia-lic-muni@2026-10-26:30"]).toMatchObject({
      type: "PLAN_LICENCIA",
      severity: "MEDIUM",
      title: "Licencia municipal: vence en 10 días",
      actionUrl: "/admin?tab=planificacion&vista=empresa&sub=licencias",
    });
    expect(porEntidad["licencia-lic-digesa@2026-10-01:vencida"]).toMatchObject({ severity: "HIGH", title: "Registro DIGESA: vencida hace 15 días" });
    expect(porEntidad["objetivo-obj-1@2026-10-14:1"]).toMatchObject({
      type: "PLAN_OBJETIVO",
      severity: "HIGH",
      title: "Abrir la segunda caja: atrasado 2 días",
      actionUrl: "/admin?tab=planificacion&vista=objetivos&sub=lista",
    });
    expect(porEntidad["politica-pol-1@2026-10-16"]).toMatchObject({
      type: "PLAN_POLITICA",
      severity: "MEDIUM",
      title: "Toca revisar la política «Devoluciones»",
      actionUrl: "/admin?tab=planificacion&vista=politicas&sub=politicas",
    });

    // Lo mismo que el Resumen: cada título de la campana es un texto del Resumen.
    const textosResumen = avisosDelPlan(plan(), "2026-10-16").map((a) => a.texto);
    for (const f of H.filas) expect(textosResumen).toContain(f.title);
  });

  it("correrlo dos veces el mismo día no duplica, y lo leído no vuelve", async () => {
    await correr();
    const segunda = await correr();
    expect(segunda).toMatchObject({ creados: 0, actualizados: 0, sinCambios: 4 });
    expect(H.filas).toHaveLength(4);

    H.filas[0].readAt = new Date();
    const tercera = await correr();
    expect(tercera).toMatchObject({ creados: 0, yaLeidos: 1, sinCambios: 3 });
    expect(H.filas).toHaveLength(4);
  });

  it("al día siguiente pone al día el texto del mismo aviso, sin crear otro", async () => {
    await correr();
    enLima("2026-10-17");
    const r = await correr();
    expect(r).toMatchObject({ creados: 0, actualizados: 4 });
    expect(H.filas).toHaveLength(4);
    expect(H.filas.find((f) => f.entityId === "licencia-lic-muni@2026-10-26:30")?.title).toBe("Licencia municipal: vence en 9 días");
  });

  it("etapa nueva = aviso nuevo; el de la etapa vieja queda leído", async () => {
    await correr();
    enLima("2026-10-19"); // la municipal pasa a 7 días
    const r = await correr();
    expect(r.creados).toBe(1);
    const muni = H.filas.filter((f) => f.entityId?.startsWith("licencia-lic-muni@"));
    expect(muni.map((f) => [f.entityId, f.readAt === null])).toEqual([
      ["licencia-lic-muni@2026-10-26:30", false],
      ["licencia-lic-muni@2026-10-26:7", true],
    ]);
  });

  it("lo arreglado (licencia renovada) queda leído y no se crea nada", async () => {
    await correr();
    H.planes = new Map([
      [
        "t1",
        plan({
          licencias: [
            { id: "lic-muni", nombre: "Licencia municipal", vence: "2027-10-26" },
            { id: "lic-digesa", nombre: "Registro DIGESA", vence: "2026-10-01" },
          ],
        }),
      ],
    ]);
    const r = await correr();
    expect(r).toMatchObject({ creados: 0, resueltos: 1 });
    expect(H.filas.find((f) => f.entityId === "licencia-lic-muni@2026-10-26:30")?.readAt).not.toBeNull();
    expect(sinLeer()).toHaveLength(3);
  });

  it("negocios sin plan: no se les avisa nada; con plan al día, tampoco", async () => {
    H.planes = new Map([["t-al-dia", plan({ licencias: [], objetivos: [], politicas: [] })]]);
    const r = await correr();
    expect(r).toMatchObject({ negocios: 1, conAvisos: 0, creados: 0 });
    expect(H.filas).toHaveLength(0);
    // Sólo se consultó el negocio con plan.
    expect(H.ultimoWhere.every((w) => (w as { tenantId: string }).tenantId === "t-al-dia")).toBe(true);
  });

  it("no toca avisos de otros tipos ni de otro negocio", async () => {
    H.filas.push(
      { id: "x1", tenantId: "t1", type: "DOCUMENTO_VENCIMIENTO", severity: "MEDIUM", title: "", body: "", actionUrl: null, actionLabel: null, entityId: "contratos", readAt: null, createdAt: new Date() },
      { id: "x2", tenantId: "t2", type: "PLAN_LICENCIA", severity: "MEDIUM", title: "", body: "", actionUrl: null, actionLabel: null, entityId: "licencia-z@2026-10-20:30", readAt: null, createdAt: new Date() },
    );
    await correr();
    expect(H.filas.find((f) => f.id === "x1")?.readAt).toBeNull();
    expect(H.filas.find((f) => f.id === "x2")?.readAt).toBeNull();
  });
});

describe("campana: los avisos del plan sólo para la gestión", () => {
  it("cajero no los ve ni los cuenta; admin sí", async () => {
    await correr();
    const cajero = await NotificationCenterDB.listForAdmin("t1", { canSeeHigh: false });
    const admin = await NotificationCenterDB.listForAdmin("t1", { canSeeHigh: true });
    expect(cajero).toEqual({ items: [], unreadCount: 0 });
    expect(admin.items).toHaveLength(4);
    expect(admin.unreadCount).toBe(4);
  });
});

describe("texto de la licencia = la pastilla de la tabla", () => {
  it.each([
    ["vencida", -3],
    ["vencida", -1],
    ["por-vencer", 0],
    ["por-vencer", 1],
    ["por-vencer", 12],
  ] as const)("%s %i", (estado, d) => {
    expect(textoVencimientoLicencia(estado, d)).toBe(chipLicencia(estado, d).label.toLowerCase());
  });
});
