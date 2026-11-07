/**
 * Las tarjetas de «Productos disponibles» con TODO marcado como usado (Blas,
 * 27-09: 5 corridas de Tornillo sin permiso). Decían «Especies 0 · Sin especie
 * declarada» y «Permisos 0 · Todo dice su permiso»: falso. Ahora dicen por qué
 * no hay nada.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  FILTRO_PRODUCTOS_VACIO,
  filasDeProductos,
  porGrupo,
  resumenProductos,
  type CorridaDisponible,
} from "@/lib/forestal/productos-disponibles-resumen";
import { useKpisProductosDisponibles } from "@/components/admin/forestal/productos-disponibles-kpis";
import type { EstadoProductosDisponibles } from "@/components/admin/forestal/hooks/use-productos-disponibles";

const AHORA = new Date("2026-09-27T12:00:00-05:00");

const corridasBlas: CorridaDisponible[] = Array.from({ length: 5 }, (_, i) => ({
  id: `c${i}`,
  lineNo: i + 1,
  fecha: "2026-08-01T00:00:00.000Z",
  especie: "Tornillo",
  especieCientifica: null,
  producto: "MADERA ASERRADA (COMERCIAL)",
  presentacion: "PAQUETES",
  unidad: "m3",
  lote: null,
  cantidad: 15.29,
  volumenConsumidoM3: null,
  producido: 15.29,
  despachado: 0,
  reprocesado: 0,
  disponible: 15.29,
  paquetes: [],
  observations: null,
  titularOrigen: [],
  gtfOrigen: [],
  usadoAt: "2026-08-02T00:00:00.000Z",
  usadoMotivo: "venta sin guía",
  apartado: null,
}));

/** Lo mínimo del estado de la página que leen las tarjetas, armado con las funciones reales. */
function estado(
  corridas: CorridaDisponible[],
  extra?: { cargando?: boolean; error?: string | null },
): EstadoProductosDisponibles {
  const filas = filasDeProductos(corridas, AHORA);
  return {
    cargando: extra?.cargando ?? false,
    error: extra?.error ?? null,
    corridas,
    filas,
    filtradas: filas,
    filtro: FILTRO_PRODUCTOS_VACIO,
    resumen: resumenProductos(filas, AHORA),
    grupos: {
      permiso: porGrupo(filas, "permiso"),
      especie: porGrupo(filas, "especie"),
      producto: porGrupo(filas, "producto"),
    },
    poner: () => {},
    alternar: () => {},
  } as unknown as EstadoProductosDisponibles;
}

function Panel({ e }: { e: EstadoProductosDisponibles }) {
  const k = useKpisProductosDisponibles(e, 0);
  return (
    <div>
      {k.boton}
      {k.panel}
    </div>
  );
}

describe("tarjetas sin nada disponible", () => {
  it("no afirman «Sin especie declarada» ni «Todo dice su permiso»", () => {
    localStorage.setItem("ctp-kpis-v2:disponibles", "1");
    render(<Panel e={estado(corridasBlas)} />);
    expect(screen.queryByText("Sin especie declarada")).toBeNull();
    expect(screen.queryByText(/Todo dice su permiso/)).toBeNull();
    expect(screen.queryByText("Sin paquetes cargados")).toBeNull();
    expect(screen.queryByText(/sin costear/)).toBeNull();
    expect(screen.getAllByText("Todo está marcado usado").length).toBeGreaterThanOrEqual(6);
    expect(screen.getByText(/76\.450 m³ · no suman arriba/)).toBeTruthy();
  });

  it("plegado, el titular dice cuánto está marcado usado", () => {
    localStorage.setItem("ctp-kpis-v2:disponibles", "0");
    render(<Panel e={estado(corridasBlas)} />);
    expect(screen.getByText(/Sin producto disponible · 76\.450 m³ marcados como usados/)).toBeTruthy();
  });
});

/**
 * Brandon 27-09: «Disponibles sin 0 al cargar» — mientras el pedido no
 * volvió (o volvió con error), los indicadores no deben afirmar «0 · Nada
 * disponible»: eso es lo que dice un depósito de verdad vacío.
 */
describe("tarjetas mientras carga o si la carga falla", () => {
  it("cargando, plegado: el titular dice «Leyendo la planta…», no «0» ni «Nada disponible»", () => {
    localStorage.setItem("ctp-kpis-v2:disponibles", "0");
    render(<Panel e={estado([], { cargando: true })} />);
    expect(screen.getByText(/Leyendo la planta…/)).toBeTruthy();
    expect(screen.queryByText(/Nada disponible/)).toBeNull();
    expect(screen.queryByText(/Sin producto disponible/)).toBeNull();
  });

  it("cargando, desplegado: pinta skeletons en vez de tarjetas con «0»", () => {
    localStorage.setItem("ctp-kpis-v2:disponibles", "1");
    const { container } = render(<Panel e={estado([], { cargando: true })} />);
    expect(screen.queryByText(/Nada disponible/)).toBeNull();
    expect(screen.queryByText("Pies tablares")).toBeNull();
    expect(container.querySelectorAll(".skeleton-v4").length).toBeGreaterThan(0);
  });

  it("si la carga falla sin traer nada, plegado dice «No se pudo leer», no «Nada disponible»", () => {
    localStorage.setItem("ctp-kpis-v2:disponibles", "0");
    render(<Panel e={estado([], { cargando: false, error: "el servidor respondió 500" })} />);
    expect(screen.getByText(/No se pudo leer la planta/)).toBeTruthy();
    expect(screen.queryByText(/Nada disponible/)).toBeNull();
  });

  it("vacío de VERDAD (carga terminó, sin error, sin filas): sí dice «Nada disponible»", () => {
    localStorage.setItem("ctp-kpis-v2:disponibles", "1");
    render(<Panel e={estado([], { cargando: false, error: null })} />);
    expect(screen.getAllByText("Nada disponible").length).toBeGreaterThan(0);
  });
});
