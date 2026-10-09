/**
 * Avance de las metas comerciales (ADR-488): calculadoras de bodega y
 * marketplace + GET /api/goals/avance, con las DB classes mockeadas.
 *
 * Fija: el filtro de origen del marketplace, que los pedidos cancelados no
 * entran, el ritmo/estado/% de una meta del mes, el día de un gasto guardado
 * como fecha sola, que una lectura que falla deja ESA meta «sin dato» sin
 * tumbar a las demás, y que la ruta usa el negocio del JWT.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { MetaDTO } from "@/lib/admin/metas-tareas";

// ── Datos de prueba: lo que la base «tiene» ────────────────────────────────
type Pedido = { status: string; source: string; total: number; deletedAt: Date | null; createdAt: Date };
const pedidosFixture: Pedido[] = [];

const prismaMock = vi.hoisted(() => ({
  order: { aggregate: vi.fn() },
  saleItem: { aggregate: vi.fn() },
  orderItem: { aggregate: vi.fn() },
  customer: { count: vi.fn() },
  sale: { groupBy: vi.fn(), count: vi.fn() },
  cashRegister: { findMany: vi.fn() },
  purchaseOrder: { count: vi.fn() },
}));
const kpis = vi.hoisted(() => ({ ingresosForRange: vi.fn(), ticketAvg: vi.fn() }));
const fiado = vi.hoisted(() => ({ getPaidCuotasInRange: vi.fn() }));
const gastosDb = vi.hoisted(() => ({ getHistorialUnificado: vi.fn(), getByDateRange: vi.fn() }));
const tareasDb = vi.hoisted(() => ({ listar: vi.fn() }));
const goalsDb = vi.hoisted(() => ({ listar: vi.fn() }));
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
const getOrSet = vi.hoisted(() => vi.fn((_k: string, _ttl: number, fn: () => Promise<unknown>) => fn()));
const mockRequireAdmin = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/db/analytics-kpis-v2.db", () => ({ AnalyticsKpisV2DB: kpis }));
vi.mock("@/lib/db/analytics-fiado.db", () => ({ AnalyticsFiadoDB: fiado }));
vi.mock("@/lib/db/finance.db", () => ({ ExpensesDB: gastosDb }));
vi.mock("@/lib/db/admin-tasks.db", () => ({ AdminTasksDB: tareasDb }));
vi.mock("@/lib/db/admin-goals.db", () => ({ AdminGoalsDB: goalsDb }));
vi.mock("@/lib/metas/avance/forestal", () => ({ CALCULADORAS_FORESTALES: {} }));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/cache", () => ({ getOrSet, invalidate: vi.fn(), invalidateByPrefix: vi.fn() }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

const { MetasAvanceDB } = await import("@/lib/db/metas-avance.db");
const { avanceDeMetas, avanceDePrueba } = await import("@/lib/metas/avance");
const avanceRoute = await import("@/app/api/goals/avance/route");

const HOY = "2026-10-09"; // octubre: 31 días, 9 vividos
const OCT = new Date("2026-10-05T15:00:00Z");

/** `order.aggregate` que aplica el where de verdad sobre el fixture (estado, origen, borrado). */
function aggregateSobreFixture(args: { where: { status: { in: string[] }; source?: string; deletedAt: null; createdAt: { gte: Date; lt: Date } } }) {
  const w = args.where;
  const filas = pedidosFixture.filter(
    (p) =>
      w.status.in.includes(p.status) &&
      (w.source === undefined || p.source === w.source) &&
      p.deletedAt === null &&
      p.createdAt >= w.createdAt.gte &&
      p.createdAt < w.createdAt.lt,
  );
  return Promise.resolve({ _count: { id: filas.length }, _sum: { total: filas.reduce((s, p) => s + p.total, 0) } });
}

function meta(p: Partial<MetaDTO> & Pick<MetaDTO, "id" | "category">): MetaDTO {
  return { name: p.id, period: "mensual", target: 100, current: 0, unit: "S/", createdAt: "2026-10-01T00:00:00.000Z", ...p };
}

