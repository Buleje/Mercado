import { describe, expect, it } from "vitest";
import {
  devolverEspecies,
  planDeEspecie,
  ponerEspecie,
  textoPisadas,
  tramoDeEspecie,
} from "@/lib/forestal/cubicador-especie-en-lote";
import { cubicarPieza, unificarPorMedida, type PiezaCubicada } from "@/lib/forestal/cubicacion";

const fila = (id: string, especie?: string) => ({ id, especie });

describe("planDeEspecie", () => {
  it("cuenta lo que cambia, lo que se pisa y lo que ya estaba", () => {
    const filas = [fila("a", "Cumala"), fila("b", "Cumala"), fila("c"), fila("d", "Tornillo"), fila("e", "Tornillo"), fila("f", " Tornillo ")];
    const plan = planDeEspecie(filas, "Tornillo");
    expect(plan.filas).toBe(6);
    expect(plan.ids).toEqual(["a", "b", "c"]);
    expect(plan.pisadas).toEqual([{ especie: "Cumala", filas: 2 }]);
    expect(plan.sinEspecie).toBe(1);
  });

  it("las pisadas van de la más repetida a la menos", () => {
    const plan = planDeEspecie([fila("a", "Moena"), fila("b", "Cumala"), fila("c", "Cumala")], "Tornillo");
    expect(plan.pisadas.map((p) => p.especie)).toEqual(["Cumala", "Moena"]);
    expect(textoPisadas(plan.pisadas)).toBe("2 filas tenían Cumala y 1 Moena");
  });

  it("sin nada pisado no hay texto", () => {
    expect(textoPisadas(planDeEspecie([fila("a")], "Cumala").pisadas)).toBeNull();
    expect(textoPisadas([{ especie: "Cumala", filas: 1 }])).toBe("1 fila tenía Cumala");
  });
});

describe("ponerEspecie / devolverEspecies", () => {
  it("cambia sólo las elegidas y deja el mismo objeto en las demás", () => {
    const rows = [fila("a", "Cumala"), fila("b"), fila("c", "Moena")];
    const { filas, antes } = ponerEspecie(rows, new Set(["a", "b"]), "Tornillo");
    expect(filas.map((r) => r.especie)).toEqual(["Tornillo", "Tornillo", "Moena"]);
    expect(filas[2]).toBe(rows[2]);
    expect([...antes]).toEqual([["a", "Cumala"], ["b", undefined]]);
  });

  it("deshacer devuelve a cada fila SU especie, aunque se haya dictado algo después", () => {
    const rows = [fila("a", "Cumala"), fila("b")];
    const { filas, antes } = ponerEspecie(rows, new Set(["a", "b"]), "Tornillo");
    const conNueva = [...filas, fila("z", "Tornillo")];
    const vuelta = devolverEspecies(conNueva, antes);
    expect(vuelta.map((r) => [r.id, r.especie])).toEqual([["a", "Cumala"], ["b", undefined], ["z", "Tornillo"]]);
  });

  it("la que ya tenía esa especie no entra al deshacer", () => {
    const { antes } = ponerEspecie([fila("a", "Tornillo")], new Set(["a"]), "Tornillo");
    expect(antes.size).toBe(0);
  });
});

describe("tramoDeEspecie (por el N° de la tabla)", () => {
  const filas = Array.from({ length: 60 }, (_, i) => ({ id: `p${i + 1}`, numero: i + 1 }));

  it("de la 12 a la 48 son 37 filas, en los dos sentidos", () => {
    const ida = tramoDeEspecie(filas, 12, 48, 60);
    const vuelta = tramoDeEspecie(filas, 48, 12, 60);
    expect(ida.ok && ida.ids.length).toBe(37);
    expect(vuelta).toEqual(ida);
  });

  it("con «más nuevas primero» manda el N°, no la posición", () => {
    const alReves = filas.map((f, i) => ({ id: f.id, numero: 60 - i }));
    const t = tramoDeEspecie(alReves, 1, 3, 60);
    expect(t.ok && t.ids).toEqual(["p58", "p59", "p60"]);
  });

  it("fuera de la tabla o vacío explica el porqué", () => {
    expect(tramoDeEspecie(filas, 1, 90, 60)).toMatchObject({ ok: false });
    expect(tramoDeEspecie(filas, null, 5, 60)).toMatchObject({ ok: false });
    expect(tramoDeEspecie(filas.slice(0, 5), 30, 40, 60)).toMatchObject({ ok: false, error: expect.stringContaining("filtro") });
  });
});

describe("unificarPorMedida y la Fecha (hora)", () => {
  const pieza = (id: string, registradoAt?: string): PiezaCubicada => {
    const base = { cantidad: 2, espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg" as const, uAncho: "pulg" as const, uLargo: "pies" as const, especie: "Cumala" };
    return { id, ...base, ...cubicarPieza(base), ...(registradoAt ? { registradoAt } : {}) };
  };

  it("la fila unida se queda con la medida más antigua", () => {
    const [u] = unificarPorMedida([
      pieza("a", "2026-10-18T15:00:00.000Z"),
      pieza("b", "2026-10-18T12:28:00.000Z"),
      pieza("c"),
    ]);
    expect(u.cantidad).toBe(6);
    expect(u.registradoAt).toBe("2026-10-18T12:28:00.000Z");
  });
});
