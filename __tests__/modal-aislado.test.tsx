/**
 * Un modal que se abre sin redibujar a quien lo contiene (23-09): medido en
 * «Producir sin lote», el `useState` de «modal abierto» redibujaba el
 * cubicador entero (911 ms) en cada apertura y cierre.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRef } from "react";
import { AnfitrionDeModales, crearModalAislado, useModalAislado } from "@/components/admin/forestal/hooks/use-modal-aislado";

describe("crearModalAislado", () => {
  it("abrir y cerrar avisan una vez; repetir no avisa", () => {
    const m = crearModalAislado<"a" | "b">();
    let avisos = 0;
    const soltar = m.suscribir(() => avisos++);
    m.abrir("a");
    m.abrir("a");
    expect([[...m.actual()], avisos]).toEqual([["a"], 1]);
    m.cerrar("b");
    m.cerrar("a");
    m.cerrar("a");
    expect([m.actual().size, avisos]).toEqual([0, 2]);
    soltar();
    m.abrir("a");
    expect(avisos).toBe(2);
  });

  it("dos a la vez: abrir B no cierra A, y cerrar B deja A (un modal fijado, ADR-420)", () => {
    const m = crearModalAislado<"duenos" | "importar">();
    m.abrir("duenos");
    const conUno = m.actual();
    m.abrir("importar");
    expect([...m.actual()].sort()).toEqual(["duenos", "importar"]);
    /* Conjunto nuevo en cada cambio: useSyncExternalStore compara por identidad. */
    expect(m.actual()).not.toBe(conUno);
    m.cerrar("importar");
    expect([...m.actual()]).toEqual(["duenos"]);
  });
});

function Padre() {
  const renders = useRef(0);
  renders.current += 1;
  const modales = useModalAislado<"duenos" | "importar">();
  return (
    <div>
      <span data-testid="renders-padre">{renders.current}</span>
      <button type="button" onClick={() => modales.abrir("duenos")}>Abrir dueños</button>
      <button type="button" onClick={() => modales.abrir("importar")}>Abrir importar</button>
      <AnfitrionDeModales modales={modales}>
        {(abiertos, cerrar) => (
          <>
            {abiertos.has("duenos") && (
              <div role="dialog" aria-label="Dueños">
                <button type="button" onClick={() => cerrar("duenos")}>Cerrar dueños</button>
              </div>
            )}
            {abiertos.has("importar") && <div role="dialog" aria-label="Importar" />}
          </>
        )}
      </AnfitrionDeModales>
    </div>
  );
}

describe("AnfitrionDeModales", () => {
  it("abre y cierra sin volver a dibujar al padre, y dos pueden convivir", () => {
    render(<Padre />);
    const antes = Number(screen.getByTestId("renders-padre").textContent);
    fireEvent.click(screen.getByRole("button", { name: "Abrir dueños" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir importar" }));
    expect(screen.getAllByRole("dialog").map((d) => d.getAttribute("aria-label"))).toEqual(["Dueños", "Importar"]);
    act(() => fireEvent.click(screen.getByRole("button", { name: "Cerrar dueños" })));
    expect(screen.getAllByRole("dialog").map((d) => d.getAttribute("aria-label"))).toEqual(["Importar"]);
    expect(Number(screen.getByTestId("renders-padre").textContent)).toBe(antes);
  });
});
