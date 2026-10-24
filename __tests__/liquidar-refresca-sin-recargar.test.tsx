/**
 * «Liquidar cuenta» refresca sin recargar la página — ALTO medido en QA con
 * LIQ-2026-0005 (2026-09-14): tras confirmar un pago o anularlo, la fila del
 * Resumen y la cabecera del modal seguían mostrando el importe de ANTES hasta
 * que alguien recargaba la pestaña entera.
 *
 * Dos causas distintas, dos pruebas:
 *  1. `CuentasPorPersona` nunca volvía a pedir `/api/adelantos/cuentas` tras
 *     liquidar — la fila de afuera quedaba congelada.
 *  2. La cabecera de `LiquidarCuentaModal` leía del `persona` de esa lista
 *     vieja, no de las partidas frescas — aun cuando el hook SÍ las recargaba
 *     después de anular.
 *
 * `within(dialog)`: mientras el modal está abierto, la fila de atrás y la
 * cabecera de adentro pueden decir el mismo importe a la vez — sin acotar la
 * búsqueda, `findByText` revienta con «Found multiple elements».
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CuentasPorPersona from "@/components/admin/adelantos/cuentas/CuentasPorPersona";
import type { CuentaPersona } from "@/lib/adelantos/cuenta-unificada";
import type { PartidasDePersona } from "@/lib/cuentas/liquidacion";
import type { LiquidacionDTO } from "@/lib/db/liquidacion-cuenta.db";

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const personaCon = (maderaSaldo: number): CuentaPersona => ({
  clave: "benef:b1",
  nombre: "QA Aserrío",
  documento: null,
  telefono: null,
  beneficiarioId: "b1",
  parteId: "p1",
  vinculo: "id",
  adelantos: null,
  madera: {
    cargos: maderaSaldo,
    abonos: 0,
    saldo: maderaSaldo,
    porConcepto: { aserrio_prestado: maderaSaldo },
    movimientos: [],
    ultimo: "2026-09-01T00:00:00.000Z",
  },
  neto: maderaSaldo,
  otrasMonedas: {},
});

const partidasCon = (maderaSaldo: number): PartidasDePersona => ({
  persona: { beneficiarioId: "b1", parteId: "p1", nombre: "QA Aserrío", documento: null },
  cruzable: true,
  adelantos: [],
  forestal: { saldo: maderaSaldo, desde: "2026-09-01", movimientos: [] },
  fuera: [],
});

const liquidacionCon = (anulada: boolean): LiquidacionDTO => ({
  id: "liq1",
  codigo: "LIQ-2026-0005",
  fecha: "2026-09-14",
  persona: { beneficiarioId: "b1", parteId: "p1", nombre: "QA Aserrío", documento: null },
  compensado: 0,
  pago: { direccion: "recibido", monto: 100, metodo: "efectivo", moverCaja: true },
  caja: { resultado: "movida", movimientoId: "cm1" },
  // No lo lee ninguna de las dos pruebas (ni PDF ni WhatsApp) — casteado para no armar el detalle entero.
  detalle: {} as unknown as LiquidacionDTO["detalle"],
  notas: null,
  creadaPor: "qa",
  creadaEn: "2026-09-14T00:00:00.000Z",
  anulada: anulada ? { en: "2026-09-14T01:00:00.000Z", por: "qa", motivo: "Error de tipeo", reversionCajaId: null } : null,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("después de CONFIRMAR, la fila de afuera trae el saldo nuevo sin recargar", () => {
  it("de S/ 686.88 a S/ 586.88 tras pagar S/ 100, sin volver a montar la lista", async () => {
    let maderaSaldo = 686.88;

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input);
      const method = init?.method ?? "GET";
      if (u.startsWith("/api/auth/me")) return jsonResponse({ role: "admin", authenticated: true });
      if (u === "/api/adelantos/cuentas") return jsonResponse({ forestal: true, personas: [personaCon(maderaSaldo)], truncado: false });
      if (u.startsWith("/api/adelantos/cuentas/partidas")) return jsonResponse({ partidas: partidasCon(maderaSaldo), huella: "h1" });
      if (method === "POST" && u === "/api/adelantos/cuentas/liquidaciones") {
        maderaSaldo = 586.88; // el "servidor" ya registró el pago de 100
        return jsonResponse({ liquidacion: liquidacionCon(false), caja: { sinCaja: false, movimientoId: "cm1" } }, 201);
      }
      if (u.startsWith("/api/adelantos/cuentas/liquidaciones")) return jsonResponse({ liquidaciones: [] });
      return jsonResponse({}, 404);
    }) as typeof fetch;

    render(<CuentasPorPersona onGoTab={() => {}} />);

    expect(await screen.findByText(/QA Aserrío te debe S\/ 686\.88\./)).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /Liquidar la cuenta de QA Aserrío/i }));
    const dialog = await screen.findByRole("dialog");
    // Cabecera del modal con las partidas frescas.
    await within(dialog).findByText(/QA Aserrío te debe S\/ 686\.88\./);

    fireEvent.click(within(dialog).getByRole("button", { name: /Me pagó/i }));
    const monto = within(dialog).getByLabelText("Monto") as HTMLInputElement;
    fireEvent.change(monto, { target: { value: "100" } });

    const confirmar = await waitFor(() => {
      const btn = within(dialog).getByRole("button", { name: /Confirmar liquidación/i });
      expect(btn).not.toBeDisabled();
      return btn;
    });
    fireEvent.click(confirmar);

    // Pantalla de éxito — el `onCambio()` ya disparó el refetch de afuera.
    expect(await within(dialog).findByText("LIQ-2026-0005")).toBeInTheDocument();
    // `getByText` (no `getByRole`): la X del encabezado del modal también se
    // llama «Cerrar» por `aria-label`, pero no tiene ese texto VISIBLE.
    fireEvent.click(within(dialog).getByText("Cerrar"));

    // La MISMA fila (nunca se desmontó `CuentasPorPersona`) ya dice 586.88.
    expect(await screen.findByText(/QA Aserrío te debe S\/ 586\.88\./)).toBeInTheDocument();
  });
});

describe("después de ANULAR, la cabecera del modal trae el saldo revertido sin recargar", () => {
  it("de S/ 586.88 (con el pago) vuelve a S/ 686.88 al anular, sin cerrar el modal", async () => {
    let maderaSaldo = 586.88;
    let anulada = false;

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input);
      const method = init?.method ?? "GET";
      if (u.startsWith("/api/auth/me")) return jsonResponse({ role: "admin", authenticated: true });
      if (u === "/api/adelantos/cuentas") return jsonResponse({ forestal: true, personas: [personaCon(maderaSaldo)], truncado: false });
      if (u.startsWith("/api/adelantos/cuentas/partidas")) return jsonResponse({ partidas: partidasCon(maderaSaldo), huella: "h1" });
      if (method === "PATCH" && /\/api\/adelantos\/cuentas\/liquidaciones\/[^/?]+$/.test(u)) {
        anulada = true;
        maderaSaldo = 686.88; // se revierte el pago de 100
        return jsonResponse({ liquidacion: liquidacionCon(true) });
      }
      if (u.startsWith("/api/adelantos/cuentas/liquidaciones")) return jsonResponse({ liquidaciones: [liquidacionCon(anulada)] });
      return jsonResponse({}, 404);
    }) as typeof fetch;

    render(<CuentasPorPersona onGoTab={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /Liquidar la cuenta de QA Aserrío/i }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText(/QA Aserrío te debe S\/ 586\.88\./); // cabecera arranca con el saldo YA pagado

    await within(dialog).findByText("LIQ-2026-0005");
    fireEvent.click(within(dialog).getByRole("button", { name: "Anular" }));
    fireEvent.change(within(dialog).getByLabelText("Motivo de la anulación"), { target: { value: "Error de tipeo" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Confirmar anulación/i }));

    // Sin cerrar el modal: la cabecera lee las partidas frescas, no el `persona` viejo.
    expect(await within(dialog).findByText(/QA Aserrío te debe S\/ 686\.88\./)).toBeInTheDocument();
  });
});
