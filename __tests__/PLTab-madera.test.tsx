/**
 * Ganancias y pérdidas con el aserradero adentro (ADR-451).
 *
 * Antes la pantalla armaba el resultado en el navegador y el aserrío no existía:
 * en Blas setiembre salía S/ 0 con S/ 11 054,18 de corridas cobradas afuera.
 * Ahora el servidor manda los renglones hechos y la pantalla sólo los pinta. Lo
 * que se prueba es lo que puede mentir en pantalla:
 *  - el aserrío se ve con su monto y su PT (PT antes que m³, sin inventar PT);
 *  - un monto que no se sabe es «—», nunca «S/ 0.00»;
 *  - lo estimado lleva «≈», y el total también;
 *  - lo que está en cero se pliega, no desaparece;
 *  - la compra de madera se dice aparte (no resta);
 *  - quien no ve la plata del negocio no la pide y lo lee en una frase;
 *  - el clic abre el detalle con «jueves 10/09» y lleva a su origen.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { limaDateKey } from "@/lib/utils";
import type { Renglon, RespuestaDetalle, RespuestaResultado } from "@/lib/finance/resultado-del-negocio";

const rol = vi.hoisted(() => ({ actual: "admin" as string | null }));
vi.mock("@/lib/client-cache-fetch", () => ({
  cachedJson: vi.fn(async () => (rol.actual ? { role: rol.actual } : null)),
}));

import PLTab from "@/components/admin/PLTab";

const MES = limaDateKey().slice(0, 7);

const r = (fuente: Renglon["fuente"], signo: 1 | -1, extra: Partial<Renglon> = {}): Renglon => ({
  fuente,
  signo,
  monto: 0,
  certeza: "medido",
  cuantos: 0,
  pt: null,
  m3: null,
  faltan: null,
  nota: `nota de ${fuente}`,
  ...extra,
});

function respuesta(over: Partial<RespuestaResultado["actual"]> = {}): RespuestaResultado {
  return {
    actual: {
      mes: MES,
      cerradoCtp: false,
      ingresos: [
        r("mostrador", 1, { monto: 85, cuantos: 4 }),
        r("pedidos", 1),
        r("aserrio", 1, { monto: 11054.18, cuantos: 31, pt: 12345, m3: 29.1 }),
        r("madera_vendida", 1),
        r("fletes_cobrados", 1),
      ],
      costos: [
        r("mercaderia", -1, { monto: 46.75, cuantos: 4, certeza: "estimado" }),
        r("costo_madera", -1),
        r("aserrio_recibido", -1),
        r("fletes_pagados", -1, { monto: 800, cuantos: 1, m3: 30 }),
        r("gastos", -1, { monto: 20, cuantos: 1 }),
        r("planilla", -1, { monto: null, certeza: "incompleto" }),
      ],
      totalIngresos: 11139.18,
      totalCostos: 866.75,
      resultado: 10272.43,
      estimado: true,
      memo: { compras: 13803, cuantas: 7, sinCosto: 0 },
      avisos: [{ codigo: "fecha_futura", texto: "La corrida N° 63 tiene fecha 02/10: cuenta en octubre.", fuente: "aserrio", cuantos: 1 }],
      otrasMonedas: [],
      ...over,
    },
    serie: [
      { mes: "2026-08", ingresos: 60, costos: 960, resultado: -900, estimado: true, cerradoCtp: false },
      { mes: MES, ingresos: 11139.18, costos: 866.75, resultado: 10272.43, estimado: true, cerradoCtp: false },
    ],
    generadoEn: new Date().toISOString(),
  };
}

const DETALLE: RespuestaDetalle = {
  mes: MES,
  fuente: "aserrio",
  filas: [
    {
      id: "c61",
      fecha: "2026-09-10",
      quien: "WASACO",
      que: "Corrida N° 61",
      monto: 356.4,
      pt: 400,
      m3: null,
      certeza: "medido",
      enlace: { tab: "ctp-libro-operaciones", params: { seccion: "produccion", corrida: "61" } },
    },
  ],
  total: 356.4,
};

const mockFetch = vi.fn();
function responder(resultado: RespuestaResultado | { status: number }) {
  mockFetch.mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes("/api/finanzas/resultado/detalle")) return Promise.resolve({ ok: true, json: async () => DETALLE });
    if (u.includes("/api/finanzas/resultado")) {
      if (!("status" in resultado)) return Promise.resolve({ ok: true, json: async () => resultado });
      const error = resultado.status === 403 ? "forbidden" : "No se pudo armar el resultado del mes";
      return Promise.resolve({ ok: false, status: resultado.status, json: async () => ({ error }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

const pidioResultado = () => mockFetch.mock.calls.some(([u]) => String(u).includes("/api/finanzas/resultado?"));

beforeEach(() => {
  rol.actual = "admin";
  mockFetch.mockReset();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});
afterEach(() => vi.clearAllMocks());

describe("Ganancias y pérdidas lee el resultado del servidor", () => {
  it("el aserrío suma al resultado y se ve con su PT, antes que los m³", async () => {
    responder(respuesta());
    render(<PLTab />);
    const boton = await screen.findByRole("button", { name: /^Aserrío: S\/ 11,054\.18/ });
    expect(within(boton).getByText("12,345 pt · 29.10 m³ · 31 corridas")).toBeTruthy();
    /* El pedido lleva el mes de Lima y la tira de 6 meses. */
    expect(mockFetch.mock.calls.some(([u]) => String(u) === `/api/finanzas/resultado?mes=${MES}&meses=6`)).toBe(true);
  });

  it("un monto que no se sabe es «—», nunca «S/ 0.00»", async () => {
    responder(respuesta());
    render(<PLTab />);
    const planilla = (await screen.findByText("Planilla")).closest("li") as HTMLElement;
    expect(planilla).toBeTruthy();
    expect(within(planilla).getByText("—")).toBeTruthy();
    expect(within(planilla).queryByText(/S\/ 0\.00/)).toBeNull();
  });

  it("lo estimado lleva «≈» en su renglón, en su columna y en el resultado", async () => {
    responder(respuesta());
    render(<PLTab />);
    expect(await screen.findByRole("button", { name: /^Mercadería vendida: ≈ S\/ 46\.75/ })).toBeTruthy();
    expect(screen.getByText("≈ S/ 866.75")).toBeTruthy();
    expect(screen.getByText("≈ + S/ 10,272.43")).toBeTruthy();
    /* Ingresos no tiene nada estimado: su total va sin «≈». */
    expect(screen.getByText("S/ 11,139.18")).toBeTruthy();
  });

  it("los renglones en cero se pliegan en «+N sin movimiento» y un clic los muestra", async () => {
    responder(respuesta());
    render(<PLTab />);
    await screen.findByText("Mostrador");
    expect(screen.queryByText("Fletes cobrados")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "+3 sin movimiento" }));
    expect(screen.getByText("Fletes cobrados")).toBeTruthy();
    /* Planilla con «—» no se pliega: no saber no es «sin movimiento». */
    expect(screen.getByRole("button", { name: "+2 sin movimiento" })).toBeTruthy();
  });

  it("dice la compra de madera aparte y el aviso de la corrida con fecha futura", async () => {
    responder(respuesta());
    render(<PLTab />);
    expect(await screen.findByText("S/ 13,803.00")).toBeTruthy();
    expect(screen.getByText(/madera en 7 guías: resta al venderse/)).toBeTruthy();
    expect(screen.getByText(/La corrida N° 63 tiene fecha 02\/10/)).toBeTruthy();
  });

  it("el clic en un renglón abre sus filas con «jueves 10/09», y la fila lleva a su origen", async () => {
    responder(respuesta());
    const navegar = vi.fn();
    window.addEventListener("admin:navigate", navegar);
    render(<PLTab />);
    fireEvent.click(await screen.findByRole("button", { name: /^Aserrío: S\/ 11,054\.18/ }));
    const fila = await screen.findByRole("button", { name: /Corrida N° 61, jueves 10\/09: S\/ 356\.40/ });
    expect(mockFetch.mock.calls.some(([u]) => String(u) === `/api/finanzas/resultado/detalle?mes=${MES}&fuente=aserrio`)).toBe(true);
    fireEvent.click(fila);
    await waitFor(() => expect(navegar).toHaveBeenCalled());
    expect((navegar.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ tab: "ctp-libro-operaciones", vista: undefined });
    expect(new URLSearchParams(window.location.search).get("corrida")).toBe("61");
    window.removeEventListener("admin:navigate", navegar);
  });

  it("un mes sin nada anotado se dice en una frase", async () => {
    const base = respuesta().actual;
    responder(
      respuesta({
        ingresos: base.ingresos.map((x) => ({ ...x, monto: 0, cuantos: 0, pt: null, m3: null })),
        costos: base.costos.map((x) => ({ ...x, monto: 0, cuantos: 0, certeza: "medido" as const, m3: null })),
        memo: { compras: null, cuantas: 0, sinCosto: 0 },
        avisos: [],
      }),
    );
    render(<PLTab />);
    expect(await screen.findByText(/todavía no hay ventas, aserríos ni gastos anotados/)).toBeTruthy();
  });
});

