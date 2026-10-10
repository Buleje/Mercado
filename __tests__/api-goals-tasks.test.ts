/**
 * __tests__/api-goals-tasks.test.ts
 *
 * Metas y tareas pasaron de `local-data/*.json` (una lista para todos los
 * negocios) a `AdminGoal` y `AdminTask` (ADR-415). Las rutas corren de verdad
 * contra un Prisma simulado, así que el test cubre juntos el esquema Zod, la
 * clase DB y la forma de la respuesta:
 *
 * - el negocio y el usuario salen de la sesión, nunca del body;
 * - un PATCH parcial no pisa otros campos (en Zod 4, `.partial()` aplica defaults);
 * - lo que no está en el esquema no entra (antes `{ ...registro, ...body }`);
 * - montos como number y fechas como "YYYY-MM-DD", que es lo que lee el panel;
 * - `completedAt` lo decide el servidor.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: vi.fn(() => null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const mockRequireAdmin = vi.fn();
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

const goal = { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() };
const task = { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() };
vi.mock("@/lib/prisma", () => ({ prisma: { adminGoal: goal, adminTask: task } }));
const mockInvalidateByPrefix = vi.fn();
vi.mock("@/lib/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cache")>()),
  invalidateByPrefix: mockInvalidateByPrefix,
}));

const goalsRoute = await import("@/app/api/goals/route");
const goalRoute = await import("@/app/api/goals/[id]/route");
const tasksRoute = await import("@/app/api/tasks/route");
const taskRoute = await import("@/app/api/tasks/[id]/route");

function req(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`https://host${url}`, {
    method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** Una fila como la entrega Prisma: Decimal (acá como string) y DATE a medianoche UTC. */
const filaMeta = (extra: Record<string, unknown> = {}) => ({
  id: "g1",
  tenantId: "t1",
  name: "Ventas del mes",
  category: "ventas",
  period: "mensual",
  target: "50000.00",
  current: "9000.50",
  unit: "S/",
  dueDate: new Date("2026-09-30T00:00:00Z"),
  createdBy: "qa",
  createdAt: new Date("2026-09-14T15:00:00Z"),
  updatedAt: new Date("2026-09-14T15:00:00Z"),
  ...extra,
});

const filaTarea = (extra: Record<string, unknown> = {}) => ({
  id: "k1",
  tenantId: "t1",
  title: "Contar el stock",
  description: null,
  priority: "media",
  status: "pendiente",
  assignedTo: null,
  module: null,
  dueDate: null,
  completedAt: null,
  createdBy: "qa",
  createdAt: new Date("2026-09-14T15:00:00Z"),
  updatedAt: new Date("2026-09-14T15:00:00Z"),
  ...extra,
});

const noEncontrado = () => Object.assign(new Error("Record to update not found"), { code: "P2025" });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({ tenantId: "t1", username: "qa", role: "admin" });
});

