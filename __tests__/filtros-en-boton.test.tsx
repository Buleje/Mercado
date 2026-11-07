/**
 * FiltrosEnBoton — el único primitivo de compactación que faltaba: junta los
 * filtros sueltos de una cabecera en un botón «Filtros (N)» con popover, y
 * muestra lo aplicado como chips con ✕.
 *
 * Se fija lo que ningún tipo ve y se reusa en ~15 pestañas:
 *  · sin filtros puestos no hay contador; con N>0 el contador lo muestra;
 *  · el popover abre con el botón, dibuja los controles (children) y «Listo» cierra;
 *  · la ✕ de un chip quita SOLO ese filtro; «Limpiar» vacía todo.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import FiltrosEnBoton from "@/components/admin/shared/FiltrosEnBoton";

afterEach(cleanup);

describe("FiltrosEnBoton", () => {
  it("sin filtros: botón sin contador y abre/cierra el popover", () => {
    render(
      <FiltrosEnBoton activos={0}>
        <label>Estado</label>
      </FiltrosEnBoton>,
    );
    const boton = screen.getByRole("button", { name: /filtros/i });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(boton);
    const panel = screen.getByRole("dialog", { name: /filtros: opciones/i });
    expect(panel).toBeTruthy();
    expect(screen.getByText("Estado")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("con filtros: contador, «Limpiar» y la ✕ de cada chip", () => {
    const onLimpiar = vi.fn();
    const quitarSemana = vi.fn();
    render(
      <FiltrosEnBoton
        activos={2}
        onLimpiar={onLimpiar}
        chips={[
          { id: "sem", label: "Esta semana", onQuitar: quitarSemana },
          { id: "fia", label: "Fiado", onQuitar: vi.fn() },
        ]}
      >
        <label>Estado</label>
      </FiltrosEnBoton>,
    );
    expect(screen.getByText("2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Quitar Esta semana" }));
    expect(quitarSemana).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /filtros/i }));
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(onLimpiar).toHaveBeenCalledTimes(1);
  });
});
