import { describe, expect, it } from "vitest";
import { palabrasDelNombre, parecidoDeNombre, paresPorNombre } from "@/lib/rrhh/parecido-nombre";

describe("nombre parecido entre trabajador y cuenta de Adelantos", () => {
  it("limpia tildes, mayúsculas, números y palabras que no identifican", () => {
    expect(palabrasDelNombre("Quispe Galindo  Víctor")).toEqual(["quispe", "galindo", "victor"]);
    expect(palabrasDelNombre("Señor de CCNN Selva de ORO")).toEqual(["ccnn", "selva", "oro"]);
    expect(palabrasDelNombre("Joven 1 de Sabalillo")).toEqual(["sabalillo"]);
    expect(palabrasDelNombre(null)).toEqual([]);
  });

  it("«Chato» de Adelantos es fuerte con el trabajador «Chato Gallinero» (el caso medido en Blas)", () => {
    expect(parecidoDeNombre({ nombre: "Chato Gallinero" }, "Chato")).toEqual({ fuerza: "fuerte", comun: ["chato"] });
  });

  it("orden distinto y tildes no importan; el apodo también cuenta", () => {
    expect(parecidoDeNombre({ nombre: "Victor Quispe" }, "Quispe Galindo  Victor")?.fuerza).toBe("fuerte");
    expect(parecidoDeNombre({ nombre: "Hernan Ríos", apodo: null }, "Hernán")?.fuerza).toBe("fuerte");
    expect(parecidoDeNombre({ nombre: "Luis Ruiz", apodo: "Wasaco" }, "Wasaco")?.fuerza).toBe("fuerte");
  });

  it("compartir solo una palabra es parcial; sin palabra de 4 letras en común, nada", () => {
    expect(parecidoDeNombre({ nombre: "Mario Buleje" }, "Mario Pérez")).toEqual({ fuerza: "parcial", comun: ["mario"] });
    expect(parecidoDeNombre({ nombre: "Leo Díaz" }, "Leo Ramos")).toBeNull();
    expect(parecidoDeNombre({ nombre: "Fernando" }, "Frank")).toBeNull();
    expect(parecidoDeNombre({ nombre: "Joven 1 de Sabalillo" }, "MAMA DE ALEX")).toBeNull();
  });

  it("en el aviso general solo van los fuertes y sin ambigüedad", () => {
    const trabajadores = [
      { id: "t1", nombre: "Chato Gallinero" },
      { id: "t2", nombre: "Joven 1 de Sabalillo" },
      { id: "t3", nombre: "Joven 2 Sabalillo" },
      { id: "t4", nombre: "Mario Buleje" },
    ];
    const cuentas = [
      { id: "c1", nombre: "Chato" },
      { id: "c2", nombre: "Sabalillo" },
      { id: "c3", nombre: "Mario Pérez" },
      { id: "c4", nombre: "Frank" },
    ];
    expect(paresPorNombre(trabajadores, cuentas, { soloFuertes: true })).toEqual([
      { trabajadorId: "t1", cuentaId: "c1", fuerza: "fuerte", comun: ["chato"] },
    ]);
    const todos = paresPorNombre(trabajadores, cuentas);
    expect(todos.map((p) => `${p.cuentaId}:${p.trabajadorId}:${p.fuerza}`)).toEqual([
      "c1:t1:fuerte",
      "c2:t2:fuerte",
      "c2:t3:fuerte",
      "c3:t4:parcial",
    ]);
  });

  it("un trabajador fuerte con DOS cuentas es ambiguo: no sale en soloFuertes, sí en la lista completa (revisión 04-11)", () => {
    const trabajadores = [{ id: "t1", nombre: "Juan" }];
    const cuentas = [
      { id: "c1", nombre: "Juan Rios" },
      { id: "c2", nombre: "Juan Perez Ruiz" },
    ];
    expect(paresPorNombre(trabajadores, cuentas, { soloFuertes: true })).toEqual([]);
    expect(paresPorNombre(trabajadores, cuentas).map((p) => p.cuentaId).sort()).toEqual(["c1", "c2"]);
  });
});
