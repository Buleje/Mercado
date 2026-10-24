/**
 * __tests__/forestal-declarar-por-dueno.test.ts
 *
 * Una libreta de «Producir sin lote» con piezas de dos dueños se declara en dos
 * registros (Brandon, 2026-09-23: «que proponga 2 registros solos»):
 *  - cómo se parte en grupos (ficha del Directorio, nombre a mano, sin dueño);
 *  - qué servicio propone cada grupo (y cuál no);
 *  - al registrar un dueño, de la libreta salen SÓLO sus piezas y sus apartados.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  CLAVE_SIN_DUENO,
  etiquetaDeGrupo,
  filasSinLasDeclaradas,
  gruposPorDueno,
  servicioPropuesto,
} from "@/lib/forestal/declarar-por-dueno";
import {
  claveLibretaProduccion,
  quitarDeLaLibretaProduccion,
} from "@/components/admin/forestal/hooks/libreta-produccion";

let seq = 0;
function pieza(
  dueno: string | undefined,
  cantidad: number,
  extra: Partial<PiezaCubicada> = {},
): PiezaCubicada {
  const base = { id: `p-${seq++}`, cantidad, espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { ...base, especie: "Tornillo", dueno, ...extra, ...cubicarPieza({ ...base, cantidad }) };
}

describe("gruposPorDueno", () => {
  it("un grupo por dueño, en el orden en que aparecen, y «sin dueño» al final", () => {
    const g = gruposPorDueno([
      pieza(undefined, 3),
      pieza("WASACO", 10, { duenoParteId: "parte-wasaco" }),
      pieza("Lucho", 4),
      pieza("WASACO", 5, { duenoParteId: "parte-wasaco" }),
    ]);
    expect(g.map((x) => x.clave)).toEqual(["parte:parte-wasaco", "nombre:lucho", CLAVE_SIN_DUENO]);
    expect(g.map(etiquetaDeGrupo)).toEqual(["WASACO", "Lucho", "Sin dueño"]);
    /* 2×8×10 = 13,33 PT por pieza: 15 piezas = 200 PT. */
    expect(g[0]).toMatchObject({ parteId: "parte-wasaco", cantidad: 15, pt: 200 });
    expect(g[2]).toMatchObject({ parteId: null, nombre: null, cantidad: 3 });
  });

  it("el nombre sin ficha se normaliza: «Wasacó» y «WASACO » son el mismo dueño", () => {
    const g = gruposPorDueno([pieza("Wasacó", 2), pieza("WASACO ", 3)]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ clave: "nombre:wasaco", nombre: "Wasacó", cantidad: 5 });
  });

  it("la pieza cubicada antes de atarle la ficha va con la ficha del mismo nombre", () => {
    const g = gruposPorDueno([pieza("Lucho Pérez", 2), pieza("LUCHO PEREZ", 3, { duenoParteId: "parte-lucho" })]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ clave: "parte:parte-lucho", parteId: "parte-lucho", cantidad: 5 });
  });

  it("dos fichas con el mismo nombre no se adivinan: la pieza sin ficha queda aparte", () => {
    const g = gruposPorDueno([
      pieza("Juan", 1, { duenoParteId: "juan-1" }),
      pieza("Juan", 1, { duenoParteId: "juan-2" }),
      pieza("Juan", 1),
    ]);
    expect(g.map((x) => x.clave)).toEqual(["parte:juan-1", "parte:juan-2", "nombre:juan"]);
  });

  it("lo que no se puede declarar (0 piezas o sin volumen) no arma un grupo", () => {
    const g = gruposPorDueno([pieza("WASACO", 4), pieza("Lucho", 0)]);
    expect(g.map((x) => x.clave)).toEqual(["nombre:wasaco"]);
  });

  it("todo de un solo dueño es un solo grupo (el modal queda como antes)", () => {
    expect(gruposPorDueno([pieza(undefined, 1), pieza(undefined, 2)])).toHaveLength(1);
    expect(gruposPorDueno([])).toEqual([]);
  });
});

describe("servicioPropuesto", () => {
  it("con ficha propone aserrío a su cuenta; sin ficha no propone nada", () => {
    expect(servicioPropuesto({ parteId: "parte-wasaco" })).toEqual({ servicio: "tercero", parteId: "parte-wasaco" });
    expect(servicioPropuesto({ parteId: null })).toBeNull();
    expect(servicioPropuesto(null)).toBeNull();
  });
});

describe("quitar sólo las declaradas", () => {
  it("filasSinLasDeclaradas saca por id y deja el resto como estaba", () => {
    const guardado = [{ id: "a", x: 1 }, { id: "b", dueno: "WASACO" }, { sinId: true }];
    expect(filasSinLasDeclaradas(guardado, ["a"])).toEqual([{ id: "b", dueno: "WASACO" }, { sinId: true }]);
    expect(filasSinLasDeclaradas({ no: "lista" }, ["a"])).toBeNull();
    expect(filasSinLasDeclaradas(null, ["a"])).toBeNull();
  });

  describe("en la libreta de «Producir sin lote»", () => {
    beforeEach(() => {
      localStorage.clear();
      localStorage.setItem("active-tenant-slug", "qa-dueno");
    });
    afterEach(() => localStorage.clear());

    it("quita las filas y los apartados de ESE dueño; los del otro y las preferencias quedan", () => {
      const clave = claveLibretaProduccion();
      const wasaco = [pieza("WASACO", 4, { duenoParteId: "w" }), pieza("WASACO", 2, { duenoParteId: "w" })];
      const propia = [pieza(undefined, 7)];
      localStorage.setItem(clave, JSON.stringify([wasaco[0], propia[0], wasaco[1]]));
      localStorage.setItem(`${clave}-apartados`, JSON.stringify({ [wasaco[0].id]: 1, [propia[0].id]: 2 }));
      localStorage.setItem(`${clave}-cols`, JSON.stringify({ dueno: true }));

      quitarDeLaLibretaProduccion(wasaco.map((p) => p.id));

      const quedan = JSON.parse(localStorage.getItem(clave) ?? "[]") as PiezaCubicada[];
      expect(quedan.map((p) => p.id)).toEqual([propia[0].id]);
      expect(JSON.parse(localStorage.getItem(`${clave}-apartados`) ?? "{}")).toEqual({ [propia[0].id]: 2 });
      expect(localStorage.getItem(`${clave}-cols`)).not.toBeNull();
    });

    it("si no queda ninguna fila, se vacía como siempre (filas y apartados)", () => {
      const clave = claveLibretaProduccion();
      const solo = pieza("WASACO", 3);
      localStorage.setItem(clave, JSON.stringify([solo]));
      localStorage.setItem(`${clave}-apartados`, JSON.stringify({ [solo.id]: 1 }));
      quitarDeLaLibretaProduccion([solo.id]);
      expect(localStorage.getItem(clave)).toBeNull();
      expect(localStorage.getItem(`${clave}-apartados`)).toBeNull();
    });
  });
});
