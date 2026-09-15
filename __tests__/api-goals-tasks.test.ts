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

const goal = { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() };
const task = { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() };
vi.mock("@/lib/prisma", () => ({ prisma: { adminGoal: goal, adminTask: task } }));

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

  it("PATCH { current } cambia sólo el avance: no pisa la categoría con el valor por defecto", async () => {
    goal.update.mockResolvedValue(filaMeta({ category: "caja", current: "12000.00" }));
    const res = await goalRoute.PATCH(req("/api/goals/g1", "PATCH", { current: 12000 }), ctx("g1"));
    expect(res.status).toBe(200);
    expect(goal.update).toHaveBeenCalledWith({ where: { tenantId_id: { tenantId: "t1", id: "g1" } }, data: { current: 12000 } });
    expect((await res.json()).current).toBe(12000);
  });

  it("PATCH descarta lo que no está en el esquema (createdAt, tenantId)", async () => {
    goal.update.mockResolvedValue(filaMeta({ name: "Nuevo" }));
    await goalRoute.PATCH(req("/api/goals/g1", "PATCH", { createdAt: "2020-01-01", tenantId: "otro", name: "Nuevo" }), ctx("g1"));
    expect(goal.update.mock.calls[0][0].data).toEqual({ name: "Nuevo" });
  });

  it.each([[""], [null]])("PATCH con dueDate %j borra la fecha", async (dueDate) => {
    goal.update.mockResolvedValue(filaMeta({ dueDate: null }));
    const res = await goalRoute.PATCH(req("/api/goals/g1", "PATCH", { dueDate }), ctx("g1"));
    expect(goal.update.mock.calls[0][0].data).toEqual({ dueDate: null });
    expect(await res.json()).not.toHaveProperty("dueDate");
  });

  it("PATCH sin ningún campo → 422", async () => {
    const res = await goalRoute.PATCH(req("/api/goals/g1", "PATCH", {}), ctx("g1"));
    expect(res.status).toBe(422);
    expect(goal.update).not.toHaveBeenCalled();
  });

  it("PATCH de una meta que no es de este negocio → 404", async () => {
    goal.update.mockRejectedValue(noEncontrado());
    const res = await goalRoute.PATCH(req("/api/goals/ajena", "PATCH", { current: 1 }), ctx("ajena"));
    expect(res.status).toBe(404);
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