describe("/api/goals — metas por negocio", () => {
  it("GET lista sólo el negocio de la sesión, con montos como number y la fecha sin hora", async () => {
    goal.findMany.mockResolvedValue([filaMeta()]);
    const res = await goalsRoute.GET(req("/api/goals", "GET"));
    expect(res.status).toBe(200);
    expect(goal.findMany).toHaveBeenCalledWith({ where: { tenantId: "t1" }, orderBy: { createdAt: "asc" } });
    expect(await res.json()).toEqual([
      {
        id: "g1",
        name: "Ventas del mes",
        category: "ventas",
        period: "mensual",
        target: 50000,
        current: 9000.5,
        unit: "S/",
        createdAt: "2026-09-14T15:00:00.000Z",
        dueDate: "2026-09-30",
      },
    ]);
  });

  it("POST guarda con el negocio y el usuario de la sesión aunque el body traiga otros", async () => {
    goal.create.mockResolvedValue(filaMeta({ dueDate: null }));
    const res = await goalsRoute.POST(
      req("/api/goals", "POST", { name: "  Meta  ", target: 100, tenantId: "otro", createdBy: "intruso", id: "fijo" }),
    );
    expect(res.status).toBe(201);
    expect(goal.create.mock.calls[0][0].data).toEqual({
      tenantId: "t1",
      createdBy: "qa",
      name: "Meta",
      category: "ventas",
      period: "mensual",
      target: 100,
      current: 0,
      unit: "S/",
      dueDate: null,
    });
  });

  it("POST con una categoría fuera de la lista → 422 y no toca la base", async () => {
    const res = await goalsRoute.POST(req("/api/goals", "POST", { name: "Meta", target: 10, category: "inventada" }));
    expect(res.status).toBe(422);
    expect(goal.create).not.toHaveBeenCalled();
  });

  it("PATCH { current } en una meta a mano: la condición «manual» va en el WHERE y no pisa la categoría", async () => {
    goal.updateMany.mockResolvedValue({ count: 1 });
    goal.findFirst.mockResolvedValue(filaMeta({ category: "manual", unit: "cajas", current: "12000.00" }));
    const res = await goalRoute.PATCH(req("/api/goals/g1", "PATCH", { current: 12000 }), ctx("g1"));
    expect(res.status).toBe(200);
    expect(goal.updateMany).toHaveBeenCalledWith({ where: { tenantId: "t1", id: "g1", category: "manual" }, data: { current: 12000 } });
    expect((await res.json()).current).toBe(12000);
    expect(mockInvalidateByPrefix).toHaveBeenCalledWith("metas-avance:t1:");
  });

  it("ADR-488: PATCH { current } en una meta de ventas → 422 sin escribir (el avance sale de los datos)", async () => {
    goal.updateMany.mockResolvedValue({ count: 0 });
    goal.findFirst.mockResolvedValue({ id: "g1" });
    const res = await goalRoute.PATCH(req("/api/goals/g1", "PATCH", { current: 500 }), ctx("g1"));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      code: "avance_solo_manual",
      error: "El avance de esta meta sale de tus datos; solo las metas a mano se anotan",
    });
    expect(mockInvalidateByPrefix).not.toHaveBeenCalled();
  });

  it("ADR-488: PATCH { category: 'ventas', current } → 422 por el esquema, sin tocar la base", async () => {
    const res = await goalRoute.PATCH(req("/api/goals/g1", "PATCH", { category: "ventas", current: 500 }), ctx("g1"));
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("avance_solo_manual");
    expect(goal.findFirst).not.toHaveBeenCalled();
    expect(goal.updateMany).not.toHaveBeenCalled();
  });

  it("ADR-488: POST de cubicación trimestral sin unidad → m³ del catálogo y avance 0", async () => {
    goal.create.mockResolvedValue(filaMeta({ category: "cubicacion", period: "trimestral", unit: "m³", current: "0.00" }));
    const res = await goalsRoute.POST(req("/api/goals", "POST", { name: "Cubicar", target: 150, category: "cubicacion", period: "trimestral" }));
    expect(res.status).toBe(201);
    expect(goal.create.mock.calls[0][0].data).toMatchObject({ category: "cubicacion", period: "trimestral", unit: "m³", current: 0 });
    expect(mockInvalidateByPrefix).toHaveBeenCalledWith("metas-avance:t1:");
  });

  it("ADR-488: POST con avance tipeado en una meta que se mide sola → 422 avance_solo_manual", async () => {
    const res = await goalsRoute.POST(req("/api/goals", "POST", { name: "Cubicar", target: 150, category: "cubicacion", current: 80 }));
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("avance_solo_manual");
    expect(goal.create).not.toHaveBeenCalled();
  });

  it("ADR-488: POST con una unidad que la categoría no admite → 422; PT sí vale en producción", async () => {
    goal.create.mockResolvedValue(filaMeta());
    const mala = await goalsRoute.POST(req("/api/goals", "POST", { name: "A", target: 1, category: "gastos", unit: "kg" }));
    expect(mala.status).toBe(422);
    expect(await mala.json()).toMatchObject({ code: "unidad_no_valida", error: "Esa unidad no va con esta meta: elige una de la lista" });
    const buena = await goalsRoute.POST(req("/api/goals", "POST", { name: "B", target: 1, category: "produccion", unit: "PT" }));
    expect(buena.status).toBe(201);
    expect(goal.create).toHaveBeenCalledTimes(1);
    expect(goal.create.mock.calls[0][0].data.unit).toBe("PT");
  });

  it("ADR-488: POST a mano guarda el avance tipeado y la unidad libre", async () => {
    goal.create.mockResolvedValue(filaMeta({ category: "manual" }));
    await goalsRoute.POST(req("/api/goals", "POST", { name: "Pintar", target: 10, category: "manual", unit: "paredes", current: 3 }));
    expect(goal.create.mock.calls[0][0].data).toMatchObject({ category: "manual", unit: "paredes", current: 3 });
  });

  it("ADR-488: PATCH que pasa una meta a mano a producción corrige la unidad, deja el avance en 0 y exige la categoría leída", async () => {
    goal.findFirst
      .mockResolvedValueOnce({ category: "manual", unit: "cajas" })
      .mockResolvedValueOnce(filaMeta({ category: "produccion", unit: "m³", current: "0.00" }));
    goal.updateMany.mockResolvedValue({ count: 1 });
    const res = await goalRoute.PATCH(req("/api/goals/g1", "PATCH", { category: "produccion" }), ctx("g1"));
    expect(res.status).toBe(200);
    expect(goal.findFirst.mock.calls[0][0]).toEqual({ where: { tenantId: "t1", id: "g1" }, select: { category: true, unit: true } });
    expect(goal.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", id: "g1", category: "manual" },
      data: { category: "produccion", unit: "m³", current: 0 },
    });
  });

  it("ADR-488: PATCH { unit } se mide contra la categoría guardada", async () => {
    goal.findFirst.mockResolvedValueOnce({ category: "ventas", unit: "S/" });
    const mala = await goalRoute.PATCH(req("/api/goals/g1", "PATCH", { unit: "kg" }), ctx("g1"));
    expect(mala.status).toBe(422);
    expect((await mala.json()).code).toBe("unidad_no_valida");
    expect(goal.updateMany).not.toHaveBeenCalled();

    goal.findFirst
      .mockResolvedValueOnce({ category: "despacho", unit: "m³" })
      .mockResolvedValueOnce(filaMeta({ category: "despacho", unit: "PT", current: "0.00" }));
    goal.updateMany.mockResolvedValue({ count: 1 });
    const buena = await goalRoute.PATCH(req("/api/goals/g1", "PATCH", { unit: "PT" }), ctx("g1"));
    expect(buena.status).toBe(200);
    expect(goal.updateMany).toHaveBeenCalledWith({ where: { tenantId: "t1", id: "g1", category: "despacho" }, data: { unit: "PT", current: 0 } });
  });

  it("ADR-488: si otro cambió la categoría entre la lectura y la escritura → 409 sin pisar", async () => {
    goal.findFirst.mockResolvedValueOnce({ category: "manual", unit: "cajas" }).mockResolvedValueOnce({ id: "g1" });
    goal.updateMany.mockResolvedValue({ count: 0 });
    const res = await goalRoute.PATCH(req("/api/goals/g1", "PATCH", { category: "manual", current: 4 }), ctx("g1"));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("cambio_en_paralelo");
    expect(mockInvalidateByPrefix).not.toHaveBeenCalled();
  });

  it("ADR-488: POST con un período fuera de la lista → 422", async () => {
    const res = await goalsRoute.POST(req("/api/goals", "POST", { name: "Meta", target: 10, period: "bimestral" }));
    expect(res.status).toBe(422);
    expect(goal.create).not.toHaveBeenCalled();
  });

  it("PATCH descarta lo que no está en el esquema (createdAt, tenantId)", async () => {
    goal.updateMany.mockResolvedValue({ count: 1 });
    goal.findFirst.mockResolvedValue(filaMeta({ name: "Nuevo" }));
    await goalRoute.PATCH(req("/api/goals/g1", "PATCH", { createdAt: "2020-01-01", tenantId: "otro", name: "Nuevo" }), ctx("g1"));
    expect(goal.updateMany).toHaveBeenCalledWith({ where: { tenantId: "t1", id: "g1" }, data: { name: "Nuevo" } });
  });

  it.each([[""], [null]])("PATCH con dueDate %j borra la fecha", async (dueDate) => {
    goal.updateMany.mockResolvedValue({ count: 1 });
    goal.findFirst.mockResolvedValue(filaMeta({ dueDate: null }));
    const res = await goalRoute.PATCH(req("/api/goals/g1", "PATCH", { dueDate }), ctx("g1"));
    expect(goal.updateMany.mock.calls[0][0].data).toEqual({ dueDate: null });
    expect(await res.json()).not.toHaveProperty("dueDate");
  });

  it("PATCH sin ningún campo → 422", async () => {
    const res = await goalRoute.PATCH(req("/api/goals/g1", "PATCH", {}), ctx("g1"));
    expect(res.status).toBe(422);
    expect(goal.updateMany).not.toHaveBeenCalled();
  });

  it("PATCH de una meta que no es de este negocio → 404 (el WHERE lleva el negocio de la sesión)", async () => {
    goal.updateMany.mockResolvedValue({ count: 0 });
    const res = await goalRoute.PATCH(req("/api/goals/ajena", "PATCH", { name: "x" }), ctx("ajena"));
    expect(res.status).toBe(404);
    expect(goal.updateMany).toHaveBeenCalledWith({ where: { tenantId: "t1", id: "ajena" }, data: { name: "x" } });
  });

  it("PATCH { current } de una meta de otro negocio → 404, no 422 (no se revela que existe)", async () => {
    goal.updateMany.mockResolvedValue({ count: 0 });
    goal.findFirst.mockResolvedValue(null);
    const res = await goalRoute.PATCH(req("/api/goals/ajena", "PATCH", { current: 1 }), ctx("ajena"));
    expect(res.status).toBe(404);
    expect(goal.findFirst).toHaveBeenCalledWith({ where: { tenantId: "t1", id: "ajena" }, select: { id: true } });
  });

  it("PATCH { category } de una meta de otro negocio → 404 sin escribir (la lectura previa ya filtra por negocio)", async () => {
    goal.findFirst.mockResolvedValue(null);
    const res = await goalRoute.PATCH(req("/api/goals/ajena", "PATCH", { category: "manual" }), ctx("ajena"));
    expect(res.status).toBe(404);
    expect(goal.findFirst).toHaveBeenCalledWith({ where: { tenantId: "t1", id: "ajena" }, select: { category: true, unit: true } });
    expect(goal.updateMany).not.toHaveBeenCalled();
  });

  it("DELETE filtra por el negocio y responde ok aunque no hubiera nada que borrar", async () => {
    goal.deleteMany.mockResolvedValue({ count: 0 });
    const res = await goalRoute.DELETE(req("/api/goals/g1", "DELETE"), ctx("g1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(goal.deleteMany).toHaveBeenCalledWith({ where: { tenantId: "t1", id: "g1" } });
  });

  it("sin sesión → 401 y no toca la base", async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    const res = await goalsRoute.GET(req("/api/goals", "GET"));
    expect(res.status).toBe(401);
    expect(goal.findMany).not.toHaveBeenCalled();
  });

  it("base caída → 503 con un mensaje que el panel puede mostrar", async () => {
    goal.findMany.mockRejectedValue(new Error("P1001: Can't reach database server"));
    const res = await goalsRoute.GET(req("/api/goals", "GET"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("No se pudieron cargar las metas");
  });
});

describe("/api/tasks — tareas por negocio", () => {
  it("GET: las más nuevas primero y sin los campos vacíos", async () => {
    task.findMany.mockResolvedValue([filaTarea()]);
    const res = await tasksRoute.GET(req("/api/tasks", "GET"));
    expect(task.findMany).toHaveBeenCalledWith({ where: { tenantId: "t1" }, orderBy: { createdAt: "desc" } });
    expect(await res.json()).toEqual([
      { id: "k1", title: "Contar el stock", priority: "media", status: "pendiente", createdAt: "2026-09-14T15:00:00.000Z" },
    ]);
  });

  it("POST nace pendiente aunque el body diga otra cosa; los textos vacíos se guardan como null", async () => {
    task.create.mockResolvedValue(filaTarea({ priority: "alta" }));
    const res = await tasksRoute.POST(
      req("/api/tasks", "POST", {
        title: "Contar el stock",
        description: "",
        assignedTo: "   ",
        priority: "alta",
        status: "completada",
        completedAt: "2020-01-01T00:00:00Z",
      }),
    );
    expect(res.status).toBe(201);
    expect(task.create.mock.calls[0][0].data).toEqual({
      tenantId: "t1",
      createdBy: "qa",
      title: "Contar el stock",
      description: null,
      priority: "alta",
      status: "pendiente",
      assignedTo: null,
      module: null,
      dueDate: null,
    });
  });

  it("PATCH a completada pone completedAt del servidor e ignora el que manda el cliente", async () => {
    task.update.mockResolvedValue(filaTarea({ status: "completada", completedAt: new Date() }));
    await taskRoute.PATCH(req("/api/tasks/k1", "PATCH", { status: "completada", completedAt: "2020-01-01T00:00:00Z" }), ctx("k1"));
    const { where, data } = task.update.mock.calls[0][0];
    expect(where).toEqual({ tenantId_id: { tenantId: "t1", id: "k1" } });
    expect(Object.keys(data).sort()).toEqual(["completedAt", "status"]);
    expect(data.status).toBe("completada");
    expect(data.completedAt).toBeInstanceOf(Date);
    expect(data.completedAt.getUTCFullYear()).toBeGreaterThan(2025);
  });

  it("PATCH que reabre la tarea borra completedAt", async () => {
    task.update.mockResolvedValue(filaTarea());
    await taskRoute.PATCH(req("/api/tasks/k1", "PATCH", { status: "pendiente" }), ctx("k1"));
    expect(task.update.mock.calls[0][0].data).toEqual({ status: "pendiente", completedAt: null });
  });

  it("PATCH con una prioridad fuera de la lista → 422", async () => {
    const res = await taskRoute.PATCH(req("/api/tasks/k1", "PATCH", { priority: "ya" }), ctx("k1"));
    expect(res.status).toBe(422);
    expect(task.update).not.toHaveBeenCalled();
  });

  it("PATCH de una tarea que no es de este negocio → 404", async () => {
    task.update.mockRejectedValue(noEncontrado());
    const res = await taskRoute.PATCH(req("/api/tasks/ajena", "PATCH", { title: "x" }), ctx("ajena"));
    expect(res.status).toBe(404);
  });
});
