/**
 * Abrir un turno sobre una caja YA abierta: el efectivo inicial del turno es el
 * fondo de esa caja, y lo pone el servidor.
 *
 * Antes guardaba la cifra que mandaba la pantalla: la caja abrió con S/ 50, la
 * cajera escribía S/ 80 y el historial del turno decía «Efectivo inicial
 * S/ 80.00» mientras el esperado del cajón seguía partiendo de S/ 50.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  getActivo: vi.fn(),
  abrir: vi.fn(),
  getOpen: vi.fn(),
  getById: vi.fn(),
  open: vi.fn(),
}));

vi.mock("@/lib/db/turnos.db", () => ({ TurnosDB: { getActivo: m.getActivo, abrir: m.abrir } }));
vi.mock("@/lib/db/admin-users.db", () => ({
  AdminUsersDB: { resolveIdByUsername: vi.fn(async () => "u-rosa"), verifyActiveInTenant: vi.fn(async () => true) },
}));
vi.mock("@/lib/jsondb", () => ({ CashRegistersDB: { getOpen: m.getOpen, getById: m.getById, open: m.open } }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn(async () => ({ tenantId: "t-bodega", username: "rosa", name: "Rosa", role: "cajero" })) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { POST } from "@/app/api/turnos/route";

const CAJA_ABIERTA = { id: "caja-1", status: "abierta", openingAmount: 50, movements: [] };

function abrirTurno(cuerpo: Record<string, unknown>) {
  return POST(new NextRequest("http://localhost/api/turnos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  m.getActivo.mockResolvedValue(null);
  m.abrir.mockImplementation(async (d: Record<string, unknown>) => ({ id: "turno-1", status: "ABIERTO", ...d }));
  m.getOpen.mockResolvedValue(null);
  m.getById.mockResolvedValue(null);
  m.open.mockImplementation(async (_t: string, monto: number) => ({ id: "caja-nueva", status: "abierta", openingAmount: monto, movements: [] }));
});

describe("abrir turno: el efectivo inicial con caja ya abierta", () => {
  it("adopta la caja abierta y guarda SU fondo, no la cifra de la pantalla", async () => {
    m.getOpen.mockResolvedValue(CAJA_ABIERTA);
    const res = await abrirTurno({ inicioEfectivo: 80 });
    expect(res.status).toBe(201);
    expect(m.abrir).toHaveBeenCalledWith(expect.objectContaining({ cashRegisterId: "caja-1", inicioEfectivo: 50 }));
    expect((await res.json()).inicioEfectivo).toBe(50);
  });

  it("con la caja indicada (abierta): también su fondo", async () => {
    m.getById.mockResolvedValue(CAJA_ABIERTA);
    await abrirTurno({ inicioEfectivo: 120, cashRegisterId: "caja-1" });
    expect(m.abrir).toHaveBeenCalledWith(expect.objectContaining({ cashRegisterId: "caja-1", inicioEfectivo: 50 }));
  });

  it("sin caja abierta: abre una con la cifra contada y el turno guarda esa misma", async () => {
    await abrirTurno({ inicioEfectivo: 80 });
    expect(m.open).toHaveBeenCalledWith("t-bodega", 80, "Rosa (turno)");
    expect(m.abrir).toHaveBeenCalledWith(expect.objectContaining({ cashRegisterId: "caja-nueva", inicioEfectivo: 80 }));
  });
});
