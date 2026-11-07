/**
 * POST /api/cierre-diario («Cerrar el día», revisión 19-10): el navegador manda
 * SÓLO lo contado y la nota. Fecha, ventas, fiados, stock y el esperado de caja
 * salen de `armarCierreDelDia`; cualquier total del cuerpo se ignora.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { CUADRE_VACIO, type CuadreDelDia } from "@/lib/caja/cierres-por-dia";
import type { CierreDelDiaArmado } from "@/lib/caja/cierre-del-dia.server";

const H = vi.hoisted(() => ({ requireAdmin: vi.fn(), armar: vi.fn(), guardar: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: (...a: unknown[]) => H.requireAdmin(...a) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/caja/cierre-del-dia.server", () => ({ armarCierreDelDia: H.armar }));
vi.mock("@/lib/db/daily-summary.db", () => ({ DailySummaryDB: { guardarAMano: H.guardar } }));

import { POST } from "@/app/api/cierre-diario/route";

function armado(cerradas: Partial<CuadreDelDia> = {}): CierreDelDiaArmado {
  return {
    fecha: "2026-10-19",
    ventas: { total: 300, cantidad: 6, ticketPromedio: 50, mejorHora: "10:00 - 11:00 (3 ventas)", productoTop: "Arroz (4 und)" },
    fiados: { cobradosHoy: 20, nuevosHoy: 15, vencidos: 1 },
    // Fondo 100 + 300 vendidos en efectivo = 400 en la caja abierta.
    caja: { efectivoEsperado: 400, abiertas: 1, cerradas: { ...CUADRE_VACIO, ...cerradas } },
    stockAlertas: [{ nombre: "Leche", stock: 1, stockMin: 5 }],
  };
}

const enviar = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new NextRequest("http://localhost/api/cierre-diario", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json", ...headers },
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  H.requireAdmin.mockResolvedValue({ tenantId: "t-propio", role: "cajero", username: "qacajero" });
  H.armar.mockResolvedValue(armado());
  H.guardar.mockResolvedValue({ id: "ds-1", creado: true });
});

describe("POST /api/cierre-diario", () => {
  it("ignora los totales y la fecha del cuerpo: guarda lo armado en el servidor", async () => {
    const res = await enviar(
      { efectivoContado: 400, notas: " todo bien ", totalVentas: 99999, fecha: "1999-01-01", diferenciaCaja: 100, efectivoEsperado: 300 },
      { "x-tenant-id": "t-ajeno" },
    );
    expect(res.status).toBe(201);
    expect(H.armar).toHaveBeenCalledWith("t-propio");
    expect(H.guardar).toHaveBeenCalledWith("t-propio", new Date("2026-10-19T00:00:00.000Z"), {
      totalVentas: 300,
      cantidadVentas: 6,
      ticketPromedio: 50,
      efectivoEsperado: 400,
      efectivoContado: 400,
      diferenciaCaja: 0,
      fiadosCobrados: 20,
      fiadosNuevos: 15,
      fiadosVencidos: 1,
      mejorHora: "10:00 - 11:00 (3 ventas)",
      productoTop: "Arroz (4 und)",
      stockAlertas: JSON.stringify([{ nombre: "Leche", stock: 1, stockMin: 5 }]),
      notas: "todo bien",
      creadoPor: "qacajero",
    });
    expect(await res.json()).toMatchObject({ id: "ds-1", fecha: "2026-10-19", diferenciaCaja: 0 });
  });

  it("las cajas ya cerradas suman su propio conteo; sin conteo quedan sólo ellas", async () => {
    H.armar.mockResolvedValue(armado({ cajas: 1, esperado: 55, contado: 0, diferencia: -55, faltante: 55, peor: 55 }));
    await enviar({ efectivoContado: 400 });
    expect(H.guardar.mock.calls[0][2]).toMatchObject({ efectivoEsperado: 455, efectivoContado: 400, diferenciaCaja: -55 });

    await enviar({ efectivoContado: null });
    expect(H.guardar.mock.calls[1][2]).toMatchObject({ efectivoEsperado: 55, efectivoContado: 0, diferenciaCaja: -55 });
  });

  it("ya cerrado hoy: actualiza esa fila (200), no crea otra", async () => {
    H.guardar.mockResolvedValue({ id: "ds-1", creado: false });
    expect((await enviar({ efectivoContado: 400 })).status).toBe(200);
  });

  it("roles explícitos; el almacenero (403) no guarda nada", async () => {
    await enviar({ efectivoContado: 1 });
    expect(H.requireAdmin.mock.calls[0][1]).toEqual(["admin", "owner", "manager", "cajero"]);

    H.requireAdmin.mockResolvedValue(NextResponse.json({ error: "Sin permiso" }, { status: 403 }));
    expect((await enviar({ efectivoContado: 1 })).status).toBe(403);
    expect(H.armar).toHaveBeenCalledTimes(1);
    expect(H.guardar).toHaveBeenCalledTimes(1);
  });

  it("conteo negativo, texto o cuerpo roto → 400 sin tocar la base", async () => {
    for (const body of [{ efectivoContado: -1 }, { efectivoContado: "400" }, "{no es json"]) {
      expect((await enviar(body)).status).toBe(400);
    }
    expect(H.guardar).not.toHaveBeenCalled();
  });

  it("si la base falla, 503", async () => {
    H.guardar.mockRejectedValue(new Error("db caída"));
    expect((await enviar({ efectivoContado: 400 })).status).toBe(503);
  });
});
