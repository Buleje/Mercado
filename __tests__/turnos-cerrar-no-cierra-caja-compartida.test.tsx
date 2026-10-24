/**
 * Cerrar el turno de una cajera NO cierra la caja si otro turno abierto la usa.
 *
 * El negocio tiene UNA caja y varios turnos pueden usarla a la vez (POST
 * /api/turnos adopta la caja abierta). Antes, cuando Rosa cerraba su turno, el
 * servidor cerraba también la caja que compartía con Pedro; al cerrar Pedro, su
 * caja ya estaba cerrada y su esperado caía a «fondo + todo lo vendido», Yape
 * incluido (dinero que nunca estuvo en el cajón). El cron de turnos olvidados ya
 * revisaba esto; el cierre a mano, no.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NextRequest, NextResponse } from "next/server";

const m = vi.hoisted(() => ({
  auth: { tenantId: "t-bodega", username: "rosa", role: "cajero" } as { tenantId: string; username: string; role: string },
  turnoFindUnique: vi.fn(),
  turnoFindFirst: vi.fn(),
  turnoFindMany: vi.fn(),
  saleAggregate: vi.fn(),
  turnosCerrar: vi.fn(),
  otrosAbiertos: vi.fn(),
  cajaGetById: vi.fn(),
  cajaClose: vi.fn(),
  logActivity: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    turno: { findUnique: m.turnoFindUnique, findFirst: m.turnoFindFirst, findMany: m.turnoFindMany },
    sale: { aggregate: m.saleAggregate },
  },
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn(async () => m.auth) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/db/admin-users.db", () => ({
  AdminUsersDB: {
    resolveIdByUsername: vi.fn(async (_t: string, u: string) => `u-${u}`),
    getUsernameById: vi.fn(async (_t: string, id: string) => id.replace(/^u-/, "")),
  },
}));
vi.mock("@/lib/db/turnos.db", () => ({ TurnosDB: { cerrar: m.turnosCerrar, otrosAbiertosEnCaja: m.otrosAbiertos } }));
vi.mock("@/lib/jsondb", () => ({ CashRegistersDB: { getById: m.cajaGetById, close: m.cajaClose } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: m.logActivity }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));

import { POST as cerrarTurno } from "@/app/api/turnos/[id]/cerrar/route";
import { GET as turnoActivo } from "@/app/api/turnos/activo/route";
import { useCierreTurno } from "@/components/admin/turnos/use-cierre-turno";
import { lineaCajaSigueAbierta, type Turno, type TurnoSummary } from "@/components/admin/turnos/tipos";
import { HORAS_TURNO_OLVIDADO } from "@/lib/caja/cierre-sin-conteo";

const ABRIO = new Date("2026-10-10T13:00:00.000Z");
/** La caja de la bodega, compartida: fondo 50; Rosa vendió 100 en efectivo y 120 por Yape; Pedro, 80 en efectivo; un egreso de 10. */
const CAJA = {
  id: "caja-1",
  status: "abierta",
  openingAmount: 50,
  movements: [
    { type: "apertura", method: "efectivo", amount: 50 },
    { type: "venta", method: "efectivo", amount: 100 },
    { type: "venta", method: "yape", amount: 120 },
    { type: "venta", method: "efectivo", amount: 80 },
    { type: "egreso", method: "efectivo", amount: 10 },
  ],
};
/** 50 + 100 + 80 − 10: lo que debe haber en el cajón (el Yape no entra). */
const ESPERADO_CAJA = 220;

const turno = (id: string, adminUserId: string, tenantId = "t-bodega") =>
  ({ id, tenantId, adminUserId, cashRegisterId: "caja-1", status: "ABIERTO", abrioEn: ABRIO, inicioEfectivo: 50 });

