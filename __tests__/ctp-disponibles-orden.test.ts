import { describe, expect, it } from "vitest";
import {
  compararDisponibles,
  ordenarDisponibles,
  siguienteOrden,
  type FilaOrdenable,
} from "@/lib/forestal/disponibles-orden";

const fila = (p: Partial<FilaOrdenable>): FilaOrdenable => ({
  codigo: "",
  producto: "",
  especie: "",
  piezas: null,
  volumenM3: 0,
  pieTablar: 0,
  saldoCorridaM3: 0,
  diasParado: null,
  valorSoles: null,
  ...p,
});

describe("orden de Productos disponibles", () => {
  it("ordena por edad: lo más viejo primero cuando baja", () => {
    const filas = [
      fila({ codigo: "A", diasParado: 45 }),
      fila({ codigo: "B", diasParado: 331 }),
      fila({ codigo: "C", diasParado: 5 }),
    ];
    expect(
      ordenarDisponibles(filas, { by: "edad", dir: "desc" }).map((f) => f.codigo),
    ).toEqual(["B", "A", "C"]);
    expect(ordenarDisponibles(filas, { by: "edad", dir: "asc" }).map((f) => f.codigo)).toEqual([
      "C",
      "A",
      "B",
    ]);
  });

  it("los nulos van al final en los DOS sentidos, no se mezclan con los ceros", () => {
    /* Las 19 filas del libro real sin piezas declaradas: si contaran como 0,
       «lo que menos queda» empezaría por filas que no dicen nada. */
    const filas = [
      fila({ codigo: "sin", piezas: null }),
      fila({ codigo: "cero", piezas: 0 }),
      fila({ codigo: "diez", piezas: 10 }),
    ];
    expect(ordenarDisponibles(filas, { by: "piezas", dir: "asc" }).map((f) => f.codigo)).toEqual([
      "cero",
      "diez",
      "sin",
    ]);
    expect(ordenarDisponibles(filas, { by: "piezas", dir: "desc" }).map((f) => f.codigo)).toEqual([
      "diez",
      "cero",
      "sin",
    ]);
  });

  it("el texto vacío también queda al final, y compara en es-PE", () => {
    const filas = [
      fila({ codigo: "", especie: "" }),
      fila({ codigo: "b", especie: "Ishpingo" }),
      fila({ codigo: "a", especie: "Añuje" }),
    ];
    expect(ordenarDisponibles(filas, { by: "especie", dir: "asc" }).map((f) => f.codigo)).toEqual([
      "a",
      "b",
      "",
    ]);
  });

  it("no toca el array de entrada", () => {
    const filas = [fila({ codigo: "B" }), fila({ codigo: "A" })];
    const copia = [...filas];
    ordenarDisponibles(filas, { by: "codigo", dir: "asc" });
    expect(filas).toEqual(copia);
  });

  it("dos filas sin dato quedan empatadas", () => {
    expect(
      compararDisponibles(fila({}), fila({}), { by: "valor", dir: "desc" }),
    ).toBe(0);
  });

  it("el click da vuelta la misma columna y arranca la nueva donde se mira primero", () => {
    expect(siguienteOrden({ by: "edad", dir: "asc" }, "edad")).toEqual({
      by: "edad",
      dir: "desc",
    });
    /* Números: de mayor a menor —el más viejo, el más grande, el que más vale—. */
    expect(siguienteOrden({ by: "codigo", dir: "asc" }, "valor")).toEqual({
      by: "valor",
      dir: "desc",
    });
    /* Texto: de la A a la Z. */
    expect(siguienteOrden({ by: "valor", dir: "desc" }, "especie")).toEqual({
      by: "especie",
      dir: "asc",
    });
  });
});
