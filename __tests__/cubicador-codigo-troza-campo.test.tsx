/**
 * __tests__/cubicador-codigo-troza-campo.test.tsx
 *
 * El combobox «Código» de «Producir sin lote». Lo que se prueba es lo que el
 * operario hace con el teclado: escribir, bajar con la flecha, Enter, Escape.
 *
 * Escape importa aparte: el modal que monta el cubicador escucha el teclado en
 * CAPTURA sobre `document`. Con la lista abierta, Escape tiene que cerrar sólo
 * la lista; recién con la lista cerrada es del modal.
 */
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CampoCodigoDeTroza from "@/components/admin/forestal/cubicador-codigo-troza";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { TrozaParaCodigo } from "@/lib/forestal/codigo-de-troza";

const t = (id: string, codigo: string, especie: string, m3: number): TrozaParaCodigo => ({
  id,
  codigo,
  permiso: null,
  especie,
  m3,
  guia: "019-001-0000013",
  d1Cm: 40,
  d2Cm: 44,
  largoM: 4.5,
});
const patio = [t("a", "25", "Tornillo", 1.2), t("b", "2", "Cumala", 0.9), t("c", "12", "Moena", 0.7)];

function Arnes({ onElegir }: { onElegir: (t: TrozaParaCodigo) => void }) {
  const [valor, setValor] = useState("");
  return <CampoCodigoDeTroza valor={valor} onValor={setValor} onElegir={onElegir} trozas={patio} />;
}

function escribir(texto: string) {
  const input = screen.getByRole("combobox", { name: "Código" }) as HTMLInputElement;
  input.focus();
  fireEvent.change(input, { target: { value: texto } });
  return input;
}

describe("CampoCodigoDeTroza", () => {
  it("al escribir sugiere primero lo que empieza con eso", () => {
    render(<Arnes onElegir={vi.fn()} />);
    const input = escribir("2");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    const opciones = screen.getAllByRole("option");
    expect(opciones.map((o) => o.textContent?.slice(0, 2))).toEqual(["2C", "25", "12"]);
    expect(opciones[0].textContent).toContain("Cumala");
    expect(opciones[0].textContent).toContain(`${fmtM3(0.9)} m³`);
    expect(opciones[0].textContent).toContain("GTF 019-001-0000013");
  });

  it("flecha abajo + Enter elige la troza y cierra la lista", () => {
    const onElegir = vi.fn();
    render(<Arnes onElegir={onElegir} />);
    const input = escribir("2");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onElegir).toHaveBeenCalledWith(patio[1]);
    expect(input.value).toBe("2");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("después de Escape la flecha vuelve a empezar desde la primera opción (no queda una marcada vieja)", () => {
    const onElegir = vi.fn();
    render(<Arnes onElegir={onElegir} />);
    const input = escribir("2");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    // «2» (Cumala) y no «12» (Moena), que era la que quedaba marcada.
    expect(onElegir).toHaveBeenCalledWith(patio[1]);
  });

  it("Escape con la lista abierta la cierra y NO llega al modal", () => {
    const modal = vi.fn();
    const escuchaDelModal = (e: KeyboardEvent) => {
      if (e.key === "Escape") modal();
    };
    document.addEventListener("keydown", escuchaDelModal, true);
    try {
      render(<Arnes onElegir={vi.fn()} />);
      const input = escribir("2");
      fireEvent.keyDown(input, { key: "Escape" });
      expect(modal).not.toHaveBeenCalled();
      expect(input.getAttribute("aria-expanded")).toBe("false");
      /* Con la lista cerrada, Escape vuelve a ser del modal. */
      fireEvent.keyDown(input, { key: "Escape" });
      expect(modal).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener("keydown", escuchaDelModal, true);
    }
  });

  it("un código que no está en el patio queda tal cual y no pone especie", () => {
    const onElegir = vi.fn();
    render(<Arnes onElegir={onElegir} />);
    const input = escribir("99");
    fireEvent.keyDown(input, { key: "Enter" });
    input.blur();
    expect(onElegir).not.toHaveBeenCalled();
    expect(input.value).toBe("99");
  });

  it("escribir un código exacto y salir del campo usa esa troza", () => {
    const onElegir = vi.fn();
    render(<Arnes onElegir={onElegir} />);
    const input = escribir("12");
    input.blur();
    expect(onElegir).toHaveBeenCalledWith(patio[2]);
  });

  it("«-» no abre ninguna lista", () => {
    render(<Arnes onElegir={vi.fn()} />);
    const input = escribir("-");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});
