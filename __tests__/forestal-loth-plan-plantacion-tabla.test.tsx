// @vitest-environment jsdom
/**
 * La tabla «Especies y saldo» de una plantación (ADR-459): pinta la cascada de
 * `cascadaDelPlan` sin rehacer cuentas, marca en rojo la especie pasada de lo
 * registrado y corrige en la misma fila mandando sólo los números.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cascadaDelPlan } from "@/lib/forestal/loth-saldo-cascada";
import LothPlantacionTabla from "@/components/admin/forestal/LothPlantacionTabla";
import type { Species } from "@/components/admin/forestal/loth-plan-shared";

const especie = (id: string, speciesCommon: string, vol: string, extra: Partial<Species> = {}): Species => ({
  id, speciesCommon, speciesScientific: null, cites: false, categoria: null, volumenAutorizadoM3: vol,
  arbolesAutorizados: null, valorEstadoNaturalSoles: null, precioVentaSoles: null, ...extra,
});

const species = [
  especie("s1", "Bolaina", "120", { speciesScientific: "Guazuma crinita", arbolesAutorizados: 450, anioInstalacion: 2018, superficieHa: "12.5" }),
  especie("s2", "Capirona", "80", { arbolesAutorizados: 300 }),
];
const cascada = cascadaDelPlan([
  { species: "Bolaina", cites: false, autorizado: 120, talado: 30, trozado: 25, movilizado: 10, consumido: 0 },
  { species: "Capirona", cites: false, autorizado: 80, talado: 85, trozado: 85, movilizado: 0, consumido: 0 },
]);

afterEach(cleanup);

describe("tabla de la cascada por especie", () => {
  it("cada casillero sale de la cascada: en pie, sin trozar, patio, despachado", () => {
    render(<LothPlantacionTabla species={species} cascada={cascada} acciones={{ guardar: vi.fn(), quitar: vi.fn() }} />);
    const bolaina = screen.getByText("Bolaina").closest("tr")!;
    const celdas = within(bolaina).getAllByRole("cell").map((c) => c.textContent);
    // Especie · árboles · año · sup · registrado · talado · en pie · sin trozar · patio · despachado
    expect(celdas.slice(1, 10)).toEqual(["450", "2018", "12.50", "120.000", "30.000", "90.000", "5.000", "15.000", "10.000"]);
  });

  it("la especie talada por encima de lo registrado va en rojo y dice cuánto de más", () => {
    render(<LothPlantacionTabla species={species} cascada={cascada} acciones={{ guardar: vi.fn(), quitar: vi.fn() }} />);
    const capirona = screen.getByText("Capirona").closest("tr")!;
    expect(capirona.className).toContain("data-error");
    expect(within(capirona).getByText("Se pasó de lo registrado")).toBeTruthy();
    expect(within(capirona).getByText(/-5\.000/)).toBeTruthy();
    expect(within(capirona).getByText("de más")).toBeTruthy();
  });

  it("la fila Total suma registrado y árboles, y el patio es la suma de las especies (no se compensan)", () => {
    render(<LothPlantacionTabla species={species} cascada={cascada} acciones={{ guardar: vi.fn(), quitar: vi.fn() }} />);
    const total = screen.getByText("Total").closest("tr")!;
    const celdas = within(total).getAllByRole("cell").map((c) => c.textContent);
    expect(celdas[1]).toBe("750");
    expect(celdas[4]).toBe("200.000");
    expect(celdas[8]).toBe(Number(cascada.total.enPatioM3).toFixed(3));
  });

  it("corregir en la fila manda año, superficie y m³; el nombre común no se edita", async () => {
    const guardar = vi.fn(async () => null);
    render(<LothPlantacionTabla species={species} cascada={cascada} acciones={{ guardar, quitar: vi.fn() }} />);
    fireEvent.click(screen.getByRole("button", { name: "Corregir Capirona" }));
    fireEvent.change(screen.getByLabelText("m³ registrados de Capirona"), { target: { value: "90" } });
    fireEvent.change(screen.getByLabelText("Año de instalación de Capirona"), { target: { value: "2016" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar Capirona" }));
    await waitFor(() => expect(guardar).toHaveBeenCalled());
    const [id, fila] = guardar.mock.calls[0] as unknown as [string, { volumenM3: string; anioInstalacion: string; speciesCommon: string }];
    expect(id).toBe("s2");
    expect(fila).toMatchObject({ volumenM3: "90", anioInstalacion: "2016", speciesCommon: "Capirona" });
  });

  it("no guarda una corrección con volumen en 0", async () => {
    const guardar = vi.fn(async () => null);
    render(<LothPlantacionTabla species={species} cascada={cascada} acciones={{ guardar, quitar: vi.fn() }} />);
    fireEvent.click(screen.getByRole("button", { name: "Corregir Bolaina" }));
    fireEvent.change(screen.getByLabelText("m³ registrados de Bolaina"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar Bolaina" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(guardar).not.toHaveBeenCalled();
  });
});
