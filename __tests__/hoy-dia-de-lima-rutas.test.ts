/**
 * «Hoy», «este mes» y «el día X» = días de LIMA en las rutas que faltaban (2026-10-09, carril HORA2).
 *
 * El servidor corre en UTC: `setHours(0)` / `new Date(y, m, 1)` / `new Date("2026-10-09")`
 * caían a las 19:00 de Lima del día anterior. A las 20:00 de Lima «hoy» ya era mañana
 * (POS «frecuentes de hoy» vacío, documentos de hoy sin los de la mañana, deudas vencidas
 * un día antes). Reloj fijo a las 20:00 de Lima y proceso en UTC, como en producción.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { llamadas, respuestas, tzOriginal } = vi.hoisted(() => {
  const tzOriginal = process.env.TZ;
  process.env.TZ = "UTC"; // el servidor real; en la PC de Brandon (Lima) el bug no se ve
  return {
    tzOriginal,
    llamadas: [] as { modelo: string; metodo: string; args: Record<string, unknown> }[],
    respuestas: {} as Record<string, unknown>,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: async () => ({ tenantId: "t1", role: "admin", username: "qa" }) }));
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_t, modelo: string) =>
        new Proxy(
          {},
          {
            get: (_m, metodo: string) => async (args: Record<string, unknown>) => {
              llamadas.push({ modelo, metodo, args });
              const r = respuestas[`${modelo}.${metodo}`];
              if (r !== undefined) return r;
              return metodo === "findMany" || metodo === "groupBy" ? [] : null;
            },
          },
        ),
    },
  ),
}));
vi.mock("@/lib/db/activity-log.db", () => ({
  ActivityLogDB: {
    listPaginated: vi.fn(async (_t: string, opts: Record<string, unknown>) => {
      llamadas.push({ modelo: "activityLog", metodo: "listPaginated", args: opts });
      return { logs: [], total: 0 };
    }),
    summarize: vi.fn(async () => []),
  },
}));
vi.mock("@/lib/db/documentos-emitidos.db", () => ({
  DocumentosEmitidosDB: {
    listAll: vi.fn(async (_t: string, opts: Record<string, unknown>) => {
      llamadas.push({ modelo: "documentos", metodo: "listAll", args: opts });
      return respuestas["documentos.listAll"] ?? [];
    }),
  },
}));

import { NextRequest } from "next/server";
import { limaDayRange, limaWeekday, startOfLimaMonth } from "@/lib/utils";
import { rangosDeAnomalia } from "@/lib/db/sales-anomalies.db";
import { DeliveryAssignmentsDB } from "@/lib/db/delivery-assignments.db";
import { getCxpCalendar } from "@/lib/db/compras-cxp-calendar.db";
import { GET as frecuentesGET } from "@/app/api/products/frecuentes/route";
import { GET as auditTrailGET } from "@/app/api/audit-trail/route";
import { GET as documentosGET } from "@/app/api/documentos-emitidos/route";
import { GET as kardexGET } from "@/app/api/inventory/kardex/route";

const LAS_20_DE_LIMA = new Date("2026-10-10T01:00:00.000Z"); // viernes 09-10, 20:00 Lima
const HOY_LIMA = "2026-10-09T05:00:00.000Z"; // 09-10 00:00 Lima
const MANANA_LIMA = "2026-10-10T05:00:00.000Z";

const req = (ruta: string) => new NextRequest(`http://localhost${ruta}`);
const ultima = (modelo: string, metodo: string) => [...llamadas].reverse().find((l) => l.modelo === modelo && l.metodo === metodo);

beforeEach(() => {
  llamadas.length = 0;
  for (const k of Object.keys(respuestas)) delete respuestas[k];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(LAS_20_DE_LIMA);
});
afterEach(() => vi.useRealTimers());
afterAll(() => {
  process.env.TZ = tzOriginal;
});

describe("ayudantes de días de Lima (lib/utils)", () => {
  it("el proceso corre en UTC (si no, el bug viejo no se reproduce)", () => {
    expect(new Date().getTimezoneOffset()).toBe(0);
    expect(new Date().getUTCDate()).toBe(10); // el servidor ya cree que es 10-10
  });

  it("limaDayRange: «2026-10-09» es el día de Lima, no la medianoche UTC", () => {
    const { start, end } = limaDayRange("2026-10-09");
    expect(start.toISOString()).toBe(HOY_LIMA);
    expect(end.toISOString()).toBe(MANANA_LIMA);
    // un instante a las 20:00 de Lima también es el 09-10
    expect(limaDayRange(LAS_20_DE_LIMA).start.toISOString()).toBe(HOY_LIMA);
    expect(limaDayRange().start.toISOString()).toBe(HOY_LIMA);
  });

  it("startOfLimaMonth: a las 20:00 del 31-10 sigue siendo octubre", () => {
    vi.setSystemTime(new Date("2026-11-01T01:00:00.000Z"));
    expect(new Date(startOfLimaMonth()).toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(new Date(startOfLimaMonth(-1)).toISOString()).toBe("2026-09-01T05:00:00.000Z");
    expect(new Date(startOfLimaMonth(1)).toISOString()).toBe("2026-11-01T05:00:00.000Z");
    // cruce de año
    expect(new Date(startOfLimaMonth(-10)).toISOString()).toBe("2025-12-01T05:00:00.000Z");
  });

  it("limaWeekday: el viernes 20:00 de Lima es viernes (UTC ya dice sábado)", () => {
    expect(new Date().getUTCDay()).toBe(6);
    expect(limaWeekday()).toBe(5);
  });
});

describe("anomalías de ventas (SalesAnomaliesDB.detect)", () => {
  it("el cron de las 18:00 de Lima compara la MISMA franja de hace 7 días, no 18 h contra 24 h", () => {
    const ahora = new Date("2026-10-09T23:00:00.000Z"); // 18:00 Lima
    const { target, comparison } = rangosDeAnomalia(undefined, ahora);
    expect(target.start.toISOString()).toBe(HOY_LIMA);
    expect(target.end.toISOString()).toBe("2026-10-09T23:00:00.000Z");
    expect(comparison.start.toISOString()).toBe("2026-10-02T05:00:00.000Z");
    expect(comparison.end.toISOString()).toBe("2026-10-02T23:00:00.000Z");
  });

  it("un día pasado se compara entero contra entero", () => {
    const { target, comparison } = rangosDeAnomalia(new Date("2026-10-05T15:00:00.000Z"), LAS_20_DE_LIMA);
    expect(target.end.getTime() - target.start.getTime()).toBe(24 * 3600_000);
    expect(comparison.end.getTime() - comparison.start.getTime()).toBe(24 * 3600_000);
    expect(target.start.toISOString()).toBe("2026-10-05T05:00:00.000Z");
  });
});

describe("rutas del panel a las 20:00 de Lima", () => {
  it("POS «frecuentes de hoy» cuenta desde las 00:00 de Lima (antes: desde las 19:00 → casi vacío)", async () => {
    const res = await frecuentesGET(req("/api/products/frecuentes"));
    expect(res.status).toBe(200);
    const sale = (ultima("saleItem", "groupBy")?.args.where as { sale: { createdAt: { gte: Date } } }).sale;
    expect(sale.createdAt.gte.toISOString()).toBe(HOY_LIMA);
  });

  it("auditoría «hoy» arranca a las 00:00 de Lima", async () => {
    const res = await auditTrailGET(req("/api/audit-trail?period=today"));
    expect(res.status).toBe(200);
    expect((ultima("activityLog", "listPaginated")?.args.since as Date).toISOString()).toBe(HOY_LIMA);
  });

  it("documentos: «hoy» incluye la boleta de la mañana y el rango desde/hasta es el día de Lima", async () => {
    respuestas["documentos.listAll"] = [
      { tipo: "boleta", fecha: "2026-10-09T15:00:00.000Z", total: 10 }, // 10:00 Lima de hoy
      { tipo: "boleta", fecha: "2026-10-10T00:30:00.000Z", total: 20 }, // 19:30 Lima de hoy
      { tipo: "factura", fecha: "2026-10-09T04:00:00.000Z", total: 30 }, // 23:00 Lima de AYER
    ];
    const res = await documentosGET(req("/api/documentos-emitidos?from=2026-10-09&to=2026-10-09"));
    const body = (await res.json()) as { kpis: { docsHoy: number; boletasMes: number; facturasMes: number } };
    expect(body.kpis.docsHoy).toBe(2); // antes: 1 (sólo las de después de las 19:00)
    expect(body.kpis.boletasMes).toBe(2);
    const args = ultima("documentos", "listAll")?.args as { from: Date; to: Date };
    expect(args.from.toISOString()).toBe(HOY_LIMA);
    expect(args.to.toISOString()).toBe("2026-10-10T04:59:59.999Z"); // 23:59:59 de Lima
  });

  it("documentos: «del mes» a las 20:00 del 31-10 todavía cuenta las de octubre", async () => {
    vi.setSystemTime(new Date("2026-11-01T01:00:00.000Z"));
    respuestas["documentos.listAll"] = [{ tipo: "boleta", fecha: "2026-10-31T15:00:00.000Z", total: 10 }];
    const body = (await (await documentosGET(req("/api/documentos-emitidos"))).json()) as {
      kpis: { boletasMes: number; totalFacturado: number };
    };
    expect(body.kpis.boletasMes).toBe(1); // antes: 0 (el mes ya era noviembre)
    expect(body.kpis.totalFacturado).toBe(10);
  });

  it("kardex desde/hasta = días de Lima completos (antes cortaba a las 18:59)", async () => {
    respuestas["product.findFirst"] = { id: 101, name: "Arroz", stock: 5, unit: "kg" };
    await kardexGET(req("/api/inventory/kardex?productId=101&from=2026-10-09&to=2026-10-09"));
    const where = ultima("inventoryMovement", "findMany")?.args.where as { createdAt: { gte: Date; lte: Date } };
    expect(where.createdAt.gte.toISOString()).toBe(HOY_LIMA);
    expect(where.createdAt.lte.toISOString()).toBe("2026-10-10T04:59:59.999Z");
  });
});

describe("db: repartos del día y cuentas por pagar", () => {
  it("asignaciones de reparto del «2026-10-09» = ese día de Lima", async () => {
    await DeliveryAssignmentsDB.listByTenant("t1", { date: "2026-10-09" });
    const where = ultima("deliveryAssignment", "findMany")?.args.where as { tenantId: string; createdAt: { gte: Date; lt: Date } };
    expect(where.tenantId).toBe("t1");
    expect(where.createdAt.gte.toISOString()).toBe(HOY_LIMA);
    expect(where.createdAt.lt.toISOString()).toBe(MANANA_LIMA);
  });

  it("una deuda que vence HOY no figura vencida a las 20:00 de Lima", async () => {
    respuestas["payable.findMany"] = [
      { id: "cxp1", dueDate: new Date("2026-10-09T00:00:00.000Z"), amount: 100, paidAmount: 0, status: "pendiente", supplier: null, supplierName: "Molino", description: null },
    ];
    const r = await getCxpCalendar("t1", new Date("2026-10-01T00:00:00.000Z"), new Date("2026-10-31T00:00:00.000Z"));
    expect(r.calendar["2026-10-09"][0].daysOverdue).toBe(0);
    expect(r.resumen.vencido).toBe(0); // antes: 100 (el servidor ya estaba en el 10-10)
    expect(r.resumen.venceEstaSemana).toBe(100);
  });
});
