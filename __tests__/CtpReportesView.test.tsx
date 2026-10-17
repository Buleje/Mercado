/**
 * La vista «Reportes» del Libro CTP, con un reporte simulado.
 *
 * El reporte se arma con la función REAL (`armarReporte`) sobre corridas
 * inventadas y se sirve por un `fetch` falso: lo que se prueba es la pantalla
 * —qué cifras muestra, en qué orden, qué pide al cambiar un filtro y qué
 * recuerda—, no la cuenta (que tiene su propio test).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/ui-system/charts", async () => {
  const palette = await vi.importActual<typeof import("@/components/ui-system/charts/palette")>(
    "@/components/ui-system/charts/palette",
  );
  return {
    ...palette,
    BulejeComposedChart: (p: { data: unknown[]; bars?: { label: string }[] }) => (
      <div data-testid="grafico-progreso" data-puntos={p.data.length} data-barras={p.bars?.map((b) => b.label).join("|")} />
    ),
    BulejeStackedBar: (p: { stacks: { label: string }[]; data: unknown[] }) => (
      <div data-testid="grafico-pila" data-series={p.stacks.map((s) => s.label).join("|")} data-puntos={p.data.length} />
    ),
  };
});

import CtpReportesView from "@/components/admin/forestal/CtpReportesView";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { SIN_DUENO } from "@/lib/forestal/detalle-de-jornada";
import { armarReporte, resolverPeriodo, type CorridaDelReporte } from "@/lib/forestal/reportes-produccion";

const HOY = "2026-09-23";
let n = 0;
const corrida = (p: Partial<CorridaDelReporte>): CorridaDelReporte => ({
  dia: "2026-09-21",
  lineNo: ++n,
  especie: "Tornillo",
  dueno: "De tercero · WASACO",
  permiso: "10-HUA-PUE/PER-FMP-2026-007",
  m3: 1,
  otraUnidad: false,
  piezas: 20,
  entradaM3: 0,
  ...p,
});

const CORRIDAS = [
  corrida({ dia: "2026-09-08", m3: 2 }),
  corrida({ dia: "2026-09-09", m3: 1, dueno: SIN_DUENO, permiso: null, especie: "Cachimbo" }),
  corrida({ dia: "2026-09-15", m3: 0.5 }),
  corrida({ dia: "2026-09-21", m3: 1.5, entradaM3: 3 }),
];

function respuesta(url: string) {
  const q = new URL(url, "http://x").searchParams;
  const semanas = Number(q.get("semanas") ?? 8);
  const periodo = resolverPeriodo({ tipo: "semanas", semanas }, HOY);
  const reporte = armarReporte({
    corridas: CORRIDAS,
    periodo,
    agrupacion: (q.get("agrupacion") as "semana") ?? "semana",
    filtros: { duenos: q.getAll("dueno"), permisos: q.getAll("permiso"), especies: q.getAll("especie") },
    hoy: HOY,
  });
  return { ok: true, status: 200, json: async () => ({ reporte }) };
}

const mockFetch = vi.fn((url: string) => Promise.resolve(respuesta(url)));

beforeEach(() => {
  localStorage.clear();
  invalidarCtp();
  mockFetch.mockClear();
  vi.stubGlobal("fetch", mockFetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const montar = (onIr?: (v: string) => void) => render(<CtpReportesView onIr={onIr} />);

describe("CtpReportesView", () => {
  it("un título, las cifras del período y la semana más nueva arriba", async () => {
    montar();
    expect(screen.getByRole("heading", { level: 2, name: "Reportes de producción" })).toBeTruthy();
    /* 5 m³ × 424 = 2 120 PT, repartidos en sus días. */
    await screen.findAllByText("2,120 PT");
    const semanas = screen.getAllByRole("table").find((t) => within(t).queryByText(/Total ·/))!;
    const filas = within(semanas).getAllByRole("row");
    /* Encabezado, 8 semanas, total. La primera fila de datos es la en curso. */
    expect(filas).toHaveLength(10);
    expect(within(filas[1]!).getByText("21–27/09")).toBeTruthy();
    expect(within(filas[1]!).getByText("en curso")).toBeTruthy();
    expect(within(filas[9]!).getByText(/Total · 8 semanas/)).toBeTruthy();
    expect(within(filas[9]!).getByText("2,120")).toBeTruthy();
  });

  it("lo no declarado tiene su renglón y su aviso, con el camino para completarlo", async () => {
    const onIr = vi.fn();
    montar(onIr);
    await screen.findAllByText("2,120 PT");
    const pila = screen.getByTestId("grafico-pila");
    expect(pila.dataset.series).toBe("WASACO|Sin declarar");
    expect(screen.getByText(/está sin dueño declarado/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Completarlo en Producción/ }));
    expect(onIr).toHaveBeenCalledWith("produccion");
  });

  it("cambiar la partición a Permiso cambia el ranking sin volver a pedir", async () => {
    montar();
    await screen.findAllByText("2,120 PT");
    const pedidos = mockFetch.mock.calls.length;
    await userEvent.click(screen.getByRole("radio", { name: "Permiso" }));
    expect(screen.getByTestId("grafico-pila").dataset.series).toBe(
      "10-HUA-PUE/PER-FMP-2026-007|Sin permiso declarado",
    );
    expect(mockFetch.mock.calls.length).toBe(pedidos);
  });

  it("una semana más pide 9 semanas y lo recuerda en el dispositivo", async () => {
    montar();
    await screen.findAllByText("2,120 PT");
    await userEvent.click(screen.getByRole("button", { name: "Una semana más" }));
    await waitFor(() => expect(String(mockFetch.mock.calls.at(-1)?.[0])).toContain("semanas=9"));
    expect(JSON.parse(localStorage.getItem("ctp-reportes:periodo") ?? "{}").semanas).toBe(9);
  });

  it("si el servidor falla lo dice, sin inventar cifras", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, status: 500, json: async () => ({}) } as unknown as ReturnType<typeof respuesta>),
    );
    montar();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/No se pudo leer el reporte/);
    expect(screen.queryByText(/PT producidos/)).toBeNull();
  });
});
