/**
 * «Su ficha del Directorio forestal» en la ficha de la persona (Brandon 25-10).
 * Se prueba el cableado: lee la ficha unida o la parecida, une con el PATCH de
 * siempre (`unirConFicha`) y relee; el encargado sólo mira; sin forestal no se
 * dibuja; y los pt salen sólo con un precio real (nunca uno inventado).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rol: "admin" as string, unir: vi.fn() }));
vi.mock("@/hooks/use-mi-rol", () => ({ useMiRol: () => m.rol }));
vi.mock("@/lib/adelantos/unir-con-ficha", () => ({ unirConFicha: m.unir }));

import UnirConDirectorio from "@/components/admin/adelantos/personas/UnirConDirectorio";

const parte = { id: "p1", nombre: "WASACO", documento: "RUC ••••••••438", activo: true, unidaA: null };
const madera = (precioPt: number | null) => ({ teDebe: 2442, precioPt, codigo: precioPt ? "CUB-0007" : null, fecha: null, pt: precioPt ? 2442 / precioPt : null });

let respuestas: unknown[] = [];
const fetchMock = vi.fn(async () => ({ ok: true, json: async () => respuestas.shift() ?? respuestas[0] }) as unknown as Response);

beforeEach(() => {
  m.rol = "admin";
  m.unir.mockReset();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UnirConDirectorio", () => {
  it("propone la parecida, une con el PATCH de siempre, relee y avisa", async () => {
    respuestas = [
      { forestal: true, unida: null, sugerida: { motivo: "mismo-nombre", parte }, resultados: [], madera: madera(null) },
      { forestal: true, unida: parte, sugerida: null, resultados: [], madera: madera(2.5) },
    ];
    m.unir.mockResolvedValue({ ok: true });
    const onCambio = vi.fn();
    const { container } = render(<UnirConDirectorio beneficiarioId="b1" nombre="Wasaco" forestPartyId={null} onCambio={onCambio} />);

    const sug = await waitFor(() => {
      const el = container.querySelector("[data-sugerida-directorio]");
      if (!el) throw new Error("sin sugerida");
      return el;
    });
    expect(sug.textContent).toMatch(/WASACO.*RUC ••••••••438.*mismo nombre/);
    /* Sin precio real no hay pt. */
    expect(container.querySelector("[data-madera-pt]")?.textContent).not.toMatch(/pt/);

    fireEvent.click(screen.getByRole("button", { name: "Sí, unir" }));
    await waitFor(() => expect(onCambio).toHaveBeenCalledTimes(1));
    expect(m.unir).toHaveBeenCalledWith("b1", "p1");
    await waitFor(() => expect(screen.getByText("Unida a")).toBeTruthy());
    expect(container.querySelector("[data-madera-pt]")?.textContent).toMatch(/≈ 977 pt a S\/\s?2\.50 el pt.*CUB-0007/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("el encargado ve a quién está unida pero no la suelta ni busca", async () => {
    m.rol = "manager";
    respuestas = [{ forestal: true, unida: null, sugerida: { motivo: "mismo-documento", parte }, resultados: [], madera: null }];
    const { container } = render(<UnirConDirectorio beneficiarioId="b1" nombre="Wasaco" forestPartyId={null} />);
    await waitFor(() => expect(container.querySelector("[data-sugerida-directorio]")).not.toBeNull());
    expect(screen.queryByRole("button", { name: "Sí, unir" })).toBeNull();
    expect(container.querySelector("[data-buscar-directorio]")).toBeNull();
    expect(screen.getByText(/La une el administrador o el dueño/)).toBeTruthy();
  });

  it("soltar pide confirmación y manda null", async () => {
    respuestas = [{ forestal: true, unida: parte, sugerida: null, resultados: [], madera: null }];
    m.unir.mockResolvedValue({ ok: true });
    const { container } = render(<UnirConDirectorio beneficiarioId="b1" nombre="Wasaco" forestPartyId="p1" />);
    await waitFor(() => expect(container.querySelector("[data-soltar-directorio]")).not.toBeNull());
    fireEvent.click(container.querySelector("[data-soltar-directorio]") as HTMLElement);
    expect(m.unir).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sí, soltar" }));
    await waitFor(() => expect(m.unir).toHaveBeenCalledWith("b1", null));
  });

  it("un negocio sin forestal no dibuja nada", async () => {
    respuestas = [{ forestal: false, unida: null, sugerida: null, resultados: [], madera: null }];
    const { container } = render(<UnirConDirectorio beneficiarioId="b1" nombre="Wasaco" forestPartyId={null} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container.querySelector("[data-unir-directorio]")).toBeNull());
  });
});
