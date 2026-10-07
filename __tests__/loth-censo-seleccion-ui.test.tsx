/**
 * El censo en pantalla: seleccionar varios árboles y borrarlos, o «Borrar
 * todos». Recorre lo que hace el usuario (casilla → barra → confirmar) y mira
 * lo que viaja al servidor y lo que se avisa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfirmDialogProvider } from "@/components/admin/shared/ConfirmDialog";
import LothPlanCenso from "@/components/admin/forestal/LothPlanCenso";
import type { Tree } from "@/components/admin/forestal/loth-plan-shared";

const { toastOk } = vi.hoisted(() => ({ toastOk: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: toastOk } }));

const arbol = (id: string, treeCode: string, estado = "en_pie"): Tree => ({
  id, treeCode, speciesCommon: "Tornillo", speciesScientific: null, cites: false, dapM: "0.6", alturaComercialM: "12",
  factorForma: "0.65", volumenEstimadoM3: "2.2", utmZona: null, utmX: null, utmY: null, parcelaCorta: null, estado,
});
const TREES = [arbol("a", "1"), arbol("b", "2"), arbol("c", "3", "talado")];

const fetchMock = vi.fn();
const onChange = vi.fn();

function montar() {
  return render(
    <ConfirmDialogProvider>
      <LothPlanCenso planId="P1" trees={TREES} total={3} truncado={false} authorizedSpecies={new Set()} categorias={new Map()} dmcOverrides={{}} onChange={onChange} />
    </ConfirmDialogProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, borrados: 1, taladosConservados: 1 }) });
  vi.stubGlobal("fetch", fetchMock);
  onChange.mockReset();
  toastOk.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const cuerpo = () => JSON.parse(String(fetchMock.mock.calls[0][1].body));

describe("Censo: borrar varios", () => {
  it("sin selección no hay barra; al seleccionar dos aparece con «Borrar 2» y manda esos ids", async () => {
    montar();
    expect(screen.queryByRole("region", { name: "Árboles seleccionados" })).toBeNull();
    fireEvent.click(screen.getByLabelText("Seleccionar el árbol 1"));
    fireEvent.click(screen.getByLabelText("Seleccionar el árbol 3"));
    fireEvent.click(screen.getByRole("button", { name: /Borrar 2/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Sí, borrar 2" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    expect(cuerpo()).toEqual({ planId: "P1", ids: ["a", "c"] });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(toastOk.mock.calls[0][0]).toMatch(/1 árbol borrado.*1 talados se conservaron/);
    expect(screen.queryByRole("region", { name: "Árboles seleccionados" })).toBeNull();
  });

  it("la casilla de la cabecera selecciona los visibles y vuelve a soltarlos", () => {
    montar();
    const cabecera = screen.getByLabelText("Seleccionar los árboles visibles");
    fireEvent.click(cabecera);
    expect(screen.getByRole("button", { name: /Borrar 3/ })).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Quitar la selección de los árboles visibles"));
    expect(screen.queryByRole("region", { name: "Árboles seleccionados" })).toBeNull();
  });

  it("cancelar el diálogo no borra nada", async () => {
    montar();
    fireEvent.click(screen.getByLabelText("Seleccionar el árbol 2"));
    fireEvent.click(screen.getByRole("button", { name: /Borrar 1/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Cancelar/ }));
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("«Borrar todos» vacía el plan con todos: true", async () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Borrar todos los árboles del censo" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sí, borrar 3" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(cuerpo()).toEqual({ planId: "P1", todos: true });
  });
});