async function cerrar(id: string, cierreEfectivo: number) {
  const req = new NextRequest(`http://localhost/api/turnos/${id}/cerrar`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cierreEfectivo }),
  });
  return cerrarTurno(req, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.auth = { tenantId: "t-bodega", username: "rosa", role: "cajero" };
  m.saleAggregate.mockResolvedValue({ _sum: { total: 220 } });
  m.turnosCerrar.mockImplementation(async (id: string) => ({ id, status: "CERRADO", cerroEn: "2026-10-10T20:00:00.000Z" }));
  m.cajaGetById.mockResolvedValue(CAJA);
  m.cajaClose.mockImplementation(async (_t: string, id: string, contado: number) =>
    ({ ...CAJA, id, status: "cerrada", expectedAmount: ESPERADO_CAJA, difference: contado - ESPERADO_CAJA }));
});

describe("cerrar turno con la caja compartida", () => {
  it("Rosa cierra con Pedro vendiendo: su turno se cierra, la caja NO, y la diferencia es contra el esperado de la caja", async () => {
    m.turnoFindUnique.mockResolvedValue(turno("turno-rosa", "u-rosa"));
    m.otrosAbiertos.mockResolvedValue([{ id: "turno-pedro", cajeroNombre: "Pedro" }]);

    const res = await cerrar("turno-rosa", 225);
    expect(res.status).toBe(200);
    const d = await res.json();

    expect(m.turnosCerrar).toHaveBeenCalledTimes(1);
    expect(m.cajaClose).not.toHaveBeenCalled();
    expect(d.cashRegisterClosed).toBe(false);
    expect(d.cajaSigueAbierta).toBe(true);
    expect(d.cajaLaUsan).toEqual(["Pedro"]);
    // El esperado de la caja (no «fondo 50 + 220 vendidos» con el Yape dentro).
    expect(d.expectedAmount).toBe(ESPERADO_CAJA);
    expect(d.diferencia).toBe(5);
    // Mismo criterio que el cron: un turno olvidado (>12 h) no retiene la caja.
    const [tenant, caja, excluir, opts] = m.otrosAbiertos.mock.calls[0];
    expect([tenant, caja, excluir]).toEqual(["t-bodega", "caja-1", "turno-rosa"]);
    expect(Math.abs(Date.now() - HORAS_TURNO_OLVIDADO * 3_600_000 - opts.abiertosDesde.getTime())).toBeLessThan(5_000);
    // El registro del cierre lo dice.
    expect(String(m.logActivity.mock.calls[0][2])).toContain("la caja sigue abierta: la usa el turno de Pedro");
  });

  it("después Pedro cierra último: ahí sí se cierra la caja, con su conteo y el esperado de la caja", async () => {
    m.auth = { tenantId: "t-bodega", username: "pedro", role: "cajero" };
    m.turnoFindUnique.mockResolvedValue(turno("turno-pedro", "u-pedro"));
    m.otrosAbiertos.mockResolvedValue([]);

    const res = await cerrar("turno-pedro", 220);
    const d = await res.json();

    expect(m.cajaClose).toHaveBeenCalledWith("t-bodega", "caja-1", 220, expect.stringContaining("Cierre de turno"));
    expect(d.cashRegisterClosed).toBe(true);
    expect(d.cajaSigueAbierta).toBe(false);
    expect(d.expectedAmount).toBe(ESPERADO_CAJA);
    expect(d.diferencia).toBe(0);
  });

  it("un turno de otro negocio: 404 y no toca ni el turno ni la caja", async () => {
    m.turnoFindUnique.mockResolvedValue(turno("turno-ajeno", "u-rosa", "t-otro"));
    const res = await cerrar("turno-ajeno", 100);
    expect(res.status).toBe(404);
    expect(m.turnosCerrar).not.toHaveBeenCalled();
    expect(m.otrosAbiertos).not.toHaveBeenCalled();
    expect(m.cajaClose).not.toHaveBeenCalled();
  });

  it("el turno activo dice quién más usa la caja (para avisarlo antes de contar)", async () => {
    m.turnoFindFirst.mockResolvedValue({ ...turno("turno-rosa", "u-rosa"), ventasTotal: 0, adminUser: { name: "Rosa", username: "rosa" } });
    m.otrosAbiertos.mockResolvedValue([{ id: "turno-pedro", cajeroNombre: "Pedro" }]);
    const res = await turnoActivo(new NextRequest("http://localhost/api/turnos/activo"));
    const d = await res.json();
    expect(d.turno.cajaCompartidaCon).toEqual(["Pedro"]);
    expect(m.otrosAbiertos).toHaveBeenCalledWith("t-bodega", "caja-1", "turno-rosa", expect.objectContaining({ abiertosDesde: expect.any(Date) }));
  });
});