beforeEach(() => {
  vi.clearAllMocks();
  pedidosFixture.length = 0;
  pedidosFixture.push(
    { status: "entregado", source: "marketplace", total: 100, deletedAt: null, createdAt: OCT },
    { status: "cancelado", source: "marketplace", total: 999, deletedAt: null, createdAt: OCT },
    { status: "pendiente", source: "marketplace", total: 500, deletedAt: null, createdAt: OCT },
    { status: "confirmado", source: "direct", total: 50, deletedAt: null, createdAt: OCT },
    { status: "entregado", source: "direct", total: 70, deletedAt: new Date(), createdAt: OCT },
    // septiembre: fuera de la ventana de octubre
    { status: "entregado", source: "marketplace", total: 400, deletedAt: null, createdAt: new Date("2026-10-01T04:59:59Z") },
  );
  prismaMock.order.aggregate.mockImplementation(aggregateSobreFixture);
  kpis.ingresosForRange.mockResolvedValue({ _sum: { total: 30 } });
  kpis.ticketAvg.mockResolvedValue({ _avg: { total: 15 }, _count: { id: 2 } });
  getOrSet.mockImplementation((_k: string, _ttl: number, fn: () => Promise<unknown>) => fn());
});

describe("MetasAvanceDB.pedidosDelRango", () => {
  it("con origen marketplace filtra por source y sólo los estados que entran", async () => {
    const r = await MetasAvanceDB.pedidosDelRango("t1", new Date("2026-10-01T05:00:00Z"), new Date("2026-11-01T05:00:00Z"), "marketplace");
    const where = prismaMock.order.aggregate.mock.calls[0]![0].where;
    expect(where).toMatchObject({ tenantId: "t1", deletedAt: null, source: "marketplace" });
    expect(where.status.in).toEqual(["confirmado", "en_camino", "entregado"]);
    // El cancelado (999), el pendiente (500), el de septiembre (400) y el directo (50) no entran.
    expect(r).toEqual({ n: 1, total: 100 });
  });

  it("sin origen cuenta todos los pedidos que entran, sin los cancelados ni los borrados", async () => {
    const r = await MetasAvanceDB.pedidosDelRango("t1", new Date("2026-10-01T05:00:00Z"), new Date("2026-11-01T05:00:00Z"));
    expect(prismaMock.order.aggregate.mock.calls[0]![0].where).not.toHaveProperty("source");
    expect(r).toEqual({ n: 2, total: 150 });
  });
});

describe("avanceDeMetas — ventas y marketplace", () => {
  it("ventas = POS + pedidos que entran; ritmo, estado y % del mes", async () => {
    const [ventas, mkt] = await avanceDeMetas(
      "t1",
      [meta({ id: "v", category: "ventas", target: 310 }), meta({ id: "m", category: "marketplace_ventas", target: 1000 })],
      HOY,
    );
    // 30 del POS + 100 + 50 de pedidos; el cancelado no suma.
    expect(ventas).toMatchObject({ id: "v", desde: "2026-10-01", hasta: "2026-10-31", avance: 180, esperado: 90, pct: 58.1, estado: "en_camino" });
    expect(ventas!.detalle).toBe("2 ventas del POS y 2 pedidos");
    // Marketplace: sólo el entregado (100); a esta altura del mes tocaba 290,32 → atrasada.
    expect(mkt).toMatchObject({ avance: 100, esperado: 290.32, pct: 10, estado: "atrasada" });
  });

  it("ventas, ticket y pedidos comparten las mismas lecturas (una por ventana)", async () => {
    const res = await avanceDeMetas(
      "t1",
      [
        meta({ id: "a", category: "ventas" }),
        meta({ id: "b", category: "ticket_promedio", target: 50 }),
        meta({ id: "c", category: "pedidos", unit: "ventas", target: 4 }),
      ],
      HOY,
    );
    expect(kpis.ingresosForRange).toHaveBeenCalledTimes(1);
    expect(kpis.ticketAvg).toHaveBeenCalledTimes(1);
    expect(prismaMock.order.aggregate).toHaveBeenCalledTimes(1);
    // Ticket = 180 / 4; sin marca de ritmo (un promedio no se acumula).
    expect(res[1]).toMatchObject({ avance: 45, esperado: null, estado: "en_camino" });
    expect(res[2]).toMatchObject({ avance: 4, estado: "cumplida", pct: 100 });
  });

  it("la ventana abierta se guarda 60 s en caché con la clave del negocio", async () => {
    await avanceDeMetas("t1", [meta({ id: "v", category: "ventas" })], HOY);
    expect(getOrSet).toHaveBeenCalledWith("metas-avance:t1:ventas:S/:2026-10-01:2026-10-31", 60, expect.any(Function));
  });
});

