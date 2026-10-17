/**
 * InfoTip (ⓘ) — el popover que reemplaza a los párrafos de ayuda (Brandon
 * 2026-09-24, «mucho texto por todos lados»). Lo que se rompió al pasarlo a
 * portal y quedó fijado acá:
 *
 *  · va en un portal del `body`, en la capa `z-system` (hay modales del libro
 *    en 9000 y con `z-modal-3` abría detrás del velo);
 *  · `pointer-events-auto`: con un modal de Radix abierto el `body` tiene
 *    `pointer-events:none` y el popover lo heredaba — el clic lo atravesaba;
 *  · un clic DENTRO del popover no lo cierra (el portal está fuera del
 *    contenedor del ícono); un clic afuera y Escape sí.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("InfoTip", () => {
  it("abre con clic en un portal del body, sobre los modales y con clics propios", () => {
    const { container } = render(
      <InfoTip title="Por permiso" what="Cuántas trozas quedan de cada permiso." example="46 trozas · 135.587 m³" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Información: Por permiso" }));
    const pop = screen.getByRole("tooltip");
    expect(container.contains(pop)).toBe(false);
    expect(document.body.contains(pop)).toBe(true);
    expect(pop.className).toContain("z-system");
    expect(pop.className).toContain("pointer-events-auto");
    expect(pop).toHaveTextContent("Cuántas trozas quedan de cada permiso.");
    expect(pop).toHaveTextContent("46 trozas · 135.587 m³");
  });

  it("un clic dentro del popover no lo cierra; afuera y Escape sí", () => {
    render(
      <div>
        <InfoTip title="Consumos" what="Qué queda en el patio." />
        <span data-testid="afuera">afuera</span>
      </div>,
    );
    const boton = screen.getByRole("button", { name: "Información: Consumos" });
    fireEvent.click(boton);
    /* Con el mouse encima del popover, el blur del ícono no lo cierra. */
    fireEvent.mouseEnter(screen.getByRole("tooltip"));
    fireEvent.mouseDown(screen.getByRole("tooltip"));
    fireEvent.blur(boton);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByRole("tooltip")).not.toBeNull();

    fireEvent.mouseDown(screen.getByTestId("afuera"));
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.click(boton);
    expect(screen.queryByRole("tooltip")).not.toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("el contenido estructurado dice qué hace, a dónde afecta y el ejemplo", () => {
    render(<InfoTip title="Lotes" what="Se aparta la madera." affects="La corrida elige el lote." example="LA-2026-051" />);
    fireEvent.click(screen.getByRole("button", { name: "Información: Lotes" }));
    const pop = screen.getByRole("tooltip");
    expect(pop).toHaveTextContent("Qué hace");
    expect(pop).toHaveTextContent("A dónde afecta");
    expect(pop).toHaveTextContent("Ejemplo");
    /* Todo spans: un <p> adentro rompe el anidado cuando el ⓘ vive en un <p>. */
    expect(pop.querySelector("p, div, ul")).toBeNull();
  });
});
