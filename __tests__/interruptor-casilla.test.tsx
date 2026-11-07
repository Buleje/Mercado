/**
 * Los primitivos del contrato de diseño del panel (ADR-489): Interruptor,
 * Casilla y Plegable. Lo que se prueba es lo que un lector de pantalla y un
 * dedo necesitan, no las clases.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Interruptor } from "@/components/ui-system/Interruptor";
import { Casilla, CLASE_CASILLA } from "@/components/ui-system/Casilla";
import { Toggle, Plegable as PlegableDeAjustes } from "@/components/admin/settings/campos";
import Plegable from "@/components/admin/shared/Plegable";

describe("Interruptor", () => {
  it("es un switch con aria-checked y la etiqueta entera lo prende", () => {
    const onChange = vi.fn();
    render(<Interruptor enabled={false} onChange={onChange} label="Yape" desc="Pago con QR de Yape" />);
    const sw = screen.getByRole("switch", { name: "Yape" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(sw).toHaveAccessibleDescription("Pago con QR de Yape");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByText("Yape"));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("encendido dice true; deshabilitado no cambia", () => {
    const onChange = vi.fn();
    render(<Interruptor enabled onChange={onChange} label="Mantenimiento" danger disabled />);
    const sw = screen.getByRole("switch", { name: "Mantenimiento" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    fireEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("variante solo: sólo el interruptor, con su nombre", () => {
    const { container } = render(<Interruptor enabled={false} onChange={() => {}} label="Ver anuladas" variante="solo" />);
    expect(screen.getByRole("switch", { name: "Ver anuladas" })).toBeInTheDocument();
    expect(container.querySelector("label")).toBeNull();
  });

  it("el Toggle de Ajustes ES el Interruptor (sus 3 importadores no cambian)", () => {
    expect(Toggle).toBe(Interruptor);
  });
});

describe("Casilla", () => {
  it("es un checkbox de 16 px con el acento por token", () => {
    const onChange = vi.fn();
    render(<Casilla aria-label="Elegir guía" checked={false} onChange={onChange} />);
    const c = screen.getByRole("checkbox", { name: "Elegir guía" });
    expect(c).toHaveAttribute("type", "checkbox");
    expect(CLASE_CASILLA).toMatch(/\bh-4\b/);
    expect(CLASE_CASILLA).toContain("accent-[var(--accent)]");
    fireEvent.click(c);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("indeterminada pone la propiedad del DOM; con etiqueta, el texto también marca", () => {
    const onChange = vi.fn();
    render(<Casilla etiqueta="Todas" indeterminada checked={false} onChange={onChange} />);
    const c = screen.getByRole("checkbox", { name: "Todas" }) as HTMLInputElement;
    expect(c.indeterminate).toBe(true);
    fireEvent.click(screen.getByText("Todas"));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  /* El navegador apaga `indeterminate` con cada clic. Antes sólo lo ponía el
     callback ref: si la prop seguía en «algunas», la raya no volvía (revisión 09-10). */
  it("después del clic la raya vuelve mientras la prop siga en «algunas», aunque nadie re-dibuje", () => {
    const onChange = vi.fn();
    render(<Casilla aria-label="Todas" indeterminada checked={false} onChange={onChange} />);
    const c = screen.getByRole("checkbox", { name: "Todas" }) as HTMLInputElement;
    fireEvent.click(c);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(c.indeterminate).toBe(true);
  });

  it("re-dibujada con la misma prop la raya sigue; cuando la prop pasa a false, se va", () => {
    function Cabecera() {
      const [clics, setClics] = useState(0);
      return (
        <Casilla aria-label="Todas" indeterminada={clics < 2} checked={false} onChange={() => setClics((n) => n + 1)} />
      );
    }
    render(<Cabecera />);
    const c = screen.getByRole("checkbox", { name: "Todas" }) as HTMLInputElement;
    fireEvent.click(c);
    expect(c.indeterminate).toBe(true);
    fireEvent.click(c);
    expect(c.indeterminate).toBe(false);
  });
});

describe("Plegable", () => {
  beforeEach(() => localStorage.clear());

  it("plegado muestra la cifra y no monta lo de adentro; se recuerda abierto", () => {
    const { unmount } = render(
      <Plegable clave="prueba:kpis" titulo="Indicadores" resumen="3 líneas · 12,40 m³">
        <p>contenido pesado</p>
      </Plegable>,
    );
    const boton = screen.getByRole("button", { name: /Indicadores/ });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("3 líneas · 12,40 m³")).toBeInTheDocument();
    expect(screen.queryByText("contenido pesado")).toBeNull();
    fireEvent.click(boton);
    expect(boton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("contenido pesado")).toBeVisible();
    expect(localStorage.getItem("prueba:kpis")).toBe("true");
    unmount();
    render(
      <Plegable clave="prueba:kpis" titulo="Indicadores" variante="franja" resumen="3 líneas">
        <p>contenido pesado</p>
      </Plegable>,
    );
    expect(screen.getByRole("button", { name: /Indicadores/ })).toHaveAttribute("aria-expanded", "true");
    // En la franja, abierto ya no repite la cifra: las tarjetas la dicen.
    expect(screen.queryByText("3 líneas")).toBeNull();
  });

  it("el de Ajustes guarda en la clave de siempre", () => {
    render(
      <PlegableDeAjustes clave="accesos-directos" titulo="Accesos directos" resumen="2 de 6">
        <p>lista</p>
      </PlegableDeAjustes>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Accesos directos/ }));
    expect(localStorage.getItem("ajustes-plegable-accesos-directos")).toBe("true");
  });
});