describe("avanceDeMetas — gastos (tope) y fechas solas", () => {
  it("un gasto del 01/10 guardado a medianoche UTC es de octubre; uno de las 22:00 del 30/09 en Lima no", async () => {
    gastosDb.getByDateRange.mockResolvedValue([
      { amount: 300, date: "2026-10-01T00:00:00.000Z" },
      { amount: 100, date: "2026-10-08T17:00:00.000Z" },
      { amount: 999, date: "2026-10-01T03:00:00.000Z" }, // 30/09 22:00 Lima
      { amount: 888, date: "2026-09-30T00:00:00.000Z" },
    ]);
    const [g] = await avanceDeMetas("t1", [meta({ id: "g", category: "gastos", target: 1000 })], HOY);
    expect(gastosDb.getByDateRange.mock.calls[0]![3]).toEqual({ incluirPlantillas: false });
    // 400 gastados cuando el ritmo permitía 290,32 → va gastando más rápido (atrasada), sin pasarse del tope.
    expect(g).toMatchObject({ avance: 400, esperado: 290.32, estado: "atrasada", pct: 40 });
  });

  it("pasarse del tope es «pasada_del_tope»", async () => {
    gastosDb.getByDateRange.mockResolvedValue([{ amount: 1200, date: "2026-10-02T15:00:00.000Z" }]);
    const [g] = await avanceDeMetas("t1", [meta({ id: "g", category: "gastos", target: 1000 })], HOY);
    expect(g!.estado).toBe("pasada_del_tope");
  });

  it("compras: sólo las recibidas de la ventana; las pendientes se dicen en el detalle", async () => {
    gastosDb.getHistorialUnificado.mockResolvedValue([
      { source: "purchase", amount: 500, fecha: "2026-10-03T00:00:00.000Z" },
      { source: "purchase", amount: 70, fecha: "2026-09-30T12:00:00.000Z" },
    ]);
    prismaMock.purchaseOrder.count.mockResolvedValue(33);
    const [c] = await avanceDeMetas("t1", [meta({ id: "c", category: "compras", target: 10000 })], HOY);
    expect(gastosDb.getHistorialUnificado.mock.calls[0]![1]).toMatchObject({ source: "purchase" });
    expect(c).toMatchObject({ avance: 500 });
    expect(c!.detalle).toBe("1 orden recibida · 33 órdenes pendientes no cuentan hasta que las recibas");
  });
});

