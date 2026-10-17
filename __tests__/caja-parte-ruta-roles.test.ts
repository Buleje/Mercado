/**
 * GET /api/cash-registers/[id]/parte — quién ve el parte de una caja.
 * Admin: todas. Cajera: la caja abierta y las cerradas en las que tuvo turno;
 * la de otro turno da 404 (no se filtra su esperado/contado/diferencia).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const m = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getCaja: vi.fn(),
  ventasDelTramo: vi.fn(async () => ({ ventas: [], truncado: false })),
  resolveId: vi.fn(),
  tieneTurno: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: m.requireAdmin }));
vi.mock("@/lib/db/sales.db", () => ({ CashRegistersDB: { getById: m.getCaja } }));
vi.mock("@/lib/db/cash-register-parte.db", () => ({ CashRegisterParteDB: { ventasDelTramo: m.ventasDelTramo } }));
vi.mock("@/lib/db/admin-users.db", () => ({ AdminUsersDB: { resolveIdByUsername: m.resolveId } }));
vi.mock("@/lib/db/turnos.db", () => ({ TurnosDB: { tieneTurnoEnCaja: m.tieneTurno } }));
vi.mock("@/lib/caja/parte-del-dia", () => ({ armarParteDelDia: vi.fn(() => ({ esperado: 100 })) }));

const CAJERA = { role: "cajero" as const, username: "caja1", tenantId: "t-1" };
const CERRADA = { id: "c1", status: "cerrada", openedAt: "2026-10-07T13:00:00.000Z", closedAt: "2026-10-07T23:00:00.000Z" };
const ctx = { params: Promise.resolve({ id: "c1" }) };
const pedir = () => new NextRequest("http://localhost/api/cash-registers/c1/parte");

describe("GET /api/cash-registers/[id]/parte — roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.resolveId.mockResolvedValue("u-caja1");
  });

  it("pide admin o cajero (el almacenero no entra)", async () => {
    m.requireAdmin.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
    const { GET } = await import("@/app/api/cash-registers/[id]/parte/route");
    const res = await GET(pedir(), ctx);
    expect(res.status).toBe(403);
    expect(m.requireAdmin).toHaveBeenCalledWith(expect.anything(), ["admin", "cajero"]);
  });

  it("cajera + caja cerrada de otro turno: 404 y no arma el parte", async () => {
    m.requireAdmin.mockResolvedValue(CAJERA);
    m.getCaja.mockResolvedValue(CERRADA);
    m.tieneTurno.mockResolvedValue(false);
    const { GET } = await import("@/app/api/cash-registers/[id]/parte/route");
    const res = await GET(pedir(), ctx);
    expect(res.status).toBe(404);
    expect(m.tieneTurno).toHaveBeenCalledWith("t-1", "u-caja1", "c1");
    expect(m.ventasDelTramo).not.toHaveBeenCalled();
  });

  it("cajera + caja cerrada donde tuvo turno: 200", async () => {
    m.requireAdmin.mockResolvedValue(CAJERA);
    m.getCaja.mockResolvedValue(CERRADA);
    m.tieneTurno.mockResolvedValue(true);
    const { GET } = await import("@/app/api/cash-registers/[id]/parte/route");
    const res = await GET(pedir(), ctx);
    expect(res.status).toBe(200);
  });

  it("cajera sin usuario resoluble: 404", async () => {
    m.requireAdmin.mockResolvedValue(CAJERA);
    m.getCaja.mockResolvedValue(CERRADA);
    m.resolveId.mockResolvedValue(null);
    const { GET } = await import("@/app/api/cash-registers/[id]/parte/route");
    const res = await GET(pedir(), ctx);
    expect(res.status).toBe(404);
    expect(m.tieneTurno).not.toHaveBeenCalled();
  });

  it("cajera + caja abierta: 200 sin buscar turno", async () => {
    m.requireAdmin.mockResolvedValue(CAJERA);
    m.getCaja.mockResolvedValue({ ...CERRADA, status: "abierta", closedAt: undefined });
    const { GET } = await import("@/app/api/cash-registers/[id]/parte/route");
    const res = await GET(pedir(), ctx);
    expect(res.status).toBe(200);
    expect(m.tieneTurno).not.toHaveBeenCalled();
  });

  it("admin ve cualquier caja cerrada", async () => {
    m.requireAdmin.mockResolvedValue({ ...CAJERA, role: "admin" });
    m.getCaja.mockResolvedValue(CERRADA);
    const { GET } = await import("@/app/api/cash-registers/[id]/parte/route");
    const res = await GET(pedir(), ctx);
    expect(res.status).toBe(200);
    expect(m.tieneTurno).not.toHaveBeenCalled();
  });

  it("caja de otro negocio: 404", async () => {
    m.requireAdmin.mockResolvedValue({ ...CAJERA, role: "admin" });
    m.getCaja.mockResolvedValue(null);
    const { GET } = await import("@/app/api/cash-registers/[id]/parte/route");
    const res = await GET(pedir(), ctx);
    expect(res.status).toBe(404);
  });
});
