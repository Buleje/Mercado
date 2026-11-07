import { describe, expect, it } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  armarUsoGuardado,
  cuadroDeUso,
  dimensionesOfrecidas,
  esUsoParcial,
  filtrarPorUso,
  fraseDelUso,
  leerUsoGuardado,
  ponerUso,
  TODO_EL_LOTE,
  totalesUso,
  usoVigente,
} from "@/lib/forestal/cubicacion-uso";

let n = 0;
const pieza = (
  cantidad: number,
  espesor: number,
  ancho: number,
  largo: number,
  especie: string,
  dueno?: string,
): PiezaCubicada => {
  const base = {
    cantidad,
    espesor,
    ancho,
    largo,
    uEspesor: "pulg" as const,
    uAncho: "pulg" as const,
    uLargo: "pies" as const,
  };
  return { id: `p-${++n}`, ...base, ...cubicarPieza(base), especie, dueno };
};

/* Comercial (2×8×10), paquetería larga (6×6×10), corta (2×6×4), tabla (1×8×10). */
const lote = [
  pieza(10, 2, 8, 10, "Tornillo", "Juan"),
  pieza(5, 6, 6, 10, "Tornillo", "Juan"),
  pieza(20, 2, 6, 4, "Cumala", "Pedro"),
  pieza(8, 1, 8, 10, "Cumala", "Juan"),
];

describe("filtrarPorUso — la fuente única de Resúmenes y Distribución", () => {
  it("sin nada fuera devuelve el MISMO arreglo (los memos no se recalculan)", () => {
    expect(filtrarPorUso(lote, TODO_EL_LOTE)).toBe(lote);
  });

  it("sólo comercial + paquetería: la corta y la tabla quedan fuera, sin borrarse del lote", () => {
    const fuera = ponerUso(TODO_EL_LOTE, "tipo", ["Corta", "Tabla"], false);
    const usadas = filtrarPorUso(lote, fuera);
    expect(usadas.map((r) => r.espesor)).toEqual([2, 6]);
    expect(lote).toHaveLength(4);
  });

  it("las dimensiones se combinan con «y»: tipo marcado pero especie fuera = no entra", () => {
    let fuera = ponerUso(TODO_EL_LOTE, "tipo", ["Tabla"], false);
    fuera = ponerUso(fuera, "especie", ["cumala"], false);
    expect(filtrarPorUso(lote, fuera).map((r) => r.especie)).toEqual(["Tornillo", "Tornillo"]);
  });

  it("los totales salen del PT y el m³ del PT total ÷ 424", () => {
    const t = totalesUso(lote);
    expect(t.piezas).toBe(43);
    expect(t.m3).toBeCloseTo(t.pt / 424, 4);
  });
});

describe("cuadroDeUso — el cuadro con casillas", () => {
  it("por tipo, en el orden del módulo, con lo desmarcado a la vista", () => {
    const fuera = ponerUso(TODO_EL_LOTE, "tipo", ["Corta"], false);
    const filas = cuadroDeUso(lote, "tipo", fuera);
    expect(filas.map((f) => f.clave)).toEqual(["Comercial", "Paquetería larga", "Tabla", "Corta"]);
    expect(filas.find((f) => f.clave === "Corta")?.usada).toBe(false);
    expect(filas.reduce((a, f) => a + f.pct, 0)).toBeCloseTo(100, 6);
  });

  it("especie por PT de mayor a menor; largo de menor a mayor", () => {
    expect(cuadroDeUso(lote, "especie", TODO_EL_LOTE)[0].label).toBe("Tornillo");
    expect(cuadroDeUso(lote, "largo", TODO_EL_LOTE).map((f) => f.label)).toEqual([
      "4 pies",
      "10 pies",
    ]);
  });

  it("ofrece tipo y especie siempre, y las demás sólo con 2+ valores", () => {
    const uno = [lote[0]];
    expect(dimensionesOfrecidas(uno, TODO_EL_LOTE)).toEqual(["tipo", "especie"]);
    expect(dimensionesOfrecidas(lote, TODO_EL_LOTE)).toEqual([
      "tipo",
      "especie",
      "dueno",
      "espesor",
      "largo",
    ]);
  });
});

describe("ponerUso / fraseDelUso", () => {
  it("volver a marcar todo deja el objeto vacío (= todo el lote)", () => {
    const fuera = ponerUso(
      ponerUso(TODO_EL_LOTE, "tipo", ["Corta"], false),
      "tipo",
      ["Corta"],
      true,
    );
    expect(fuera).toEqual({});
    expect(esUsoParcial(fuera)).toBe(false);
  });

  it("dice lo que queda marcado", () => {
    const fuera = ponerUso(TODO_EL_LOTE, "tipo", ["Corta", "Tabla"], false);
    expect(fraseDelUso(lote, fuera)).toBe("Comercial + Paquetería larga");
    expect(fraseDelUso(lote, ponerUso(fuera, "especie", ["cumala"], false))).toBe(
      "Comercial + Paquetería larga · Tornillo",
    );
    expect(
      fraseDelUso(lote, ponerUso(TODO_EL_LOTE, "especie", ["cumala", "tornillo"], false)),
    ).toBe("ninguna especie");
  });
});

describe("usoVigente — la elección es del lote que la tomó", () => {
  const fuera = ponerUso(TODO_EL_LOTE, "tipo", ["Corta"], false);

  it("vale mientras quede alguna pieza del lote (aunque se sumen o borren otras)", () => {
    const g = armarUsoGuardado(fuera, lote);
    expect(usoVigente(g, [...lote.slice(1), pieza(3, 2, 8, 12, "Tornillo")])).toEqual(fuera);
  });

  it("un lote nuevo (vaciado u otra guardada) no sale recortado", () => {
    const g = armarUsoGuardado(fuera, lote);
    expect(usoVigente(g, [pieza(2, 2, 6, 4, "Cumala")])).toBe(TODO_EL_LOTE);
    expect(usoVigente(g, [])).toBe(TODO_EL_LOTE);
  });

  it("sin nada fuera no se guarda nada", () => {
    expect(armarUsoGuardado(TODO_EL_LOTE, lote)).toBeNull();
  });

  it("lee lo guardado sin confiar en la forma", () => {
    expect(leerUsoGuardado(null)).toBeNull();
    expect(leerUsoGuardado("{roto")).toBeNull();
    expect(leerUsoGuardado(JSON.stringify({ fuera: { tipo: [] }, muestra: [] }))).toBeNull();
    expect(
      leerUsoGuardado(
        JSON.stringify({ fuera: { tipo: ["Corta", 3], raro: ["x"] }, muestra: ["p-1", 2] }),
      ),
    ).toEqual({
      fuera: { tipo: ["Corta"] },
      muestra: ["p-1"],
    });
  });
});
