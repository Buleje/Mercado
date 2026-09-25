/**
 * Consumos › Patio (ADR-431): los componentes y hooks nuevos del rediseño.
 *
 *  · `useFiltroPatio` cuenta TODOS los filtros (antes la guía filtrada desde la
 *    cabecera cambiaba los KPI con el contador en 0) y filtra por tramos de días.
 *  · `CtpPatioPorPermiso`: la fila elegible es un botón con `aria-pressed`; la
 *    fila toda por recepcionar NO filtra (su acción es «Recepcionar») y no dice
 *    «días en el patio»; la fila sin permiso no se puede elegir y lo dice.
 *  · `CtpApartados`: pestañas de verdad, con flechas.
 *  · `useConsumosSeccion2`: «Limpiar» borra también el permiso.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { resumenPorPermiso } from "@/lib/forestal/patio-resumen";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { useFiltroPatio } from "@/components/admin/forestal/hooks/use-filtro-patio";
import { useConsumosSeccion2 } from "@/components/admin/forestal/hooks/use-consumos-seccion2";
import CtpPatioPorPermiso from "@/components/admin/forestal/CtpPatioPorPermiso";
import CtpApartados from "@/components/admin/forestal/ctp-apartados";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";

const AHORA = new Date("2026-09-24T15:00:00Z");

function troza(p: Partial<TrozaConsumible> & { id: string }): TrozaConsumible {
  return {
    woodEntryId: `we-${p.gtfNumber ?? "x"}`,
    codificacion: p.id,
    especieComun: "Huayruro",
    volumenM3: 2,
    guiaRecepcionada: true,
    fechaRecepcion: "2026-09-08T05:00:00.000Z",
    fechaIngreso: "2026-09-08T00:00:00.000Z",
    largoM: 4,
    ...p,
  };
}

/* Calcado de Blas (24-09): un permiso con todo en el patio, otro con todo por
   recepcionar (su guía sigue en la bandeja) y una pieza sin permiso. */
const TROZAS: TrozaConsumible[] = [
  troza({ id: "a1", permiso: "10-HUA", gtfNumber: "G1" }),
  troza({ id: "a2", permiso: "10-HUA", gtfNumber: "G1", largoM: 8, fechaRecepcion: "2026-07-20T05:00:00.000Z" }),
  troza({ id: "a3", permiso: "10-HUA", gtfNumber: "G2", especieComun: "Panguana" }),
  troza({ id: "b1", permiso: "19-SEC", gtfNumber: "G9", guiaRecepcionada: false, fechaRecepcion: null, volumenM3: 0.5 }),
  troza({ id: "b2", permiso: "19-SEC", gtfNumber: "G9", guiaRecepcionada: false, fechaRecepcion: null, volumenM3: 0.5 }),
  troza({ id: "c1", permiso: null, gtfNumber: "G3" }),
];

describe("useFiltroPatio (ADR-431)", () => {
  it("cuenta TODOS los campos puestos, el texto incluido, y limpiar los suelta todos", () => {
    const { result } = renderHook(() => useFiltroPatio(TROZAS));
    expect(result.current.cuantosFiltros).toBe(0);
    act(() => {
      result.current.set.texto("G1");
      result.current.set.tramos(["mas60"]);
      result.current.set.largo({ min: 5, max: null });
    });
    expect(result.current.cuantosFiltros).toBe(3);
    expect(result.current.hayFiltro).toBe(true);
    /* a2 es la única de G1 con más de 60 días y más de 5 m de largo. */
    expect(result.current.filtradas.map((t) => t.id)).toEqual(["a2"]);
    act(() => result.current.limpiar());
    expect(result.current.cuantosFiltros).toBe(0);
    expect(result.current.largo).toEqual({ min: null, max: null });
    expect(result.current.tramos).toEqual([]);
  });

  it("la pila no incluye lo por recepcionar (criterio de siempre para tildar)", () => {
    const { result } = renderHook(() => useFiltroPatio(TROZAS));
    expect(result.current.delPatio.map((t) => t.id)).not.toContain("b1");
    expect(result.current.resumen.enPatioPiezas).toBe(4);
  });
});