describe("TurnosDB.otrosAbiertosEnCaja (la consulta real)", () => {
  it("filtra por negocio, caja, abiertos, sin el propio y desde el corte de olvidados", async () => {
    const real = await vi.importActual<typeof import("@/lib/db/turnos.db")>("@/lib/db/turnos.db");
    m.turnoFindMany.mockResolvedValue([{ id: "turno-pedro", adminUser: { name: " ", username: "pedro" } }]);
    const desde = new Date("2026-10-10T08:00:00.000Z");
    const r = await real.TurnosDB.otrosAbiertosEnCaja("t-bodega", "caja-1", "turno-rosa", { abiertosDesde: desde });
    expect(r).toEqual([{ id: "turno-pedro", cajeroNombre: "pedro" }]);
    expect(m.turnoFindMany.mock.calls[0][0].where).toEqual({
      tenantId: "t-bodega",
      cashRegisterId: "caja-1",
      status: "ABIERTO",
      id: { not: "turno-rosa" },
      abrioEn: { gte: desde },
    });
  });
});

describe("la pantalla lo explica en una línea", () => {
  it("texto de la línea", () => {
    expect(lineaCajaSigueAbierta([])).toBeNull();
    expect(lineaCajaSigueAbierta(undefined)).toBeNull();
    expect(lineaCajaSigueAbierta(["Pedro"])).toBe("La caja sigue abierta: la usa el turno de Pedro");
    expect(lineaCajaSigueAbierta(["Pedro", "Ana"])).toBe("La caja sigue abierta: la usan los turnos de Pedro y Ana");
  });

  it("la ventana de cierre la muestra antes de contar y el resumen la recibe del servidor", async () => {
    const TURNO: Turno = {
      id: "turno-rosa", adminUserId: "u-rosa", cashRegisterId: "caja-1", inicioEfectivo: 50, ventasTotal: 0,
      status: "ABIERTO", abrioEn: ABRIO.toISOString(), cajaCompartidaCon: ["Pedro"],
    };
    const json = (c: unknown) => new Response(JSON.stringify(c), { status: 200, headers: { "Content-Type": "application/json" } });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      if (u.startsWith("/api/cash-registers")) return json([{ id: "caja-1", status: "abierta", openingAmount: 50, efectivoEsperado: ESPERADO_CAJA, movements: [] }]);
      if (u.endsWith("/cerrar")) return json({ id: "turno-rosa", cerroEn: "2026-10-10T20:00:00.000Z", ventasTotal: 220, diferencia: 5, cajaSigueAbierta: true, cajaLaUsan: ["Pedro"] });
      if (u.includes("/summary")) return json({ cantidadVentas: 2, totalVendido: 220 });
      return json([]);
    }));
    const onCerrado = vi.fn<(r: TurnoSummary) => void>();
    const { result } = renderHook(() => useCierreTurno({ turnoActivo: TURNO, cajeroNombre: "Rosa", onCerrado, refrescar: vi.fn() }));
    act(() => result.current.abrirCierre());
    await waitFor(() => expect(result.current.esperado).toBe(ESPERADO_CAJA));
    expect(result.current.cajaSigueAbierta).toBe("La caja sigue abierta: la usa el turno de Pedro");

    act(() => result.current.setCierreEfectivo("225"));
    await act(async () => { await result.current.handleCerrar(); });
    expect(onCerrado).toHaveBeenCalledTimes(1);
    expect(onCerrado.mock.calls[0][0].cajaLaUsan).toEqual(["Pedro"]);
    expect(onCerrado.mock.calls[0][0].diferencia).toBe(5);
    vi.unstubAllGlobals();
  });
});
