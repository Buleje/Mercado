/**
 * B4 (revisión 25-10): en el TROZADO se propone a quien taló ESE árbol, no al
 * último motosierrista del libro. Sin tala con motosierrista, nada; lo que la
 * persona escribió no se toca; al cambiar de árbol, la propuesta lo sigue.
 */
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LIBRO = {
  motosierristas: { ultimo: "Otro Señor", usados: ["Juan Pérez", "Otro Señor"], porArbol: { "p1|A12": "Juan Pérez" } },
};

vi.mock("@/components/admin/forestal/hooks/use-loth-semaforo-libro", () => ({ useSemaforoDelLibro: () => LIBRO }));
vi.mock("@/hooks/use-directorio-forestal", () => ({ useDirectorioForestal: () => ({ partes: [] }) }));
vi.mock("@/components/superadmin/_shared/InfoTip", () => ({ InfoTip: () => null }));

import LothTalaDatosInternos from "@/components/admin/forestal/LothTalaDatosInternos";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ colaboradores: [] }), { status: 200 })));
});

function armar(treeCode: string, motosierrista = "") {
  const on = vi.fn();
  const props = { seccion: "trozado" as const, proponerUltimo: true, motosierrista, onMotosierrista: on, arbol: { planId: "p1", treeCode } };
  const vista = render(<LothTalaDatosInternos {...props} />);
  return { on, vista, props };
}

describe("motosierrista propuesto en el trozado (B4)", () => {
  it("propone al que taló ese árbol", async () => {
    const { on } = armar("a12");
    await waitFor(() => expect(on).toHaveBeenCalledWith("Juan Pérez", null));
    expect(on).not.toHaveBeenCalledWith("Otro Señor", expect.anything());
  });

  it("árbol sin tala con motosierrista: no propone a nadie (tampoco al último)", async () => {
    const { on } = armar("Z99");
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(on).not.toHaveBeenCalled();
  });

  it("lo escrito a mano no se toca", async () => {
    const { on } = armar("A12", "Pedro Ruiz");
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(on).not.toHaveBeenCalled();
  });

  it("al pasar a un árbol sin tala, vacía lo que había propuesto", async () => {
    const { on, vista, props } = armar("A12");
    await waitFor(() => expect(on).toHaveBeenCalledWith("Juan Pérez", null));
    vista.rerender(<LothTalaDatosInternos {...props} motosierrista="Juan Pérez" arbol={{ planId: "p1", treeCode: "Z99" }} />);
    await waitFor(() => expect(on).toHaveBeenLastCalledWith("", null));
  });

  it("en la tala sigue proponiendo al último del libro", async () => {
    const on = vi.fn();
    render(<LothTalaDatosInternos seccion="tala" proponerUltimo motosierrista="" onMotosierrista={on} />);
    await waitFor(() => expect(on).toHaveBeenCalledWith("Otro Señor", null));
  });
});
