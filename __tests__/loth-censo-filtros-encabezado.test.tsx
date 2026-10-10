/**
 * Censo: los filtros viven en el encabezado de cada columna (ya no hay
 * buscador ni selects sueltos) y filtran sobre TODO el censo, no sobre las 200
 * filas que se pintan. Camino del usuario: filtro de columna → «N de M» →
 * «Seleccionar los N del filtro» → borrar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfirmDialogProvider } from "@/components/admin/shared/ConfirmDialog";
import LothPlanCenso from "@/components/admin/forestal/LothPlanCenso";
import type { Tree } from "@/components/admin/forestal/loth-plan-shared";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const arbol = (id: string, treeCode: string, speciesCommon: string, estado = "en_pie", dapM = "0.6"): Tree => ({
  id, treeCode, speciesCommon, speciesScientific: null, cites: false, dapM, alturaComercialM: "12",
  factorForma: "0.65", volumenEstimadoM3: "2.2", utmZona: null, utmX: null, utmY: null, parcelaCorta: null, estado,
});
const TREES = [
  arbol("a", "1", "Tornillo"),
  arbol("b", "2", "Cedro", "en_pie", "0.4"),
  arbol("c", "3", "Tornillo", "talado"),
];
/** 250 árboles: pasan de las 200 filas que se pintan. */
const MUCHOS = Array.from({ length: 250 }, (_, i) => arbol(`m${i}`, String(i + 1), i === 249 ? "Shihuahuaco" : "Tornillo"));

const fetchMock = vi.fn();

function montar(trees: Tree[]) {
  return render(
    <ConfirmDialogProvider>
      <LothPlanCenso planId="P1" trees={trees} total={trees.length} truncado={false} authorizedSpecies={new Set()} categorias={new Map()} dmcOverrides={{}} onChange={vi.fn()} />
    </ConfirmDialogProvider>,
  );
}
const cabecera = () => within(document.querySelector("thead") as HTMLElement);
const filasDelCuerpo = () => document.querySelectorAll("tbody tr").length;

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, borrados: 1, taladosConservados: 0 }) });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Censo: filtros en el encabezado", () => {
  it("ya no hay buscador ni selects sueltos arriba de la tabla", () => {
    montar(TREES);
    expect(screen.queryByLabelText("Buscar en el censo por código o especie")).toBeNull();
    expect(screen.queryByLabelText("Filtrar por estado del árbol")).toBeNull();
    expect(screen.queryByLabelText("Filtrar por categoría POA")).toBeNull();
  });

  it("el filtro de lista del encabezado «Estado» deja sólo los talados y los puede seleccionar y borrar", async () => {
    montar(TREES);
    expect(filasDelCuerpo()).toBe(3);
    fireEvent.click(cabecera().getByLabelText("Estado: Talado"));
    expect(filasDelCuerpo()).toBe(1);
    expect(screen.getByText(/1 de 1/)).toBeTruthy();
    expect(screen.getByText(/3 en el censo/)).toBeTruthy();
    // La casilla de un árbol y «Seleccionar los N del filtro» usan las filas filtradas.
    fireEvent.click(screen.getByLabelText("Seleccionar el árbol 3"));
    fireEvent.click(screen.getByRole("button", { name: /Borrar 1/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Sí, borrar 1" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ planId: "P1", ids: ["c"] });
  });

  it("el filtro de texto del encabezado «Código» busca por fragmento (Enter)", () => {
    montar(TREES);
    const caja = document.querySelector('thead input[aria-label="Buscar en Código"]') as HTMLInputElement;
    fireEvent.change(caja, { target: { value: "2" } });
    fireEvent.keyDown(caja, { key: "Enter" });
    expect(filasDelCuerpo()).toBe(1);
    expect(screen.getByLabelText("Seleccionar el árbol 2")).toBeTruthy();
  });

  it("filtra sobre todo el censo aunque sólo se pinten 200 filas", () => {
    montar(MUCHOS);
    expect(filasDelCuerpo()).toBe(200);
    // El único Shihuahuaco es el 250: no está entre las 200 pintadas, pero el filtro lo encuentra.
    fireEvent.click(cabecera().getByLabelText("Especie: Shihuahuaco"));
    expect(filasDelCuerpo()).toBe(1);
    expect(screen.getByLabelText("Seleccionar el árbol 250")).toBeTruthy();
  });

  it("«Seleccionar los N del filtro» toma todas las filas filtradas, no sólo las pintadas", () => {
    montar(MUCHOS);
    fireEvent.click(cabecera().getByLabelText("Especie: Tornillo"));
    fireEvent.click(screen.getByLabelText("Seleccionar el árbol 1"));
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar los 249 del filtro" }));
    expect(screen.getByRole("button", { name: /Borrar 249/ })).toBeTruthy();
  });
});
