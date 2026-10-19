/**
 * GET /api/cash-registers/por-dia — el negocio sale SÓLO de la sesión (JWT):
 * un header de otro tenant no cambia de quién son las cajas.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({ requireAdmin: vi.fn(), listar: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: (...a: unknown[]) => H.requireAdmin(...a) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/db/caja-por-dia.db", () => ({ CajaPorDiaDB: { listar: H.listar } }));

import { GET } from "@/app/api/cash-registers/por-dia/route";

const pedir = (qs = "", headers: Record<string, string> = {}) =>
  GET(new NextRequest(`http://localhost/api/cash-registers/por-dia${qs}`, { headers }));

beforeEach(() => {
  vi.clearAllMocks();
  H.requireAdmin.mockResolvedValue({ tenantId: "t-propio", role: "cajero" });
  H.listar.mockResolvedValue({ desde: "2026-08-21", dias: [], totales: { dias: 0, sinConteo: 0, recaudado: 0, discrepancia: 0 } });
});

describe("GET /api/cash-registers/por-dia", () => {
  it("pide roles explícitos y lee el tenant de la sesión, no del header", async () => {
    const res = await pedir("?dias=30", { "x-tenant-id": "t-ajeno" });
    expect(res.status).toBe(200);
    expect(H.requireAdmin.mock.calls[0][1]).toEqual(["admin", "cajero", "owner"]);
    expect(H.listar).toHaveBeenCalledWith("t-propio", { dias: 30 });
  });

  it("sin sesión: 401 y no lee nada", async () => {
    H.requireAdmin.mockResolvedValue(NextResponse.json({ error: "No autorizado" }, { status: 401 }));
    const res = await pedir();
    expect(res.status).toBe(401);
    expect(H.listar).not.toHaveBeenCalled();
  });

  it("dias fuera de rango → 400; sin dias, 60", async () => {
    expect((await pedir("?dias=999")).status).toBe(400);
    await pedir();
    expect(H.listar).toHaveBeenCalledWith("t-propio", { dias: 60 });
  });

  it("si la base falla, 503", async () => {
    H.listar.mockRejectedValue(new Error("db caída"));
    expect((await pedir()).status).toBe(503);
  });
});