describe("avanceDeMetas — errores y manual", () => {
  it("una lectura que falla deja ESA meta «sin dato» y las demás siguen", async () => {
    fiado.getPaidCuotasInRange.mockRejectedValue(new Error("pool lleno"));
    const res = await avanceDeMetas(
      "t1",
      [meta({ id: "f", category: "fiados_cobrados" }), meta({ id: "v", category: "ventas", target: 310 }), meta({ id: "x", category: "manual", current: 7, target: 10, unit: "visitas" })],
      HOY,
    );
    expect(res[0]).toMatchObject({ id: "f", estado: "sin_dato", avance: null, pct: null, desde: "2026-10-01" });
    expect(res[1]).toMatchObject({ id: "v", avance: 180 });
    expect(res[2]).toMatchObject({ id: "x", avance: 7, pct: 70 });
    expect(logger.error).toHaveBeenCalledWith("[metas-avance] no se pudo medir una meta", expect.objectContaining({ metaId: "f", tenantId: "t1" }));
  });

  it("fiados cobrados corta en el fin de la ventana (el método sólo filtra desde)", async () => {
    fiado.getPaidCuotasInRange.mockResolvedValue([
      { monto: "120.50", pagadoEn: new Date("2026-10-04T15:00:00Z") },
      { monto: "80", pagadoEn: new Date("2026-11-01T06:00:00Z") },
    ]);
    const [f] = await avanceDeMetas("t1", [meta({ id: "f", category: "fiados_cobrados", target: 2000 })], HOY);
    expect(f).toMatchObject({ avance: 120.5, detalle: "1 abono cobrado" });
  });

  it("caja: cuenta sólo los cierres contados que cuadran", async () => {
    prismaMock.cashRegister.findMany.mockResolvedValue([
      { expectedAmount: "100", closingAmount: "100", difference: "0", notes: "Cierre normal", closedAt: OCT },
      { expectedAmount: "100", closingAmount: "90", difference: "-10", notes: "", closedAt: OCT },
      { expectedAmount: "100", closingAmount: "100", difference: "0", notes: "Cierre automático por inactividad", closedAt: OCT },
    ]);
    const [c] = await avanceDeMetas("t1", [meta({ id: "c", category: "caja", unit: "cierres", target: 25 })], HOY);
    expect(c).toMatchObject({ avance: 1, detalle: "1 de 3 cierres cuadraron · 1 se cerró solo sin contar" });
  });
});

describe("avanceDePrueba", () => {
  it("vista previa del marketplace (pedidos): sin objetivo no hay estado que juzgar", async () => {
    const r = await avanceDePrueba("t1", { category: "marketplace_pedidos", period: "mensual", unit: "pedidos" }, HOY);
    expect(r).toMatchObject({ id: "vista-previa", avance: 1, pct: null, esperado: null, estado: "en_camino" });
  });
});

describe("GET /api/goals/avance", () => {
  const req = (q = "") => new NextRequest(`http://localhost/api/goals/avance${q}`);

  it("sin sesión → 401", async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    const res = await avanceRoute.GET(req());
    expect(res.status).toBe(401);
    expect(goalsDb.listar).not.toHaveBeenCalled();
  });

  it("pide roles explícitos sin cajero ni almacenero", async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
    await avanceRoute.GET(req());
    const roles = mockRequireAdmin.mock.calls[0]![1] as string[];
    expect(roles).toEqual(expect.arrayContaining(["admin", "owner", "manager", "analista"]));
    expect(roles).not.toContain("cajero");
    expect(roles).not.toContain("almacenero");
  });

  it("lee las metas del negocio del JWT aunque la URL nombre otro", async () => {
    mockRequireAdmin.mockResolvedValue({ tenantId: "t-propio", role: "admin", username: "a" });
    goalsDb.listar.mockResolvedValue([]);
    const res = await avanceRoute.GET(req("?tenantId=t-ajeno"));
    expect(res.status).toBe(200);
    expect(goalsDb.listar).toHaveBeenCalledWith("t-propio");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("vista previa con una categoría que no existe → 422", async () => {
    mockRequireAdmin.mockResolvedValue({ tenantId: "t1", role: "admin", username: "a" });
    const res = await avanceRoute.GET(req("?category=inventada&period=mensual"));
    expect(res.status).toBe(422);
  });

  it("si leer las metas falla → 503 en tuteo", async () => {
    mockRequireAdmin.mockResolvedValue({ tenantId: "t1", role: "admin", username: "a" });
    goalsDb.listar.mockRejectedValue(new Error("db caída"));
    const res = await avanceRoute.GET(req());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/Reintenta/);
  });
});
