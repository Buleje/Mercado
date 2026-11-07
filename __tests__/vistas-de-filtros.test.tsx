// @vitest-environment jsdom
/**
 * Vistas guardadas de los filtros del encabezado (25-10): una vista es todo lo
 * puesto en los embudos de una tabla. Aplicarla pone todas las columnas de una
 * vez; lo de una columna que ya no existe (la tabla cambió desde que se guardó)
 * se descarta en vez de dejar un filtro invisible que esconde filas. Lo leído
 * del navegador o del servidor se valida antes de aplicarlo.
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { esEstadoFiltros } from "@/components/admin/shared/vistas-de-filtros";

type Fila = { cliente: string; estado: string; saldo: number };
const FILAS: Fila[] = [
  { cliente: "Rosa Pérez", estado: "vencido", saldo: 120 },
  { cliente: "Juan Ríos", estado: "al día", saldo: 40 },
  { cliente: "Rosa Vela", estado: "al día", saldo: 300 },
];
const COLUMNAS: readonly ColumnaFiltro<Fila>[] = [
  { id: "cliente", label: "Cliente", tipo: "texto", valor: (f) => f.cliente },
  { id: "estado", label: "Estado", tipo: "multi", valor: (f) => f.estado },
  { id: "saldo", label: "Saldo", tipo: "rango", numero: (f) => f.saldo },
];

describe("useFiltrosTabla · estado y aplicarEstado", () => {
  it("el estado refleja lo puesto y aplicarlo en otra tabla da las mismas filas", () => {
    const a = renderHook(() => useFiltrosTabla(FILAS, COLUMNAS));
    act(() => {
      a.result.current.setTexto("cliente", "rosa");
      a.result.current.setFaceta("estado", ["al día"]);
    });
    expect(a.result.current.filtradas.map((f) => f.cliente)).toEqual(["Rosa Vela"]);

    const b = renderHook(() => useFiltrosTabla(FILAS, COLUMNAS));
    act(() => b.result.current.aplicarEstado(a.result.current.estado));
    expect(b.result.current.filtradas.map((f) => f.cliente)).toEqual(["Rosa Vela"]);
    expect(b.result.current.activos).toBe(2);
  });

  it("descarta lo de columnas que ya no existen o que cambiaron de tipo", () => {
    const { result } = renderHook(() => useFiltrosTabla(FILAS, COLUMNAS));
    act(() =>
      result.current.aplicarEstado({
        facetas: { borrada: ["x"], cliente: ["Rosa Pérez"], saldo: { min: 100, max: null } },
        textos: { estado: "vencido", vieja: "algo", cliente: "  " },
      }),
    );
    expect(result.current.activos).toBe(1);
    expect(result.current.filtradas.map((f) => f.cliente)).toEqual(["Rosa Pérez", "Rosa Vela"]);
  });

  it("aplicar la vista vacía limpia todo", () => {
    const { result } = renderHook(() => useFiltrosTabla(FILAS, COLUMNAS));
    act(() => result.current.setFaceta("estado", ["vencido"]));
    act(() => result.current.aplicarEstado({ facetas: {}, textos: {} }));
    expect(result.current.activos).toBe(0);
    expect(result.current.filtradas).toHaveLength(3);
  });
});

describe("esEstadoFiltros", () => {
  it("acepta listas de textos, rangos y textos por columna", () => {
    expect(esEstadoFiltros({ facetas: { a: ["x"], b: { min: 1, max: null }, c: { min: "2026-10-01", max: null } }, textos: { d: "q" } })).toBe(true);
    expect(esEstadoFiltros({ facetas: {}, textos: {} })).toBe(true);
  });
  it("rechaza lo que no tiene esa forma", () => {
    expect(esEstadoFiltros(null)).toBe(false);
    expect(esEstadoFiltros({ facetas: [], textos: {} })).toBe(false);
    expect(esEstadoFiltros({ facetas: { a: [1] }, textos: {} })).toBe(false);
    expect(esEstadoFiltros({ facetas: { a: { min: 1 } }, textos: {} })).toBe(false);
    expect(esEstadoFiltros({ facetas: {}, textos: { a: 3 } })).toBe(false);
  });
});
