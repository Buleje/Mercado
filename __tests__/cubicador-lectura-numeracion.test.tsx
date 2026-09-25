/**
 * El control flotante de la lectura en voz con «más nuevas primero»
 * (2026-09-23): la tabla numera de abajo hacia arriba, y el control tiene que
 * decir el MISMO número que la columna N° — y «Ir a la fila 3» ir a la que dice 3.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ControlLecturaFlotante from "@/components/admin/forestal/cubicador-lectura-flotante";
import type { EstadoLectura } from "@/hooks/use-lectura-en-voz";

afterEach(() => cleanup());

const estado = (x: Partial<EstadoLectura>): EstadoLectura =>
  ({
    pausada: false,
    idx: 0,
    total: 10,
    terminada: false,
    haciaAtras: false,
    ...x,
  }) as EstadoLectura;

function control(e: EstadoLectura, numerarDesdeAbajo: boolean) {
  const onIrAFila = vi.fn();
  render(
    <ControlLecturaFlotante
      estado={e}
      onPausar={() => {}}
      onReanudar={() => {}}
      onReiniciar={() => {}}
      onIrAFila={onIrAFila}
      onCerrar={() => {}}
      numerarDesdeAbajo={numerarDesdeAbajo}
    />,
  );
  return { onIrAFila };
}

describe("numeración del control de lectura", () => {
  it("con las nuevas arriba, la primera que suena es la N.º 10 de 10", () => {
    control(estado({ idx: 0 }), true);
    expect(screen.getByText("fila 10 de 10")).toBeInTheDocument();
  });

  it("sin invertir, sigue siendo la posición", () => {
    control(estado({ idx: 0 }), false);
    expect(screen.getByText("fila 1 de 10")).toBeInTheDocument();
  });

  it("«Ir a la fila 3» salta a la que DICE 3: la octava de arriba", () => {
    const { onIrAFila } = control(estado({ idx: 0 }), true);
    fireEvent.change(screen.getByLabelText(/Número de fila desde la que leer/), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Ir$/ }));
    expect(onIrAFila).toHaveBeenCalledWith(8);
  });

  it("leyendo al revés con las nuevas arriba, termina en la más nueva y la barra está llena", () => {
    control(estado({ terminada: true, haciaAtras: true, idx: 0 }), true);
    expect(screen.getByText("fila 10 de 10")).toBeInTheDocument();
    expect(screen.getByText(/de la más vieja a la más nueva/)).toBeInTheDocument();
  });
});
