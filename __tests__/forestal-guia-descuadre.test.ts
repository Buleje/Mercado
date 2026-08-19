import { describe, expect, it } from "vitest";
import {
  descuadreDeEspecie,
  explicarDescuadre,
  filaQueExplica,
  propuestasDeCuadre,
  type FilaDeLista,
} from "@/lib/forestal/guia-descuadre";

/** La GTF 019-0000016 real, tal como la publica SERFOR (verificada 2026-08-06). */
const MASHONASTE: FilaDeLista[] = [
  { id: "t1", codificacion: "117/B", cantidad: 1, volumenM3: 2.118 },
  { id: "t2", codificacion: "20/A", cantidad: 3, volumenM3: 6.129 },
];

describe("descuadreDeEspecie", () => {
  it("una guía que cuadra no reporta nada", () => {
    expect(
      descuadreDeEspecie({
        especie: "Quinilla",
        declaradoM3: 3.684,
        filas: [
          { codificacion: "25/A", cantidad: 1, volumenM3: 1.7 },
          { codificacion: "25/C", cantidad: 1, volumenM3: 1.984 },
        ],
      }),
    ).toBeNull();
  });

  it("el caso real: la cabecera dice 4.161 y la lista suma 8.247", () => {
    const d = descuadreDeEspecie({
      especie: "Mashonaste",
      declaradoM3: 4.161,
      piezasDeclaradas: 2,
      filas: MASHONASTE,
    })!;
    expect(d.declaradoM3).toBe(4.161);
    expect(d.listaM3).toBe(8.247);
    expect(d.brechaM3).toBe(4.086);
    expect(d.piezasEnLista).toBe(4);
    // La fila de cantidad 3 explica la brecha COMPLETA.
    expect(d.sospechosa?.codificacion).toBe("20/A");
    expect(d.sospechosa?.unitarioM3).toBe(2.043);
  });

  it("el otro caso real (019-0000013 · Copaiba) tiene la misma firma", () => {
    const d = descuadreDeEspecie({
      especie: "Copaiba",
      declaradoM3: 8.482,
      piezasDeclaradas: 2,
      filas: [
        { codificacion: "111/B", cantidad: 3, volumenM3: 10.548 },
        { codificacion: "112/A", cantidad: 1, volumenM3: 4.966 },
      ],
    })!;
    expect(d.brechaM3).toBe(7.032);
    expect(d.sospechosa?.codificacion).toBe("111/B");
    expect(d.sospechosa?.unitarioM3).toBe(3.516);
  });

  it("un milímetro cúbico de redondeo NO es un descuadre", () => {
    expect(
      descuadreDeEspecie({
        especie: "Copaiba",
        declaradoM3: 2.72,
        filas: [{ codificacion: "99/B", cantidad: 1, volumenM3: 2.7205 }],
      }),
    ).toBeNull();
  });

  it("sin lista de piezas no hay nada que cruzar", () => {
    expect(descuadreDeEspecie({ especie: "Catahua", declaradoM3: 7.249, filas: [] })).toBeNull();
  });

  it("la lista también puede traer de MENOS", () => {
    const d = descuadreDeEspecie({
      especie: "Congona",
      declaradoM3: 5,
      filas: [{ codificacion: "67/B", cantidad: 1, volumenM3: 1.653 }],
    })!;
    expect(d.brechaM3).toBeLessThan(0);
    expect(d.sospechosa).toBeNull();
  });
});

describe("filaQueExplica", () => {
  it("dos explicaciones posibles = ninguna: no se adivina", () => {
    const filas: FilaDeLista[] = [
      { codificacion: "A", cantidad: 2, volumenM3: 4 },
      { codificacion: "B", cantidad: 2, volumenM3: 4 },
    ];
    expect(filaQueExplica(filas, 2)).toBeNull();
  });

  it("una fila de cantidad 1 nunca es la culpable", () => {
    expect(filaQueExplica([{ codificacion: "A", cantidad: 1, volumenM3: 2 }], 2)).toBeNull();
  });

  it("si ninguna fila explica la brecha exacta, no hay sospechosa", () => {
    expect(filaQueExplica([{ codificacion: "A", cantidad: 3, volumenM3: 6 }], 1.5)).toBeNull();
  });
});

describe("propuestasDeCuadre", () => {
  const d = descuadreDeEspecie({
    especie: "Mashonaste",
    declaradoM3: 4.161,
    piezasDeclaradas: 2,
    filas: MASHONASTE,
  })!;

  it("ofrece los DOS lados del papel, nunca elige uno", () => {
    const p = propuestasDeCuadre(d);
    expect(p.map((x) => x.lado)).toEqual(["cabecera", "lista"]);
  });

  it("el lado «cabecera» deja la pieza en una troza con su volumen unitario", () => {
    const cab = propuestasDeCuadre(d).find((p) => p.lado === "cabecera")!;
    if (cab.lado !== "cabecera") throw new Error("lado");
    expect(cab.troza).toMatchObject({ id: "t2", codificacion: "20/A", cantidad: 1, volumenM3: 2.043 });
  });

  it("el lado «lista» sube el ingreso a lo que suman sus piezas", () => {
    const lst = propuestasDeCuadre(d).find((p) => p.lado === "lista")!;
    if (lst.lado !== "lista") throw new Error("lado");
    expect(lst.volumeM3).toBe(8.247);
    expect(lst.pieces).toBe(4);
  });

  it("si la lista trae de MENOS, subir el ingreso no se ofrece", () => {
    const menos = descuadreDeEspecie({
      especie: "Congona",
      declaradoM3: 5,
      filas: [{ codificacion: "67/B", cantidad: 1, volumenM3: 1.653 }],
    })!;
    expect(propuestasDeCuadre(menos)).toEqual([]);
  });
});

describe("explicarDescuadre", () => {
  it("nombra los dos números y la pieza culpable", () => {
    const d = descuadreDeEspecie({
      especie: "Mashonaste",
      declaradoM3: 4.161,
      filas: MASHONASTE,
    })!;
    const texto = explicarDescuadre(d, "019-0000016");
    expect(texto).toContain("019-0000016");
    expect(texto).toContain("4.1610");
    expect(texto).toContain("8.2470");
    expect(texto).toContain("20/A");
    expect(texto).toContain("cantidad 3");
  });

  it("sin fila sospechosa dice que el documento no cuadra, y nada más", () => {
    const d = descuadreDeEspecie({
      especie: "Congona",
      declaradoM3: 5,
      filas: [{ codificacion: "67/B", cantidad: 1, volumenM3: 1.653 }],
    })!;
    expect(explicarDescuadre(d)).toContain("no cuadra consigo mismo");
  });
});
