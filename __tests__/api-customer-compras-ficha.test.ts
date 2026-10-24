// @vitest-environment node
/**
 * GET /api/customers/[phone]/compras — la ficha 360 del panel (10-10).
 *
 * La ficha pedía /api/customers/[phone]/orders, la ruta PÚBLICA del cliente,
 * que sin la sesión del propio teléfono responde `[]`: desde el panel, Gastado
 * S/ 0,00 e historial vacío para todos. Esta ruta es del panel (mismos roles
 * que la ficha), con el tenant del JWT, y suma las ventas del POS.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { requireAdmin, getPedidos, getVentas } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getPedidos: vi.fn(),
  getVentas: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/queue", () => ({ enqueueActivityLog: vi.fn(async () => null) }));
vi.mock("@/lib/jsondb", () => ({
  normalizePhone: (p: string) => p.replace(/\D/g, "").slice(-9),
  OrdersDB: { getByCustomerPhone: getPedidos },
  SalesDB: { getByCustomerPhone: getVentas },
}));

import { GET } from "@/app/api/customers/[phone]/compras/route";

const pedir = (phone: string) =>
  GET(new NextRequest(`http://localhost/api/customers/${phone}/compras`), { params: Promise.resolve({ phone }) });

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ tenantId: "t-cuid", username: "qaadmin", role: "admin" });
  getPedidos.mockResolvedValue([
    { id: "o1", status: "pendiente", total: 21.14, paymentMethod: "yape", items: [{ name: "Arroz", quantity: 1, unit: "kg", price: 21.14 }], createdAt: "2026-04-08T22:15:08.211Z" },
    { id: "o2", status: "entregado", total: 7.2, paymentMethod: "efectivo", items: [], createdAt: "2026-05-06T22:57:40.954Z" },
  ]);
  getVentas.mockResolvedValue([
    { id: "s1", total: 15.5, payment: "efectivo", items: [{ productId: 1, name: "Leche", quantity: 2, unit: "und", price: 7.75 }], createdAt: "2026-10-09T15:00:00.000Z" },
  ]);
});

describe("GET /api/customers/[phone]/compras", () => {
  it("pedidos + ventas del POS, del tenant del JWT, la más reciente primero", async () => {
    const res = await pedir("916409675");
    expect(res.status).toBe(200);
    const cuerpo = (await res.json()) as { id: string; origen: string; status: string }[];
    expect(cuerpo.map((c) => c.id)).toEqual(["s1", "o2", "o1"]);
    expect(cuerpo[0]).toMatchObject({ origen: "venta", status: "entregado" });
    expect(getPedidos).toHaveBeenCalledWith("t-cuid", "916409675");
    expect(getVentas).toHaveBeenCalledWith("t-cuid", "916409675");
  });

  it("los mismos roles que la ficha del cliente", async () => {
    await pedir("916409675");
    expect(requireAdmin).toHaveBeenCalledWith(expect.anything(), ["admin", "manager", "cajero"]);
  });

  it("sin sesión del panel no lee nada", async () => {
    requireAdmin.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    const res = await pedir("916409675");
    expect(res.status).toBe(401);
    expect(getPedidos).not.toHaveBeenCalled();
  });

  it("teléfono inválido: 400", async () => {
    const res = await pedir("abc");
    expect(res.status).toBe(400);
  });
});
