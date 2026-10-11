/**
 * Control de caja estilo Square/Toast (11-10):
 *  - productos quitados del ticket antes de cobrar → `ActivityLog` vía
 *    POST /api/pos/quitado (monto del servidor, tenant y usuario de la sesión);
 *  - descuentos y quitados del mes por cajero → GET /api/pos/cajeros-mes;
 *  - cierre a ciegas → GET/PUT /api/pos/cierre-a-ciegas (sólo dueño/admin lo
 *    cambia; el cajero cuenta sin ver lo esperado; dueño y admin lo ven siempre).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  armarDetalle,
  cuandoLima,
  leerDetalle,
  montoDeLinea,
  resumirPorUsuario,
} from "@/lib/pos/quitados";
import { cierreACiegasActivo, cuentaACiegas, notaConteoCorregido } from "@/lib/pos/cierre-a-ciegas";

const H = vi.hoisted(() => ({
  sesion: { tenantId: "t1", username: "cajera1", role: "cajero" } as { tenantId: string; username: string; role: string },
  logActivity: vi.fn(async () => {}),
  resolveIdByUsername: vi.fn(async () => "u1"),
  getActivo: vi.fn(async () => ({ id: "turno-9" }) as { id: string } | null),
  descuentosPorCajero: vi.fn(async () => [] as { cajero: string; monto: number; tickets: number }[]),
  quitadosDelMes: vi.fn(async () => [] as { id: string; user: string; createdAt: Date; detail: string }[]),
  getFeatureFlags: vi.fn(async () => ({}) as Record<string, unknown>),
  pisarClavesFlags: vi.fn(async () => {}),
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: async (_req: unknown, roles: readonly string[]) =>
    roles.includes(H.sesion.role) ? H.sesion : NextResponse.json({ error: "forbidden" }, { status: 403 }),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: H.logActivity }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/db/admin-users.db", () => ({ AdminUsersDB: { resolveIdByUsername: H.resolveIdByUsername } }));
vi.mock("@/lib/db/turnos.db", () => ({ TurnosDB: { getActivo: H.getActivo } }));
vi.mock("@/lib/db/pos-control-cajeros.db", () => ({
  PosControlCajerosDB: { descuentosPorCajero: H.descuentosPorCajero, quitadosDelMes: H.quitadosDelMes },
}));
vi.mock("@/lib/db/settings.db", () => ({
  SettingsDB: { getFeatureFlags: H.getFeatureFlags, pisarClavesFlags: H.pisarClavesFlags },
}));

import { POST as postQuitado, GET as getQuitado } from "@/app/api/pos/quitado/route";
import { GET as getCajerosMes } from "@/app/api/pos/cajeros-mes/route";
import { GET as getCiegas, PUT as putCiegas } from "@/app/api/pos/cierre-a-ciegas/route";

const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, ...(body !== undefined && { body: JSON.stringify(body) }) });

beforeEach(() => {
  vi.clearAllMocks();
  H.sesion = { tenantId: "t1", username: "cajera1", role: "cajero" };
});

describe("lo quitado del ticket (puro)", () => {
  it("el monto de la línea descuenta su % y redondea a céntimos", () => {
    expect(montoDeLinea({ precio: 3.5, cantidad: 3 })).toBe(10.5);
    expect(montoDeLinea({ precio: 9.9, cantidad: 1, descuentoPct: 10 })).toBe(8.91);
    expect(montoDeLinea({ precio: 10, cantidad: 2, descuentoPct: 150 })).toBe(0);
  });

  it("armar → leer conserva todo; un detalle ajeno da null", () => {
    const d = armarDetalle("vaciar", [
      { productoId: 1, nombre: "Inca Kola 500 ml", cantidad: 2, precio: 3.5 },
      { productoId: 2, nombre: "Pan", cantidad: 5, precio: 0.4 },
    ], "turno-1");
    expect(d).toMatchObject({ motivo: "vaciar", unidades: 7, monto: 9, turnoId: "turno-1" });
    expect(leerDetalle(JSON.stringify(d))).toEqual(d);
    expect(leerDetalle("Usuario cambió el precio")).toBeNull();
    expect(leerDetalle(JSON.stringify({ algo: 1 }))).toBeNull();
  });

  it("suma por usuario y salta renglones rotos", () => {
    const fila = (user: string, monto: number, unidades: number) => ({
      id: `${user}-${monto}`, user, createdAt: new Date(), detail: JSON.stringify({ motivo: "linea", lineas: [], unidades, monto, turnoId: null }),
    });
    const m = resumirPorUsuario([fila("ana", 3.5, 1), fila("ana", 7, 2), fila("beto", 1, 1), { id: "x", user: "ana", createdAt: new Date(), detail: "roto" }]);
    expect(m.get("ana")).toEqual({ veces: 2, unidades: 3, monto: 10.5 });
    expect(m.get("beto")).toEqual({ veces: 1, unidades: 1, monto: 1 });
  });

  it("la fecha sale en hora de Lima con el día escrito", () => {
    expect(cuandoLima("2026-10-08T19:32:00Z")).toBe("jueves 08/10 · 14:32");
    // 03:10 UTC del viernes = 22:10 del jueves en Lima.
    expect(cuandoLima("2026-10-09T03:10:00Z")).toBe("jueves 08/10 · 22:10");
  });
});

describe("cierre a ciegas (puro)", () => {
  it("sólo `true` literal lo enciende y el dueño/admin siempre ven lo esperado", () => {
    expect(cierreACiegasActivo({})).toBe(false);
    expect(cierreACiegasActivo({ cierreACiegas: "true" })).toBe(false);
    expect(cierreACiegasActivo({ cierreACiegas: true })).toBe(true);
    expect(cuentaACiegas(true, "cajero")).toBe(true);
    expect(cuentaACiegas(true, "manager")).toBe(true);
    expect(cuentaACiegas(true, "owner")).toBe(false);
    expect(cuentaACiegas(true, "admin")).toBe(false);
    expect(cuentaACiegas(false, "cajero")).toBe(false);
  });

  it("la nota de corrección sólo sale si el conteo cambió", () => {
    expect(notaConteoCorregido(null, 540)).toBeNull();
    expect(notaConteoCorregido(540, 540)).toBeNull();
    expect(notaConteoCorregido(540, 550)).toBe("[A ciegas] contó primero S/ 540.00 y lo corrigió a S/ 550.00 tras ver lo esperado");
  });
});

describe("POST /api/pos/quitado", () => {
  it("400 con un cuerpo inválido y no escribe", async () => {
    const res = await postQuitado(req("/api/pos/quitado", "POST", { motivo: "linea", lineas: [] }));
    expect(res.status).toBe(400);
    expect(H.logActivity).not.toHaveBeenCalled();
  });

  it("registra con el tenant y el usuario de la sesión, el turno abierto y el monto del servidor", async () => {
    const res = await postQuitado(req("/api/pos/quitado", "POST", {
      motivo: "linea",
      tenantId: "OTRO",
      monto: 0.01,
      lineas: [{ productoId: 7, nombre: "Arroz 1 kg", cantidad: 2, precio: 4.2, descuentoPct: 10 }],
    }));
    expect(res.status).toBe(201);
    expect(H.getActivo).toHaveBeenCalledWith("t1", "u1");
    expect(H.logActivity).toHaveBeenCalledTimes(1);
    const [accion, entidad, detail, entityId, user, , tenantId] = H.logActivity.mock.calls[0] as unknown as [string, string, string, string, string, unknown, string];
    expect([accion, entidad, entityId, user, tenantId]).toEqual(["pos_quitar_linea", "pos_ticket", "turno-9", "cajera1", "t1"]);
    expect(JSON.parse(detail)).toMatchObject({ motivo: "linea", unidades: 2, monto: 7.56, turnoId: "turno-9" });
  });

  it("el detalle por cajero es sólo para gestión", async () => {
    expect((await getQuitado(req("/api/pos/quitado?usuario=cajera1"))).status).toBe(403);
    H.sesion = { tenantId: "t1", username: "dueno", role: "owner" };
    const res = await getQuitado(req("/api/pos/quitado?usuario=cajera1&mes=2026-10"));
    expect(res.status).toBe(200);
    expect(H.quitadosDelMes).toHaveBeenCalledWith("t1", new Date("2026-10-01T05:00:00Z"), new Date("2026-11-01T05:00:00Z"), "cajera1");
  });
});

describe("GET /api/pos/cajeros-mes", () => {
  it("junta descuentos y quitados por la clave de la base", async () => {
    H.sesion = { tenantId: "t1", username: "dueno", role: "owner" };
    H.descuentosPorCajero.mockResolvedValueOnce([{ cajero: "ana", monto: 12.5, tickets: 3 }]);
    H.quitadosDelMes.mockResolvedValueOnce([
      { id: "1", user: "beto", createdAt: new Date(), detail: JSON.stringify({ motivo: "linea", lineas: [], unidades: 2, monto: 7, turnoId: null }) },
    ]);
    const res = await getCajerosMes(req("/api/pos/cajeros-mes?mes=2026-10"));
    const data = (await res.json()) as { cajeros: { clave: string }[] };
    expect(H.descuentosPorCajero).toHaveBeenCalledWith("t1", expect.any(Date), expect.any(Date));
    expect(data.cajeros).toEqual([
      { clave: "ana", descuentos: { monto: 12.5, tickets: 3 }, quitados: { veces: 0, unidades: 0, monto: 0 } },
      { clave: "beto", descuentos: { monto: 0, tickets: 0 }, quitados: { veces: 1, unidades: 2, monto: 7 } },
    ]);
  });

  it("el cajero no ve la plata del equipo", async () => {
    expect((await getCajerosMes(req("/api/pos/cajeros-mes"))).status).toBe(403);
  });
});

describe("/api/pos/cierre-a-ciegas", () => {
  it("apagado por defecto: nadie cuenta a ciegas", async () => {
    const data = await (await getCiegas(req("/api/pos/cierre-a-ciegas"))).json();
    expect(data).toEqual({ activo: false, ciego: false });
  });

  it("encendido: el cajero a ciegas, el dueño no", async () => {
    H.getFeatureFlags.mockResolvedValue({ cierreACiegas: true });
    expect(await (await getCiegas(req("/api/pos/cierre-a-ciegas"))).json()).toEqual({ activo: true, ciego: true });
    H.sesion = { tenantId: "t1", username: "dueno", role: "owner" };
    expect(await (await getCiegas(req("/api/pos/cierre-a-ciegas"))).json()).toEqual({ activo: true, ciego: false });
    H.getFeatureFlags.mockResolvedValue({});
  });

  it("sólo dueño o admin lo cambian, y se guarda en los flags del negocio de la sesión", async () => {
    expect((await putCiegas(req("/api/pos/cierre-a-ciegas", "PUT", { activo: true }))).status).toBe(403);
    H.sesion = { tenantId: "t1", username: "dueno", role: "owner" };
    expect((await putCiegas(req("/api/pos/cierre-a-ciegas", "PUT", { activo: "si" }))).status).toBe(400);
    const res = await putCiegas(req("/api/pos/cierre-a-ciegas", "PUT", { activo: true }));
    expect(res.status).toBe(200);
    expect(H.pisarClavesFlags).toHaveBeenCalledWith("t1", { cierreACiegas: true });
  });
});
