/**
 * «Indicadores» en la fila de los botones (08-10, Brandon: «nunca en una fila
 * propia») y la franja «Viendo solo <permiso> · Ver todos» del libro.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import LothSeccionKpis from "@/components/admin/forestal/LothSeccionKpis";
import LothSeccionBarra from "@/components/admin/forestal/LothSeccionBarra";
import {
  FranjaDelLibro,
  FranjaLibroContext,
  usePublicarFranjaLibro,
  type FranjaLibro,
} from "@/components/admin/shared/libro-franja-permiso";

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

const kpis = (
  <LothSeccionKpis section="tala" cur={{ count: 3, totalVolumeM3: 4, totalQuantity: 0 }} totalLibro={3} lineas={[]} delLibroEntero />
);

describe("Indicadores junto a los botones de la barra", () => {
  it("con la barra montada, el botón queda en su fila (junto a «Nueva línea»)", () => {
    render(
      <>
        {kpis}
        <LothSeccionBarra opciones={[]} onNuevaLinea={() => {}} />
      </>,
    );
    const boton = screen.getByRole("button", { name: /Indicadores/ });
    const nueva = screen.getByRole("button", { name: /Nueva línea/ });
    /* Mismo renglón: el abuelo de «Nueva línea» (la barra) contiene al botón. */
    expect(nueva.parentElement?.parentElement?.contains(boton)).toBe(true);
    expect(boton.closest("section")).toBeNull();
  });

  it("sin barra, el botón se queda en la fila del título", () => {
    render(kpis);
    const boton = screen.getByRole("button", { name: /Indicadores/ });
    expect(boton.closest("section")).not.toBeNull();
  });
});

function Chip({ texto, onQuitar }: { texto: string | null; onQuitar: () => void }) {
  usePublicarFranjaLibro(texto, onQuitar);
  return null;
}
function Libro({ texto, onQuitar }: { texto: string | null; onQuitar: () => void }) {
  const [franja, setFranja] = useState<FranjaLibro | null>(null);
  return (
    <FranjaLibroContext.Provider value={setFranja}>
      <Chip texto={texto} onQuitar={onQuitar} />
      <FranjaDelLibro franja={franja} />
    </FranjaLibroContext.Provider>
  );
}

describe("Franja «Viendo solo …»", () => {
  it("aparece con un permiso elegido y «Ver todos» lo suelta", () => {
    const quitar = vi.fn();
    render(<Libro texto="el permiso PO 12" onQuitar={quitar} />);
    expect(screen.getByRole("status").textContent).toContain("Viendo solo el permiso PO 12");
    fireEvent.click(screen.getByRole("button", { name: "Ver todos" }));
    expect(quitar).toHaveBeenCalledTimes(1);
  });

  it("con «Todos» no se dibuja", () => {
    render(<Libro texto={null} onQuitar={() => {}} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("al cambiar de permiso, cambia el texto", () => {
    const { rerender } = render(<Libro texto="el permiso A" onQuitar={() => {}} />);
    rerender(<Libro texto="el permiso B" onQuitar={() => {}} />);
    expect(screen.getByRole("status").textContent).toContain("el permiso B");
    rerender(<Libro texto={null} onQuitar={() => {}} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
