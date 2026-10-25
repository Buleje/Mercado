/**
 * La vista «Análisis» de Adelantos (25-10): las cifras llegan sumadas del
 * servidor (`GET /api/adelantos/analisis` → `analizarAdelantos`) y la vista
 * sólo las dibuja. Se simula el endpoint con el MISMO cálculo puro, así que
 * estos tests cubren el camino entero menos la base.
 *
 * Siguen cuidando lo de ADR-448 (antes en `adelantos-actividad-analisis`):
 * lo RECIBIDO va aparte en «Lo que recibiste» y nunca entra en lo que diste;
 * cada moneda va por separado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { analizarAdelantos } from "@/lib/adelantos/analisis";
import { AnalisisView } from "@/components/admin/adelantos/AnalisisView";

vi.mock("recharts", () => {
  const Stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Nada = () => null;
  return { ResponsiveContainer: Stub, BarChart: Stub, Bar: Stub, LabelList: Nada, XAxis: Nada, YAxis: Nada, CartesianGrid: Nada, Tooltip: Nada };
});

const HACE_40_DIAS = new Date(Date.now() - 40 * 86_400_000).toISOString();

/** Un DbAdelanto mínimo (los campos que lee el cálculo), con overrides. */
function ad(overrides: Partial<DbAdelanto> & { id: string }): DbAdelanto {
  return {
    tenantId: "t1",
    codigoOperacion: `ADL-${overrides.id}`,
    reciboManual: null,
    beneficiarioId: "b1",
    beneficiario: { id: "b1", nombre: "WASACO", documento: null, telefono: null, notas: null, limiteCredito: null } as never,
    modalidad: "CUENTA_CORRIENTE",
    montoAdelantado: 1731,
    contratoId: null,
    moneda: "PEN",
    fechaAdelanto: HACE_40_DIAS,
    fechaVencimiento: null,
    status: "ABIERTO",
    saldoPendiente: 1731,
    totalEntregado: 0,
    notas: null,
    comprobanteUrl: null,
    piesTablares: null,
    piesTablaresTipo: null,
    direccion: "DADO",
    conceptoRecibido: null,
    entregas: [],
    entregasPactadas: [],
    createdAt: HACE_40_DIAS,
    updatedAt: HACE_40_DIAS,
    ...overrides,
  } as DbAdelanto;
}

/** El endpoint, con el cálculo de verdad sobre estos adelantos (dados y recibidos juntos, como la base). */
function servidor(todos: DbAdelanto[]) {
  const respuesta = { ...analizarAdelantos(todos), truncado: false };
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(respuesta), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Espera a que la vista termine de cargar (el primer bloque siempre está). */
const cargada = () => screen.findByText("Cuánto de lo que diste ya volvió");

beforeEach(() => {
  /* Los KPI viven en Indicadores plegables (11-10): abiertos, como los dejaría el usuario. */
  localStorage.setItem("ctp-kpis-v2:adelantos-analisis", "1");
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("AnalisisView — cifras del servidor", () => {
  it("pide el análisis a su endpoint propio", async () => {
    const fetchMock = servidor([ad({ id: "1" })]);
    render(<AnalisisView adelantos={[]} loading={false} />);
    await cargada();
    expect(fetchMock).toHaveBeenCalledWith("/api/adelantos/analisis", expect.objectContaining({ credentials: "include" }));
  });

  it("nombra a quien concentra lo que te deben, con nombre completo y su %", async () => {
    servidor([
      ad({ id: "1", beneficiarioId: "q", beneficiario: { id: "q", nombre: "Quispe Galindo Victor" } as never, montoAdelantado: 17000, saldoPendiente: 17000 }),
      ad({ id: "2", montoAdelantado: 8800, saldoPendiente: 8800 }),
    ]);
    render(<AnalisisView adelantos={[]} loading={false} />);
    await cargada();
    const aviso = screen.getByText(/de lo que te deben \(/);
    expect(aviso.textContent).toMatch(/Quispe Galindo Victor tiene el 66\s%/);
  });

  it("«Por modalidad» sólo aparece con más de una modalidad", async () => {
    servidor([ad({ id: "1" }), ad({ id: "2" })]);
    const { unmount } = render(<AnalisisView adelantos={[]} loading={false} />);
    await cargada();
    expect(screen.queryByText("Por modalidad")).toBeNull();
    unmount();

    servidor([ad({ id: "1" }), ad({ id: "2", modalidad: "DESCUENTO_PLANILLA" as never })]);
    render(<AnalisisView adelantos={[]} loading={false} />);
    expect(await screen.findByText("Por modalidad")).toBeTruthy();
  });

  it("si el servidor falla, avisa y deja reintentar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    render(<AnalisisView adelantos={[]} loading={false} />);
    expect(await screen.findByRole("button", { name: /Reintentar/ })).toBeTruthy();
  });
});

describe("AnalisisView — «Lo que recibiste» separado de lo dado (ADR-448)", () => {
  it("sin recibidos no dibuja el bloque", async () => {
    servidor([ad({ id: "1" })]);
    render(<AnalisisView adelantos={[]} loading={false} />);
    await cargada();
    expect(screen.queryByText("Lo que recibiste")).toBeNull();
  });

  it("con un recibido dibuja el bloque, sin tocar el KPI de lo dado", async () => {
    servidor([
      ad({ id: "1", montoAdelantado: 1000, saldoPendiente: 1000 }),
      ad({ id: "2", beneficiario: { id: "b2", nombre: "WASACO" } as never, direccion: "RECIBIDO", conceptoRecibido: "SERVICIO", montoAdelantado: 1731, saldoPendiente: 1731 }),
    ]);
    render(<AnalisisView adelantos={[]} loading={false} />);
    await cargada();
    expect(screen.getByText("Lo que recibiste")).toBeTruthy();
    // «Diste» sigue siendo SÓLO lo dado (S/ 1,000), no S/ 2,731.
    const diste = screen.getAllByText("Diste").map((el) => el.closest("[data-stat-card]")).find(Boolean) as HTMLElement;
    expect(within(diste).getByText(/1,000/)).toBeTruthy();
    expect(within(diste).queryByText(/2,731/)).toBeNull();
  });

  it("un recibido sin ningún dado muestra el bloque (no cae en «Sin datos»)", async () => {
    servidor([ad({ id: "1", direccion: "RECIBIDO", conceptoRecibido: "PRESTAMO" })]);
    render(<AnalisisView adelantos={[]} loading={false} />);
    expect(await screen.findByText("Lo que recibiste")).toBeTruthy();
    expect(screen.queryByText("Sin datos")).toBeNull();
  });

  it("nunca mezcla PEN con USD en «Por devolver»", async () => {
    servidor([
      ad({ id: "1", direccion: "RECIBIDO", conceptoRecibido: "SERVICIO", moneda: "PEN", montoAdelantado: 1000, saldoPendiente: 1000 }),
      ad({ id: "2", direccion: "RECIBIDO", conceptoRecibido: "PRESTAMO", moneda: "USD", montoAdelantado: 300, saldoPendiente: 300 }),
    ]);
    render(<AnalisisView adelantos={[]} loading={false} />);
    // Por defecto, la moneda de más volumen (PEN): «Por devolver» = S/ 1,000, nunca 1,300.
    const card = (await screen.findByText("Por devolver")).closest("[data-stat-card]") as HTMLElement;
    expect(within(card).getByText(/1,000/)).toBeTruthy();
    expect(within(card).queryByText(/1,300/)).toBeNull();
  });
});
