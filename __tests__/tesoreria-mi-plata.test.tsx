/**
 * Mi Plata › Movimientos › Tesorería (2026-09-29).
 *
 * Lo que mentía antes y este archivo fija:
 *  - la sección se plegaba en «+1 sin usar» con cuentas cargadas, porque se
 *    encendía con las cuentas POR PAGAR (`main`: BCP + caja chica y 0 por pagar);
 *  - la vista no leía `/api/treasury/*`: las cuentas y su saldo no se veían;
 *  - el total por moneda lo da el servidor y nunca mezcla soles con dólares;
 *  - la nota de una transferencia vive en la transferencia y se cruza por `referencia`;
 *  - la pantalla NO escribe: las rutas de escritura no piden rol (cualquier
 *    sesión del panel podría mover plata) — si alguien le cablea un POST sin
 *    que el backend se arregle, este test lo agarra.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { SECCIONES, ubicar } from "@/components/admin/unified/finanzas/estructura";
import TreasuryDashboard from "@/components/admin/TreasuryDashboard";
import type { CuentaTesoreria, MovimientoTesoreria, ResumenTesoreria, TransferenciaTesoreria } from "@/hooks/use-tesoreria";

const BCP: CuentaTesoreria = {
  id: "c-bcp", nombre: "BCP Corriente", tipo: "BANCO_CORRIENTE", banco: "BCP", numeroCuenta: "191-2345678-0-12", cci: null,
  moneda: "PEN", saldo: 15000, saldoInicial: 20000, activa: true, color: null, notas: null,
  createdAt: "2026-09-05T03:08:37.425Z", updatedAt: "2026-09-05T03:09:21.913Z",
};
const CAJA: CuentaTesoreria = {
  ...BCP, id: "c-caja", nombre: "Caja chica", tipo: "CAJA_FISICA", banco: null, numeroCuenta: null, saldo: 5500, saldoInicial: 500,
};
const RESUMEN: ResumenTesoreria = {
  saldoTotal: 20500, saldoPorTipo: { BANCO_CORRIENTE: 15000, CAJA_FISICA: 5500 }, saldoPorMoneda: { PEN: 20500 },
  cuentasActivas: 2, ingresosMes: 0, egresosMes: 0, flujoNeto: 0,
};
const TRANSF: TransferenciaTesoreria = {
  id: "t-1", origenId: "c-bcp", destinoId: "c-caja", monto: 5000, descripcion: "reponer caja chica",
  createdAt: "2026-09-05T03:09:20.798Z", origenNombre: "BCP Corriente", destinoNombre: "Caja chica",
};
const MOVS: MovimientoTesoreria[] = [
  {
    id: "m-in", cuentaId: "c-caja", tipo: "TRANSFERENCIA_IN", origen: "TRANSFERENCIA", monto: 5000, saldoAnterior: 500, saldoPosterior: 5500,
    descripcion: "Transferencia desde BCP Corriente", referencia: "t-1", categoria: null, createdAt: "2026-09-05T03:09:21.723Z", cuentaNombre: "Caja chica",
  },
  {
    id: "m-out", cuentaId: "c-bcp", tipo: "TRANSFERENCIA_OUT", origen: "TRANSFERENCIA", monto: 5000, saldoAnterior: 20000, saldoPosterior: 15000,
    descripcion: "Transferencia a Caja chica", referencia: "t-1", categoria: null, createdAt: "2026-09-05T03:09:21.500Z", cuentaNombre: "BCP Corriente",
  },
];

const mockFetch = vi.fn();
function responder(o: { cuentas?: CuentaTesoreria[]; resumen?: ResumenTesoreria; status?: number } = {}) {
  mockFetch.mockImplementation((url: string) => {
    const u = String(url);
    if (o.status) return Promise.resolve({ ok: false, status: o.status, json: async () => ({ error: "forbidden" }) });
    if (u.startsWith("/api/treasury/cuentas")) return Promise.resolve({ ok: true, json: async () => o.cuentas ?? [BCP, CAJA] });
    if (u.startsWith("/api/treasury/resumen")) return Promise.resolve({ ok: true, json: async () => o.resumen ?? RESUMEN });
    if (u.startsWith("/api/treasury/transferencias")) return Promise.resolve({ ok: true, json: async () => [TRANSF] });
    if (u.startsWith("/api/treasury/movimientos")) {
      const cuenta = new URL(u, "http://x").searchParams.get("cuentaId");
      return Promise.resolve({ ok: true, json: async () => MOVS.filter((m) => !cuenta || m.cuentaId === cuenta) });
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});
afterEach(() => vi.clearAllMocks());

describe("dónde vive Tesorería", () => {
  it("en Movimientos, al lado de Caja, y se enciende con las cuentas de tesorería", () => {
    expect(ubicar("tesoreria")).toMatchObject({ tab: "movimientos", vista: "tesoreria" });
    const ids = (SECCIONES.movimientos ?? []).map((s) => s.id);
    expect(ids.indexOf("tesoreria")).toBe(ids.indexOf("flujo-caja") + 1);
    expect(SECCIONES.movimientos?.find((s) => s.id === "tesoreria")?.dato).toBe("tesoreria");
  });

  it("la sonda pregunta a /api/treasury/cuentas: con cuentas se muestra, sin cuentas se pliega, con error se muestra", async () => {
    for (const [respuesta, esperado] of [
      [{ ok: true, json: async () => [BCP] }, true],
      [{ ok: true, json: async () => [] }, false],
      [{ ok: false, status: 500, json: async () => ({}) }, true],
    ] as const) {
      vi.resetModules();
      mockFetch.mockReset();
      mockFetch.mockResolvedValue(respuesta);
      const { useSeccionesConDatos } = await import("@/hooks/use-secciones-con-datos");
      const { result } = renderHook(() => useSeccionesConDatos(["tesoreria"]));
      await waitFor(() => expect(result.current.tesoreria).toBe(esperado));
      expect(mockFetch).toHaveBeenCalledWith("/api/treasury/cuentas");
      expect(mockFetch.mock.calls.some(([u]) => String(u).includes("/api/payables"))).toBe(false);
    }
  });
});

describe("la pantalla de Tesorería", () => {
  it("muestra cada cuenta con su saldo y el total del servidor", async () => {
    responder();
    render(<TreasuryDashboard />);
    expect(await screen.findByText("S/ 20,500.00")).toBeTruthy();
    expect(screen.getByText("en 2 cuentas")).toBeTruthy();
    const bcp = screen.getByRole("button", { name: /^BCP Corriente: S\/ 15,000\.00/ });
    expect(within(bcp).getByText("Empezó con S/ 20,000.00 el 04 set.")).toBeTruthy();
    expect(within(bcp).getByText("Banco · corriente · BCP")).toBeTruthy();
    expect(within(bcp).getByText(/191-2345678-0-12/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Caja chica: S\/ 5,500\.00/ })).toBeTruthy();
  });

  it("una transferencia son dos filas con su signo, y la nota sale de la transferencia", async () => {
    responder();
    render(<TreasuryDashboard />);
    expect(await screen.findByText("− S/ 5,000.00")).toBeTruthy();
    expect(screen.getByText("+ S/ 5,000.00")).toBeTruthy();
    expect(screen.getAllByText("reponer caja chica")).toHaveLength(2);
    expect(screen.getByRole("columnheader", { name: "Cuenta" })).toBeTruthy();
  });

  it("tocar una cuenta filtra sus movimientos y se pide al servidor; «Ver todas» la suelta", async () => {
    responder();
    render(<TreasuryDashboard />);
    const bcp = await screen.findByRole("button", { name: /^BCP Corriente:/ });
    fireEvent.click(bcp);
    expect(bcp.getAttribute("aria-pressed")).toBe("true");
    expect(await screen.findByText("Movimientos de BCP Corriente")).toBeTruthy();
    expect(mockFetch.mock.calls.some(([u]) => String(u).includes("/api/treasury/movimientos?limit=100&cuentaId=c-bcp"))).toBe(true);
    await waitFor(() => expect(screen.queryByText("+ S/ 5,000.00")).toBeNull());
    expect(screen.queryByRole("columnheader", { name: "Cuenta" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver todas las cuentas" }));
    expect(await screen.findByText("+ S/ 5,000.00")).toBeTruthy();
    expect(bcp.getAttribute("aria-pressed")).toBe("false");
  });

  it("varias monedas no se suman entre sí, y el mes (que las mezcla) no se muestra", async () => {
    const usd: CuentaTesoreria = { ...BCP, id: "c-usd", nombre: "BCP Dólares", moneda: "USD", saldo: 300, saldoInicial: 300 };
    responder({
      cuentas: [BCP, CAJA, usd],
      resumen: { ...RESUMEN, saldoTotal: 20800, saldoPorMoneda: { PEN: 20500, USD: 300 }, cuentasActivas: 3, ingresosMes: 100, egresosMes: 50 },
    });
    render(<TreasuryDashboard />);
    expect(await screen.findByText("S/ 20,500.00 · USD 300.00")).toBeTruthy();
    expect(screen.queryByText(/este mes entró/)).toBeNull();
  });

  it("con una sola moneda, dice lo que entró y salió en el mes", async () => {
    responder({ resumen: { ...RESUMEN, ingresosMes: 1200, egresosMes: 300 } });
    render(<TreasuryDashboard />);
    expect(await screen.findByText("· este mes entró S/ 1,200.00 y salió S/ 300.00")).toBeTruthy();
  });

  it("una cuenta dada de baja se ve al final, marcada", async () => {
    responder({ cuentas: [{ ...CAJA, activa: false }, BCP] });
    render(<TreasuryDashboard />);
    const tarjetas = await screen.findAllByRole("button", { name: /: S\/ / });
    expect(tarjetas.map((b) => b.getAttribute("aria-label")?.split(":")[0])).toEqual(["BCP Corriente", "Caja chica"]);
    expect(within(tarjetas[1]).getByText("Dada de baja")).toBeTruthy();
  });

  it("sin cuentas lo dice en una frase y no dibuja movimientos", async () => {
    responder({ cuentas: [], resumen: { ...RESUMEN, saldoTotal: 0, saldoPorMoneda: {}, cuentasActivas: 0 } });
    render(<TreasuryDashboard />);
    expect(await screen.findByText("Todavía no hay cuentas de banco, caja ni billeteras registradas.")).toBeTruthy();
    expect(screen.getByText("Tus cuentas")).toBeTruthy();
    expect(screen.queryByText("Movimientos")).toBeNull();
  });

  it("un 403 es una frase, no una pantalla rota", async () => {
    responder({ status: 403 });
    render(<TreasuryDashboard />);
    expect(await screen.findByText(/No se pudieron cargar tus cuentas: Tu usuario no puede ver esta plata\./)).toBeTruthy();
  });

  it("sólo lee: todo lo que pide es GET a /api/treasury", async () => {
    responder();
    render(<TreasuryDashboard />);
    await screen.findByText("S/ 20,500.00");
    fireEvent.click(screen.getByRole("button", { name: /^Caja chica:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Actualizar las cuentas y sus movimientos" }));
    await waitFor(() => expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(9));
    for (const [url, init] of mockFetch.mock.calls as [string, RequestInit | undefined][]) {
      expect(String(url).startsWith("/api/treasury/")).toBe(true);
      expect((init?.method ?? "GET").toUpperCase()).toBe("GET");
    }
  });
});