describe("CtpPatioPorPermiso", () => {
  const { filas, totales } = resumenPorPermiso(TROZAS, AHORA);

  it("la fila con madera en el patio es un botón que filtra, con aria-pressed y nombre con cifras", () => {
    const onElegir = vi.fn();
    render(<CtpPatioPorPermiso filas={filas} totales={totales} activos={["10-HUA"]} onElegir={onElegir} />);
    const boton = screen.getByRole("button", { name: /Filtrar el patio por 10-HUA: 3 trozas, 6[.,]000 m³/ });
    expect(boton).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(boton);
    expect(onElegir).toHaveBeenCalledWith("10-HUA");
  });

  it("la fila toda por recepcionar no filtra: ofrece «Recepcionar» y rotula el asiento, no días en el patio", () => {
    const onRecepcionar = vi.fn();
    render(
      <CtpPatioPorPermiso filas={filas} totales={totales} activos={[]} onElegir={vi.fn()} onRecepcionar={onRecepcionar} />,
    );
    expect(screen.queryByRole("button", { name: /Filtrar el patio por 19-SEC/ })).toBeNull();
    expect(screen.getByText(/0 en el patio · 2 por recepcionar/)).toBeInTheDocument();
    expect(screen.getAllByText(/asentada hace 16 días \(sin recepcionar\)/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Recepcionar la guía de 19-SEC/ }));
    expect(onRecepcionar).toHaveBeenCalledWith("19-SEC");
  });

  it("la fila sin permiso no se puede elegir y lo dice en texto visible", () => {
    render(<CtpPatioPorPermiso filas={filas} totales={totales} activos={[]} onElegir={vi.fn()} />);
    expect(screen.getByText("Sin permiso declarado")).toBeInTheDocument();
    expect(screen.getByText(/No se puede filtrar/)).toBeInTheDocument();
  });

  it("dice el error de carga en vez de «no queda madera»", () => {
    render(
      <CtpPatioPorPermiso filas={[]} totales={totales} activos={[]} onElegir={vi.fn()} error="El servidor respondió 500" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("No se pudo leer el patio: El servidor respondió 500");
    expect(screen.queryByText(/No queda madera viva/)).toBeNull();
  });
});

describe("CtpApartados — pestañas de verdad", () => {
  it("tablist/tab con aria-selected, contador con unidad y flechas que eligen", () => {
    const onIr = vi.fn();
    render(
      <CtpApartados
        idBase="t"
        etiqueta="Apartados"
        activo="patio"
        onIr={onIr}
        apartados={[
          { id: "patio", label: "Patio", contador: 46, unidad: "trozas", hint: "La pila" },
          { id: "seccion2", label: "Sección 2 · Consumos", contador: 3, unidad: "consumos" },
        ]}
      />,
    );
    expect(screen.getByRole("tablist", { name: "Apartados" })).toBeInTheDocument();
    const patio = screen.getByRole("tab", { name: "Patio, 46 trozas" });
    expect(patio).toHaveAttribute("aria-selected", "true");
    expect(patio).toHaveAttribute("aria-controls", "t-panel-patio");
    expect(patio).toHaveAccessibleDescription("La pila");
    const s2 = screen.getByRole("tab", { name: /Sección 2/ });
    expect(s2).toHaveAttribute("tabindex", "-1");
    expect(s2).not.toHaveAttribute("aria-controls");
    fireEvent.keyDown(patio, { key: "ArrowRight" });
    expect(onIr).toHaveBeenCalledWith("seccion2");
    fireEvent.keyDown(patio, { key: "End" });
    expect(onIr).toHaveBeenLastCalledWith("seccion2");
  });
});

describe("useConsumosSeccion2", () => {
  beforeEach(() => {
    invalidarCtp();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ grafo: null, lotes: [] }), { status: 200 })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    invalidarCtp();
  });

  it("«Limpiar» borra también el permiso, y el texto cuenta como filtro", async () => {
    const period = { key: "mes", label: "setiembre de 2026" } as unknown as CtpPeriod;
    const { result } = renderHook(() => useConsumosSeccion2(period));
    act(() => {
      result.current.set.permiso(["10-HUA"]);
      result.current.set.texto("huayruro");
    });
    expect(result.current.cuantosFiltros).toBe(2);
    act(() => result.current.limpiar());
    expect(result.current.filtro.permiso).toEqual([]);
    expect(result.current.filtro.texto).toBe("");
    expect(result.current.cuantosFiltros).toBe(0);
  });
});
