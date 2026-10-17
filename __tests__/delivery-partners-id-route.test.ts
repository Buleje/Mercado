/**
 * Reparto › Equipo: editar / pausar / borrar un repartidor (17-10).
 *
 * La ruta `/api/delivery/partners/[id]` no existía (404 en todo). Se prueba:
 * - el where siempre lleva el tenant (un id de otro negocio = 404, no toca nada);
 * - teléfono repetido = 409 con el mensaje en el campo;
 * - borrar con entregas o retiros = 409 (se perdería lo ganado), sin historial = borra;
 * - la lista y el alta no mandan `passwordHash` al navegador.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => ({ tenantId: "tenant-a", username: "qa", role: "admin" })),
}));

const p = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  countAsig: vi.fn(),
  countRetiros: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deliveryPartner: {
      findMany: p.findMany,
      findFirst: p.findFirst,
      create: p.create,
      updateMany: p.updateMany,
      deleteMany: p.deleteMany,
    },
    deliveryAssignment: { count: p.countAsig },
    partnerPayout: { count: p.countRetiros },
  },
}));

const { PUT, DELETE } = await import("@/app/api/delivery/partners/[id]/route");
const { GET, POST } = await import("@/app/api/delivery/partners/route");

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const put = (body: unknown) =>
  new NextRequest("http://localhost/api/delivery/partners/x", {
    method: "PUT",
    body: JSON.stringify(body),
  });
const del = () => new NextRequest("http://localhost/api/delivery/partners/x", { method: "DELETE" });

const JUAN = { id: "p1", name: "Juan", zone: "Centro", isActive: true, tenantId: "tenant-a" };

beforeEach(() => {
  vi.clearAllMocks();
  p.findFirst.mockResolvedValue(null);
  p.updateMany.mockResolvedValue({ count: 1 });
  p.deleteMany.mockResolvedValue({ count: 1 });
  p.countAsig.mockResolvedValue(0);
  p.countRetiros.mockResolvedValue(0);
});

describe("PUT /api/delivery/partners/[id]", () => {
  it("pausar: actualiza con tenant + id y devuelve el repartidor", async () => {
    p.findFirst.mockResolvedValueOnce({ ...JUAN, isActive: false });
    const res = await PUT(put({ isActive: false }), ctx("p1"));
    expect(res.status).toBe(200);
    expect(p.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", id: "p1" },
      data: { isActive: false },
    });
  });

  it("id de otro negocio: 404 y no devuelve nada", async () => {
    p.updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await PUT(put({ name: "Otro" }), ctx("de-otro"));
    expect(res.status).toBe(404);
    expect(p.updateMany.mock.calls[0][0].where).toEqual({ tenantId: "tenant-a", id: "de-otro" });
  });

  it("la calificación no se edita a mano (se descarta)", async () => {
    p.findFirst.mockResolvedValueOnce(JUAN);
    await PUT(put({ name: "Juan P", rating: 1 }), ctx("p1"));
    expect(p.updateMany.mock.calls[0][0].data).toEqual({ name: "Juan P" });
  });

  it("teléfono inválido: 400 con el error en su campo", async () => {
    const res = await PUT(put({ phone: "12345" }), ctx("p1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.campos.phone).toMatch(/9 dígitos/);
    expect(p.updateMany).not.toHaveBeenCalled();
  });

  it("teléfono de otro repartidor: 409 y no guarda", async () => {
    p.findFirst.mockResolvedValueOnce({ id: "p2", name: "Rosa", isActive: false });
    const res = await PUT(put({ phone: "987654321" }), ctx("p1"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.campos.phone).toMatch(/Rosa/);
    expect(body.campos.phone).toMatch(/Postulantes/);
    // busca en su negocio, sin contarse a sí mismo
    expect(p.findFirst.mock.calls[0][0].where).toEqual({
      tenantId: "tenant-a",
      phone: "987654321",
      NOT: { id: "p1" },
    });
    expect(p.updateMany).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/delivery/partners/[id]", () => {
  it("con entregas o retiros: 409, ofrece pausar y no borra", async () => {
    p.findFirst.mockResolvedValueOnce(JUAN);
    p.countAsig.mockResolvedValueOnce(3);
    p.countRetiros.mockResolvedValueOnce(1);
    const res = await DELETE(del(), ctx("p1"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/3 entregas y 1 retiro/);
    expect(body.error).toMatch(/Desactívalo/);
    expect(p.deleteMany).not.toHaveBeenCalled();
  });

  it("sin historial: borra con tenant + id", async () => {
    p.findFirst.mockResolvedValueOnce(JUAN);
    const res = await DELETE(del(), ctx("p1"));
    expect(res.status).toBe(200);
    expect(p.deleteMany).toHaveBeenCalledWith({ where: { tenantId: "tenant-a", id: "p1" } });
  });

  it("id de otro negocio: 404 sin contar ni borrar", async () => {
    const res = await DELETE(del(), ctx("de-otro"));
    expect(res.status).toBe(404);
    expect(p.findFirst.mock.calls[0][0].where).toEqual({ tenantId: "tenant-a", id: "de-otro" });
    expect(p.deleteMany).not.toHaveBeenCalled();
  });
});

describe("GET y POST /api/delivery/partners", () => {
  it("la lista omite passwordHash", async () => {
    p.findMany.mockResolvedValueOnce([]);
    await GET(new NextRequest("http://localhost/api/delivery/partners"));
    expect(p.findMany.mock.calls[0][0].omit).toEqual({ passwordHash: true });
  });

  it("alta con teléfono repetido: 409 en el campo", async () => {
    p.findFirst.mockResolvedValueOnce({ id: "p1", name: "Juan", isActive: true });
    const res = await POST(
      new NextRequest("http://localhost/api/delivery/partners", {
        method: "POST",
        body: JSON.stringify({ name: "Juan 2", phone: "987654321", zone: "Centro" }),
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).campos.phone).toMatch(/Juan/);
    expect(p.create).not.toHaveBeenCalled();
  });

  it("alta respeta «Recibe pedidos» apagado y omite passwordHash", async () => {
    p.create.mockResolvedValueOnce({ ...JUAN, isActive: false });
    const res = await POST(
      new NextRequest("http://localhost/api/delivery/partners", {
        method: "POST",
        body: JSON.stringify({ name: "Juan", phone: "987654321", zone: "Centro", fee: 6, isActive: false }),
      }),
    );
    expect(res.status).toBe(201);
    const arg = p.create.mock.calls[0][0];
    expect(arg.data).toMatchObject({ tenantId: "tenant-a", isActive: false, fee: 6 });
    expect(arg.omit).toEqual({ passwordHash: true });
  });
});
