/**
 * «Cerrar turno»: el esperado del cajón sale del servidor, nunca de una cuenta
 * inventada en la pantalla.
 *
 * Antes, si la caja del turno no cargaba, el modal caía a
 * `inicioEfectivo + ventasTotal`, y `ventasTotal` vale 0 mientras el turno está
 * abierto (lo escribe el cierre): con S/ 50 de fondo y S/ 345.50 vendidos
 * mostraba «Esperado S/ 50.00» y dejaba cerrar comparando contra eso.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));

import { useCierreTurno } from "@/components/admin/turnos/use-cierre-turno";
import type { Turno } from "@/components/admin/turnos/tipos";

const TURNO: Turno = {
  id: "turno-1",
  adminUserId: "u-1",
  cashRegisterId: "caja-1",
  inicioEfectivo: 50,
  ventasTotal: 0,
  status: "ABIERTO",
  abrioEn: "2026-10-10T13:00:00.000Z",
};

type Ruta = (init?: RequestInit) => Response;
const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

/** Un `fetch` falso que responde por prefijo de ruta (la más larga primero). */
function servidor(rutas: Record<string, Ruta>) {
  const claves = Object.keys(rutas).sort((a, b) => b.length - a.length);
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const k = claves.find((c) => u.startsWith(c));
    return k ? rutas[k](init) : json({ error: "no" }, 404);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function montar(turno: Turno = TURNO) {
  const hook = renderHook(() => useCierreTurno({ turnoActivo: turno, cajeroNombre: "Rosa", onCerrado: vi.fn(), refrescar: vi.fn() }));
  act(() => hook.result.current.abrirCierre());
  return hook;
}

const llamadasA = (fn: ReturnType<typeof servidor>, prefijo: string) =>
  fn.mock.calls.filter(([u]) => String(u).startsWith(prefijo)).length;

afterEach(() => { vi.unstubAllGlobals(); });

describe("cerrar turno: el esperado sale del servidor", () => {
  it("si la caja no carga, no muestra un esperado inventado ni deja cerrar con él", async () => {
    const fetchFalso = servidor({ "/api/cash-registers": () => json({ error: "caído" }, 500) });
    const { result } = montar();
    await waitFor(() => expect(llamadasA(fetchFalso, "/api/cash-registers")).toBe(1));
    await act(async () => { await Promise.resolve(); });

    // Antes: 50 (fondo + ventasTotal 0) con S/ 345.50 vendidos.
    expect(result.current.esperado).toBeNull();
    expect(result.current.esperadoFallo).toBe(true);

    act(() => result.current.setCierreEfectivo("50"));
    await act(async () => { await result.current.handleCerrar(); });
    expect(llamadasA(fetchFalso, "/api/turnos/turno-1/cerrar")).toBe(0);
    expect(result.current.closeError).toMatch(/no se pudo calcular lo esperado/i);
  });

  it("con su caja abierta usa el efectivo esperado que suma el servidor (no los últimos 100 movimientos)", async () => {
    servidor({
      "/api/cash-registers": () => json([
        {
          id: "caja-1",
          status: "abierta",
          openingAmount: 50,
          // El listado corta en 100 movimientos: aquí sólo llegó la apertura.
          movements: [{ type: "apertura", method: "efectivo", amount: 50 }],
          efectivoEsperado: 395.5,
        },
      ]),
    });
    const { result } = montar();
    await waitFor(() => expect(result.current.esperado).toBe(395.5));
  });

  it("turno sin caja vinculada: fondo + ventas del resumen del servidor (lo mismo que usará el cierre)", async () => {
    const fetchFalso = servidor({
      // Otra caja abierta: antes el modal la tomaba «por si acaso».
      "/api/cash-registers": () => json([{ id: "otra", status: "abierta", openingAmount: 900, movements: [], efectivoEsperado: 900 }]),
      "/api/turnos/turno-1/summary": () => json({ cantidadVentas: 7, totalVendido: 345.5, metodosPago: [], topProductos: [] }),
    });
    const { result } = montar({ ...TURNO, cashRegisterId: undefined });
    await waitFor(() => expect(result.current.esperado).toBe(395.5));
    expect(llamadasA(fetchFalso, "/api/turnos/turno-1/summary")).toBe(1);
  });

  it("su caja ya se cerró: el cierre caerá a fondo + ventas, y el modal muestra eso mismo", async () => {
    servidor({
      "/api/cash-registers": () => json([{ id: "caja-1", status: "cerrada", openingAmount: 50, movements: [], expectedAmount: 80 }]),
      "/api/turnos/turno-1/summary": () => json({ cantidadVentas: 2, totalVendido: 30, metodosPago: [], topProductos: [] }),
    });
    const { result } = montar();
    await waitFor(() => expect(result.current.esperado).toBe(80));
  });

  it("«Reintentar» vuelve a pedirlo y, si responde, deja cerrar", async () => {
    let caido = true;
    const fetchFalso = servidor({
      "/api/cash-registers": () => caido
        ? json({ error: "caído" }, 500)
        : json([{ id: "caja-1", status: "abierta", openingAmount: 50, movements: [], efectivoEsperado: 120 }]),
      "/api/turnos/turno-1/cerrar": () => json({ id: "turno-1", diferencia: 0, ventasTotal: 70, cerroEn: "2026-10-10T20:00:00.000Z" }),
      "/api/turnos/turno-1/summary": () => json({ cantidadVentas: 1, totalVendido: 70, metodosPago: [], topProductos: [] }),
      "/api/sales": () => json([]),
    });
    const { result } = montar();
    await waitFor(() => expect(result.current.esperadoFallo).toBe(true));

    caido = false;
    act(() => result.current.reintentarEsperado());
    await waitFor(() => expect(result.current.esperado).toBe(120));
    expect(result.current.esperadoFallo).toBe(false);

    act(() => result.current.setCierreEfectivo("120"));
    await act(async () => { await result.current.handleCerrar(); });
    expect(llamadasA(fetchFalso, "/api/turnos/turno-1/cerrar")).toBe(1);
  });
});
