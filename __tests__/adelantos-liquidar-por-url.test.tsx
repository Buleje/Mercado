/**
 * «Cruzar en Liquidar» desde la Caja de Mi Plata (ADR-451) abre Liquidar de
 * esa persona: `?accion=liquidar&persona=<id>`.
 *
 * Antes el link llevaba `accion=liquidar` y nadie lo leía: se aterrizaba en
 * Adelantos y había que buscar a WASACO y su botón. Lo que se prueba:
 *  - con `persona` (cualquiera de sus tres ids) se abre SU Liquidar;
 *  - sin `persona`, sólo si hay UNA persona con algo para cruzar (con dos,
 *    adivinar abriría la cuenta equivocada);
 *  - el pedido sale de la URL al atenderse (si no, volver lo reabría);
 *  - quien no puede liquidar no ve el modal (mismas reglas que el botón).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import CuentasPorPersona from "@/components/admin/adelantos/cuentas/CuentasPorPersona";
import type { CuentaPersona } from "@/lib/adelantos/cuenta-unificada";
import { invalidateCachedJson } from "@/lib/client-cache-fetch";

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const persona = (id: string, nombre: string, recibido: number, madera: number): CuentaPersona => ({
  clave: `benef:${id}`,
  nombre,
  documento: null,
  telefono: null,
  beneficiarioId: id,
  parteId: `p-${id}`,
  vinculo: "id",
  adelantos: {
    teDebe: 0,
    aFavorSuyo: 0,
    abiertos: 0,
    recibidoPendiente: recibido,
    recibidoExcedido: 0,
    recibidosAbiertos: recibido > 0 ? 1 : 0,
    leDebes: recibido,
    neto: -recibido,
  },
  madera: { cargos: madera, abonos: 0, saldo: madera, porConcepto: { aserrio_prestado: madera }, movimientos: [], ultimo: "2026-09-28T00:00:00.000Z" },
  neto: Math.round((madera - recibido) * 100) / 100,
  otrasMonedas: {},
});

const WASACO = persona("b1", "Wasaco", 3031, 12323.02);
const OTRO = persona("b2", "Aserradero Norte", 500, 900);

function montar(personas: CuentaPersona[], rol = "admin") {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const u = String(input);
    if (u.startsWith("/api/auth/me")) return jsonResponse({ role: rol, authenticated: true });
    if (u === "/api/adelantos/cuentas") return jsonResponse({ forestal: true, personas, truncado: false });
    /* El modal pide sus partidas: con esto basta para que se monte. */
    if (u.startsWith("/api/adelantos/cuentas/liquidaciones")) return jsonResponse({ liquidaciones: [] });
    return jsonResponse({}, 404);
  }) as typeof fetch;
  render(<CuentasPorPersona onGoTab={() => {}} />);
}

const irA = (q: string) => window.history.replaceState(null, "", `/admin?tab=plata&vista=adelantos${q}`);
const paramsDeLaUrl = () => new URLSearchParams(window.location.search);

beforeEach(() => irA(""));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  invalidateCachedJson();
});

describe("?accion=liquidar abre Liquidar", () => {
  it("con persona=<id de Adelantos> abre el de esa persona y borra el pedido", async () => {
    irA("&accion=liquidar&persona=b1");
    montar([OTRO, WASACO]);
    expect(await screen.findByRole("dialog", { name: /Liquidar la cuenta de Wasaco/ })).toBeTruthy();
    expect(paramsDeLaUrl().get("accion")).toBeNull();
    expect(paramsDeLaUrl().get("persona")).toBeNull();
    /* Lo demás de la URL no se toca. */
    expect(paramsDeLaUrl().get("vista")).toBe("adelantos");
  });

  it("acepta también el id de la parte forestal", async () => {
    irA("&accion=liquidar&persona=p-b2");
    montar([OTRO, WASACO]);
    expect(await screen.findByRole("dialog", { name: /Liquidar la cuenta de Aserradero Norte/ })).toBeTruthy();
  });

  it("sin persona, abre sólo si hay UNA para cruzar", async () => {
    irA("&accion=liquidar");
    montar([WASACO]);
    expect(await screen.findByRole("dialog", { name: /Liquidar la cuenta de Wasaco/ })).toBeTruthy();
  });

  it("sin persona y con dos para cruzar, no adivina (pero igual limpia el pedido)", async () => {
    irA("&accion=liquidar");
    montar([OTRO, WASACO]);
    await screen.findByText("Wasaco");
    await waitFor(() => expect(paramsDeLaUrl().get("accion")).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("quien no puede liquidar no ve el modal", async () => {
    irA("&accion=liquidar&persona=b1");
    montar([WASACO], "cajero");
    await screen.findByText("Wasaco");
    await waitFor(() => expect(paramsDeLaUrl().get("accion")).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
