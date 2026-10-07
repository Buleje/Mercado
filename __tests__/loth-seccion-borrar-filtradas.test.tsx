/**
 * «Borrar las N filtradas» de Secciones (Brandon 07-10-2026): con el filtro de
 * Permiso o Titular puesto, la opción pasa EXACTAMENTE los ids que deja el
 * filtro (de todas las páginas), no los de la página ni los de la sección.
 * Sin filtro o sin rol, la opción no aparece.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { useLothSeccionTabla } from "@/components/admin/forestal/hooks/use-loth-seccion-tabla";
import { conColumnaPermiso, mapaDePermisos, mezclaPlanes, opcionBorrarFiltradas } from "@/components/admin/forestal/loth-seccion-permiso";
import type { PlanTablero } from "@/lib/forestal/loth-tablero-permiso";

const plan = (id: string, planNumber: string, titularName: string) =>
  ({ id, planType: "PO", planNumber, alias: null, titularName } as unknown as PlanTablero);
const PLANES = mapaDePermisos([plan("P1", "001-2026", "CCNN San Luis"), plan("P2", "002-2026", "Juan Pérez")]);
const COLS = conColumnaPermiso([{ key: "tree", label: "Cód. árbol", render: () => null }], PLANES);
const SIN_CORRECCIONES = new Map<number, number>();

const linea = (i: number, planId: string | null) =>
  ({ id: `L${i}`, lineNo: i, section: "tala", planId, status: "registrado", entryDate: "2026-09-10T00:00:00.000Z", createdAt: "2026-09-10T00:00:00.000Z", treeCode: `A${i}` } as unknown as LothEntryDTO);
/* 120 líneas: más de dos páginas de 50. Las múltiplos de 3 son de P2; las de 5, sin plan. */
const LINEAS = Array.from({ length: 120 }, (_, i) => linea(i + 1, (i + 1) % 5 === 0 ? null : (i + 1) % 3 === 0 ? "P2" : "P1"));

function montar() {
  return renderHook(() =>
    useLothSeccionTabla({ section: "tala", cols: COLS, lineas: LINEAS, corregidaPor: SIN_CORRECCIONES, orden: "lineNo", dir: "asc", planes: PLANES }),
  );
}

describe("Secciones · borrar las filtradas por permiso o titular", () => {
  it("la columna nace sólo si la sección mezcla planes, y trae los filtros Permiso y Titular", () => {
    expect(mezclaPlanes(LINEAS)).toBe(true);
    expect(mezclaPlanes(LINEAS.filter((e) => e.planId === "P1"))).toBe(false);
    expect(COLS.map((c) => c.key)).toEqual(["tree", "permiso"]);
    const { result } = montar();
    expect(result.current.f.columnas.map((c) => c.id)).toEqual(expect.arrayContaining(["permiso", "titular"]));
  });

  it("filtrado por titular: pasa todos los ids filtrados (de todas las páginas) y sólo ésos", () => {
    const { result } = montar();
    act(() => result.current.f.setFaceta("titular", ["Juan Pérez"]));
    const esperados = LINEAS.filter((e) => e.planId === "P2").map((e) => e.id);
    expect(result.current.enPagina.length).toBeLessThanOrEqual(50);
    const onBorrar = vi.fn();
    const op = opcionBorrarFiltradas({ filtradas: result.current.ordenadas, hayFiltro: result.current.f.activos > 0, puede: true, onBorrar });
    expect(op?.label).toBe(`Borrar las ${esperados.length} filtradas`);
    op?.onSelect();
    expect(onBorrar).toHaveBeenCalledWith(esperados);
  });

  it("filtrado por permiso «Sin plan»: sólo las líneas sin plan", () => {
    const { result } = montar();
    act(() => result.current.f.setFaceta("permiso", ["Sin plan"]));
    const onBorrar = vi.fn();
    opcionBorrarFiltradas({ filtradas: result.current.ordenadas, hayFiltro: true, puede: true, onBorrar })?.onSelect();
    expect(onBorrar).toHaveBeenCalledWith(LINEAS.filter((e) => e.planId === null).map((e) => e.id));
  });

  it("sin filtro o sin rol de admin/dueño, no hay opción", () => {
    const base = { filtradas: LINEAS, onBorrar: vi.fn() };
    expect(opcionBorrarFiltradas({ ...base, hayFiltro: false, puede: true })).toBeNull();
    expect(opcionBorrarFiltradas({ ...base, hayFiltro: true, puede: false })).toBeNull();
  });
});
