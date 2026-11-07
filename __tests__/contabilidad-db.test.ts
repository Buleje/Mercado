/**
 * ContabilidadDB (ADR-529) sin base: un prisma falso que anota cada llamada.
 * Lo que protege: un asiento a mano descuadrado o en un mes cerrado no entra;
 * las cuentas que agrupan no aceptan asientos; el cierre doble da 409 (la
 * condición va en el WHERE); anular un asiento de otro negocio = 404.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Llamada = { modelo: string; metodo: string; args: Record<string, unknown> };

const H = vi.hoisted(() => {
  const llamadas: Llamada[] = [];
  const respuestas: Record<string, (args: Record<string, unknown>) => unknown> = {};
  const vacio = (metodo: string) =>
    metodo === "aggregate" ? { _min: {}, _sum: {}, _count: 0 } : metodo === "count" ? 0 : metodo.endsWith("Many") && metodo !== "findMany" && metodo !== "groupBy" ? { count: 0 } : metodo.startsWith("find") && !metodo.endsWith("Many") ? null : [];
  const prisma: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, modelo: string) => {
        if (modelo === "$transaction") return async (fn: (p: unknown) => unknown) => fn(prisma);
        if (modelo === "$queryRaw")
          return async (sql: TemplateStringsArray, ...valores: unknown[]) => {
            llamadas.push({ modelo, metodo: sql.join("?"), args: { valores } });
            const r = respuestas.$queryRaw;
            return r ? r({ valores }) : [];
          };
        if (typeof modelo !== "string" || modelo === "then") return undefined;
        return new Proxy(
          {},
          {
            get: (_t2, metodo: string) => async (args: Record<string, unknown> = {}) => {
              llamadas.push({ modelo, metodo, args });
              const r = respuestas[`${modelo}.${metodo}`];
              return r ? r(args) : vacio(metodo);
            },
          },
        );
      },
    },
  );
  return { prisma, llamadas, respuestas };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/cache", () => ({ getOrSet: async (_k: string, _t: number, fn: () => unknown) => fn(), invalidate: vi.fn(), invalidateByPrefix: vi.fn() }));
vi.mock("@/lib/db/resultado-negocio.db", () => ({
  hoyDeLima: () => ({ hoy: "2026-11-02", mes: "2026-11" }),
  ResultadoNegocioDB: {
    filasDelMes: async (_t: string, mes: string) => ({ mes, resultado: {}, caja: {}, resultadoDelPanel: 0, cajaNeto: 0, cruces: [], otrasMonedas: 0 }),
    pendientes: async () => ({}),
  },
}));

import { ContabilidadDB, ErrorContable } from "@/lib/db/contabilidad.db";
import { AsientoManualSchema } from "@/lib/contabilidad/esquemas";

const T = "tenant-a";
const OP = { verPlanilla: true };
const manual = (lineas: { cuenta: string; debe: number; haber: number }[], fecha = "2026-10-15") => ({ fecha, glosa: "Compra de una balanza", tipo: "manual" as const, lineas });

async function error(p: Promise<unknown>): Promise<ErrorContable> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErrorContable) return e;
    throw e;
  }
  throw new Error("no tiró");
}

beforeEach(() => {
  H.llamadas.length = 0;
  for (const k of Object.keys(H.respuestas)) delete H.respuestas[k];
  H.respuestas["contabilidadAjustes.findUnique"] = () => ({ tenantId: T, ventasConIgv: false, mapeo: null, inicio: "2026-09" });
});

describe("asiento a mano", () => {
  it("descuadrado → 409 y no escribe", async () => {
    const e = await error(ContabilidadDB.crearManual(T, manual([{ cuenta: "3331", debe: 100, haber: 0 }, { cuenta: "1011", debe: 0, haber: 90 }]), "ana"));
    expect(e.status).toBe(409);
    expect(H.llamadas.some((l) => l.metodo === "create")).toBe(false);
  });

  it("en un mes cerrado → 409", async () => {
    H.respuestas.$queryRaw = () => [{ estado: "cerrado" }];
    const e = await error(ContabilidadDB.crearManual(T, manual([{ cuenta: "3331", debe: 100, haber: 0 }, { cuenta: "1011", debe: 0, haber: 100 }]), "ana"));
    expect(e.status).toBe(409);
    expect(e.message).toContain("2026-10");
    expect(H.llamadas.some((l) => l.modelo === "asientoContable" && l.metodo === "create")).toBe(false);
  });

  it("una cuenta que agrupa (10) o que no existe → 400", async () => {
    const e = await error(ContabilidadDB.crearManual(T, manual([{ cuenta: "10", debe: 5, haber: 0 }, { cuenta: "99999", debe: 0, haber: 5 }]), "ana"));
    expect(e.status).toBe(400);
    expect(e.message).toContain("10, 99999");
  });

  it("cuadrado en mes abierto → se crea con el tenant y el periodo de la fecha", async () => {
    H.respuestas["asientoContable.create"] = (args) => {
      const d = args.data as { lineas: { create: Record<string, unknown>[] } } & Record<string, unknown>;
      return { ...d, id: "a1", fecha: new Date("2026-10-15T00:00:00Z"), origen: null, enlace: null, anulado: false, lineas: d.lineas.create.map((l) => ({ ...l, glosa: l.glosa ?? null, tercero: l.tercero ?? null })) };
    };
    const a = await ContabilidadDB.crearManual(T, manual([{ cuenta: "3331", debe: 100, haber: 0 }, { cuenta: "1011", debe: 0, haber: 100 }]), "ana");
    const c = H.llamadas.find((l) => l.modelo === "asientoContable" && l.metodo === "create");
    expect(c?.args.data).toMatchObject({ tenantId: T, periodo: "2026-10", total: 100, creadoPor: "ana" });
    expect(a.editable).toBe(true);
    expect(a.lineas.map((l) => l.nombreCuenta)).toEqual([expect.any(String), expect.any(String)]);
  });

  it("el mes se bloquea DENTRO de la tx (FOR UPDATE con parámetros) antes de escribir", async () => {
    H.respuestas["asientoContable.create"] = (args) => ({ ...(args.data as Record<string, unknown>), id: "a1", fecha: new Date("2026-10-15T00:00:00Z"), origen: null, enlace: null, anulado: false, lineas: [] });
    await ContabilidadDB.crearManual(T, manual([{ cuenta: "3331", debe: 100, haber: 0 }, { cuenta: "1011", debe: 0, haber: 100 }]), "ana");
    const i = H.llamadas.findIndex((l) => l.modelo === "$queryRaw");
    expect(H.llamadas[i]?.metodo).toMatch(/FOR UPDATE$/);
    expect(H.llamadas[i]?.args.valores).toEqual([T, "2026-10"]);
    expect(i).toBeLessThan(H.llamadas.findIndex((l) => l.modelo === "asientoContable" && l.metodo === "create"));
  });

  it("un asiento con fecha antes del inicio → 400", async () => {
    const e = await error(ContabilidadDB.crearManual(T, { ...manual([{ cuenta: "3331", debe: 100, haber: 0 }, { cuenta: "1011", debe: 0, haber: 100 }]), fecha: "2026-08-20" }, "ana"));
    expect(e.status).toBe(400);
    expect(H.llamadas.some((l) => l.modelo === "asientoContable" && l.metodo === "create")).toBe(false);
  });

  it("una fecha que no existe (2026-02-31) no pasa el esquema", () => {
    expect(AsientoManualSchema.safeParse({ ...manual([{ cuenta: "1011", debe: 5, haber: 0 }, { cuenta: "3331", debe: 0, haber: 5 }]), fecha: "2026-02-31" }).success).toBe(false);
    expect(AsientoManualSchema.safeParse({ ...manual([{ cuenta: "1011", debe: 5, haber: 0 }, { cuenta: "3331", debe: 0, haber: 5 }]), fecha: "2028-02-29" }).success).toBe(true);
  });

  it("el esquema rechaza una línea con debe y haber a la vez", () => {
    expect(AsientoManualSchema.safeParse(manual([{ cuenta: "1011", debe: 5, haber: 5 }, { cuenta: "3331", debe: 0, haber: 0 }])).success).toBe(false);
  });
});

describe("cerrar y anular", () => {
  it("cierre doble: el updateMany con estado abierto en el WHERE no toca nada → 409", async () => {
    H.respuestas["periodoContable.updateMany"] = () => ({ count: 0 });
    const e = await error(ContabilidadDB.cerrar(T, "2026-10", "ana", "2026-11-02", OP));
    expect(e.status).toBe(409);
    const u = H.llamadas.find((l) => l.modelo === "periodoContable" && l.metodo === "updateMany");
    expect(u?.args.where).toEqual({ tenantId: T, periodo: "2026-10", estado: "abierto" });
    expect(H.llamadas.some((l) => l.modelo === "asientoContable" && l.metodo === "deleteMany")).toBe(false);
  });

  it("no se cierra un mes que no llega", async () => {
    expect((await error(ContabilidadDB.cerrar(T, "2026-12", "ana", "2026-11-02", OP))).status).toBe(400);
  });

  it("anular un asiento de otro negocio → 404 (el tenant va en el WHERE)", async () => {
    const e = await error(ContabilidadDB.anular(T, "asiento-de-otro"));
    expect(e.status).toBe(404);
    expect(H.llamadas.find((l) => l.modelo === "asientoContable" && l.metodo === "findFirst")?.args.where).toEqual({ id: "asiento-de-otro", tenantId: T });
  });

  it("un automático no se anula (se corrige en su origen)", async () => {
    H.respuestas["asientoContable.findFirst"] = () => ({ tipo: "auto", periodo: "2026-10", anulado: false });
    expect((await error(ContabilidadDB.anular(T, "x"))).status).toBe(409);
  });

  it("anular en un mes cerrado (visto bajo el candado) → 409 y no toca el asiento", async () => {
    H.respuestas["asientoContable.findFirst"] = () => ({ tipo: "manual", periodo: "2026-10", anulado: false });
    H.respuestas.$queryRaw = () => [{ estado: "cerrado" }];
    expect((await error(ContabilidadDB.anular(T, "x"))).status).toBe(409);
    expect(H.llamadas.some((l) => l.modelo === "asientoContable" && l.metodo === "updateMany")).toBe(false);
  });

  it("editar una cuenta del PCGE (no propia) → 404", async () => {
    expect((await error(ContabilidadDB.editarCuenta(T, "1011", { nombre: "Caja chica" }))).status).toBe(404);
  });

  it("ajustes: una regla sin cuenta cambiable → 400", async () => {
    expect((await error(ContabilidadDB.guardarAjustes(T, { mapeo: { cobro_mostrador: "1041" } }, "ana"))).status).toBe(400);
  });
});
