/**
 * Tests — la Especie del lote con el teclado (Brandon 24-10: «hoy la flecha →
 * desde Cant. salta Especie»).
 *
 *   - lo puro: elegir por el comienzo, sin tildes, la misma letra repetida
 *     recorre las que empiezan con ella;
 *   - la celda montada en una grilla de dos filas: → llega a la Especie desde
 *     Cant. y sigue a Espesor, ↑/↓ cambian de fila SIN cambiar la opción,
 *     «t» + Enter deja Tornillo y baja, Escape vuelve a la que tenía.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import CeldaEspecie from "@/components/admin/forestal/celda-especie";
import { CeldaNum, useTecladoGrilla } from "@/components/admin/forestal/celdas-excel";
import { especiePorComienzo } from "@/lib/forestal/especie-por-comienzo";
import { ESPECIES_MADERA } from "@/lib/forestal/cubicacion";

const OPCIONES = ESPECIES_MADERA;

describe("especiePorComienzo", () => {
  it("elige por el comienzo, como un combo", () => {
    expect(especiePorComienzo(OPCIONES, "t")).toBe("Tornillo");
    expect(especiePorComienzo(OPCIONES, "cu")).toBe("Cumala");
    expect(especiePorComienzo(OPCIONES, "C")).toBe("Cedro");
    expect(especiePorComienzo(OPCIONES, "cap")).toBe("Capirona");
  });

  it("sin tildes ni mayúsculas", () => {
    expect(especiePorComienzo(OPCIONES, "marupa")).toBe("Marupá");
    expect(especiePorComienzo(["Shihuahuaco"], "SHI")).toBe("Shihuahuaco");
  });

  it("la misma letra repetida recorre las que empiezan con ella", () => {
    const conC = OPCIONES.filter((o) => o.toLowerCase().startsWith("c"));
    expect(especiePorComienzo(OPCIONES, "cc")).toBe(conC[1]);
    expect(especiePorComienzo(OPCIONES, "ccc")).toBe(conC[2]);
  });

  it("nada o vacío → null", () => {
    expect(especiePorComienzo(OPCIONES, "zz")).toBeNull();
    expect(especiePorComienzo(OPCIONES, "")).toBeNull();
  });
});

type Fila = { cant: string; especie: string; espesor: string };

function Grilla({ inicial, onEspecie }: { inicial: Fila[]; onEspecie: (fila: number, v: string) => void }) {
  const [filas, setFilas] = useState(inicial);
  const teclas = useTecladoGrilla({ grilla: "prueba", totalFilas: filas.length, columnas: [0, 4, 1], envolver: true });
  const poner = (i: number, campo: keyof Fila, v: string) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, [campo]: v } : f)));
  return (
    <table data-grilla="prueba">
      <tbody>
        {filas.map((f, i) => (
          <tr key={i}>
            <td><CeldaNum valor={f.cant} onValor={(v) => poner(i, "cant", v)} fila={i} col={0} onKeyDown={teclas} etiqueta={`Cant ${i}`} /></td>
            <td>
              <CeldaEspecie
                valor={f.especie}
                opciones={OPCIONES}
                onCommit={(v) => { onEspecie(i, v); poner(i, "especie", v); }}
                fila={i}
                col={4}
                onTeclaGrilla={teclas}
                etiqueta={`Especie ${i}`}
              />
            </td>
            <td><CeldaNum valor={f.espesor} onValor={(v) => poner(i, "espesor", v)} fila={i} col={1} onKeyDown={teclas} etiqueta={`Espesor ${i}`} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const montar = () => {
  const onEspecie = vi.fn();
  render(
    <Grilla
      inicial={[{ cant: "40", especie: "Cumala", espesor: "2" }, { cant: "20", especie: "Cumala", espesor: "2" }]}
      onEspecie={onEspecie}
    />,
  );
  const especie = (i: number) => screen.getByLabelText(`Especie ${i}`) as HTMLSelectElement;
  return { onEspecie, especie };
};

describe("CeldaEspecie en la grilla", () => {
  it("→ desde Cant. llega a la Especie y → sigue a Espesor", () => {
    const { especie } = montar();
    const cant = screen.getByLabelText("Cant 0");
    cant.focus();
    (cant as HTMLInputElement).select();
    fireEvent.keyDown(cant, { key: "ArrowRight" });
    expect(document.activeElement).toBe(especie(0));
    fireEvent.keyDown(especie(0), { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByLabelText("Espesor 0"));
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(especie(0));
  });

  it("↑/↓ cambian de fila y no tocan la opción", () => {
    const { especie, onEspecie } = montar();
    especie(0).focus();
    const abajo = fireEvent.keyDown(especie(0), { key: "ArrowDown" });
    expect(abajo).toBe(false); // preventDefault: el <select> no cambia de opción
    expect(document.activeElement).toBe(especie(1));
    fireEvent.keyDown(especie(1), { key: "ArrowUp" });
    expect(document.activeElement).toBe(especie(0));
    expect(especie(0).value).toBe("Cumala");
    expect(onEspecie).not.toHaveBeenCalled();
  });

  it("«t» + Enter deja Tornillo y baja a la fila siguiente", () => {
    const { especie, onEspecie } = montar();
    especie(0).focus();
    fireEvent.keyDown(especie(0), { key: "t" });
    expect(especie(0).value).toBe("Tornillo");
    expect(onEspecie).not.toHaveBeenCalled(); // todavía es borrador
    fireEvent.keyDown(especie(0), { key: "Enter" });
    expect(onEspecie).toHaveBeenCalledTimes(1);
    expect(onEspecie).toHaveBeenCalledWith(0, "Tornillo");
    expect(document.activeElement).toBe(especie(1));
    expect(especie(1).value).toBe("Cumala");
  });

  it("«c» «e» de corrido = Cedro", () => {
    const { especie, onEspecie } = montar();
    especie(1).focus();
    fireEvent.keyDown(especie(1), { key: "c" });
    fireEvent.keyDown(especie(1), { key: "e" });
    expect(especie(1).value).toBe("Cedro");
    fireEvent.blur(especie(1));
    expect(onEspecie).toHaveBeenCalledWith(1, "Cedro");
  });

  it("Escape vuelve a la que tenía y no escribe nada", () => {
    const { especie, onEspecie } = montar();
    especie(0).focus();
    fireEvent.keyDown(especie(0), { key: "t" });
    expect(especie(0).value).toBe("Tornillo");
    fireEvent.keyDown(especie(0), { key: "Escape" });
    expect(especie(0).value).toBe("Cumala");
    expect(document.activeElement).toBe(especie(0));
    fireEvent.blur(especie(0));
    expect(onEspecie).not.toHaveBeenCalled();
  });

  it("salir con la flecha también confirma (como Excel)", () => {
    const { especie, onEspecie } = montar();
    especie(0).focus();
    fireEvent.keyDown(especie(0), { key: "t" });
    fireEvent.keyDown(especie(0), { key: "ArrowRight" });
    fireEvent.blur(especie(0));
    expect(onEspecie).toHaveBeenCalledTimes(1);
    expect(onEspecie).toHaveBeenCalledWith(0, "Tornillo");
  });

  it("con el mouse (change) se escribe de una", () => {
    const { especie, onEspecie } = montar();
    fireEvent.change(especie(1), { target: { value: "Moena" } });
    expect(onEspecie).toHaveBeenCalledWith(1, "Moena");
  });
});