describe("quien no ve la plata del negocio", () => {
  it("el cajero no la pide y lee una frase", async () => {
    rol.actual = "cajero";
    responder(respuesta());
    render(<PLTab />);
    expect(await screen.findByText("Esto lo ve el dueño o un administrador.")).toBeTruthy();
    expect(pidioResultado()).toBe(false);
  });

  it("el encargado tampoco (el servidor le da 403 aunque la navegación lo deje pasar)", async () => {
    rol.actual = "manager";
    responder(respuesta());
    render(<PLTab />);
    expect(await screen.findByText("Esto lo ve el dueño o un administrador.")).toBeTruthy();
    expect(pidioResultado()).toBe(false);
  });

  it("si el servidor igual responde 403, se dice lo mismo (sin «Reintentar»)", async () => {
    responder({ status: 403 });
    render(<PLTab />);
    expect(await screen.findByText("Esto lo ve el dueño o un administrador.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Reintentar/ })).toBeNull();
  });

  it("un error del servidor se dice y se puede reintentar", async () => {
    responder({ status: 500 });
    render(<PLTab />);
    expect(await screen.findByText("No se pudo armar el resultado del mes")).toBeTruthy();
    const reintentar = screen.getByRole("button", { name: /Reintentar/ });
    const antes = mockFetch.mock.calls.length;
    fireEvent.click(reintentar);
    await waitFor(() => expect(mockFetch.mock.calls.length).toBeGreaterThan(antes));
  });
});
