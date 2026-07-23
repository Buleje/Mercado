/**
 * Las dos piezas que hacen que la planilla se use "como Excel": trabajar con
 * rangos (seleccionar, copiar, pegar) y que las fórmulas den un número al
 * momento de editar.
 */
import { describe, expect, it } from "vitest";
import {
  aTsv, cantidadCeldas, celdasDe, desdeTsv, destinoPegado, dentro, etiquetaRango, normalizar,
} from "@/lib/documentos/hoja-rango";
import { ERROR_DIV0, ERROR_NOMBRE, esFormula, evaluarFormula, refACoordenada } from "@/lib/documentos/hoja-formulas";

describe("rangos", () => {
  it("ordena la selección aunque se arrastre hacia arriba", () => {
    const r = normalizar({ ancla: { fila: 9, columna: 5 }, foco: { fila: 2, columna: 1 } });
    expect(r).toEqual({ filaIni: 2, filaFin: 9, colIni: 1, colFin: 5 });
  });

  it("se etiqueta como en Excel", () => {
    expect(etiquetaRango(normalizar({ ancla: { fila: 1, columna: 1 }, foco: { fila: 1, columna: 1 } }))).toBe("B2");
    expect(etiquetaRango(normalizar({ ancla: { fila: 1, columna: 1 }, foco: { fila: 39, columna: 3 } }))).toBe("B2:D40");
  });

  it("sabe qué celdas abarca", () => {
    const r = normalizar({ ancla: { fila: 0, columna: 0 }, foco: { fila: 1, columna: 2 } });
    expect(cantidadCeldas(r)).toBe(6);
    expect(celdasDe(r)).toHaveLength(6);
    expect(dentro(r, 1, 2)).toBe(true);
    expect(dentro(r, 2, 0)).toBe(false);
  });
});

describe("portapapeles compatible con Excel", () => {
  it("copia como TSV, que es lo que Excel entiende", () => {
    expect(aTsv([["a", "b"], ["c", "d"]])).toBe("a\tb\nc\td");
  });

  it("entrecomilla lo que tiene tabulaciones o saltos", () => {
    expect(aTsv([["con\ttab"]])).toBe('"con\ttab"');
  });

  it("EL CASO QUE IMPORTA: pegar algo copiado de Excel cae en su lugar", () => {
    // Lo que deja Excel en el portapapeles al copiar dos filas por tres columnas.
    const matriz = desdeTsv("Producto\tCosto\tVenta\nArroz\t22\t27.9");
    expect(matriz).toEqual([["Producto", "Costo", "Venta"], ["Arroz", "22", "27.9"]]);
  });

  it("ida y vuelta sin perder celdas vacías", () => {
    const original = [["a", "", "c"], ["", "b", ""]];
    expect(desdeTsv(aTsv(original))).toEqual(original);
  });

  it("pega desde la esquina de la selección", () => {
    const destino = { filaIni: 5, filaFin: 5, colIni: 2, colFin: 2 };
    const puestos = destinoPegado([["x", "y"]], destino);
    expect(puestos).toEqual([
      { fila: 5, columna: 2, valor: "x" },
      { fila: 5, columna: 3, valor: "y" },
    ]);
  });

  it("repite el contenido si el destino es un múltiplo exacto, como Excel", () => {
    const destino = { filaIni: 0, filaFin: 3, colIni: 0, colFin: 0 }; // 4 filas
    const puestos = destinoPegado([["a"], ["b"]], destino);            // 2 filas
    expect(puestos.map((p) => p.valor)).toEqual(["a", "b", "a", "b"]);
  });

  it("pegar nada no rompe", () => {
    expect(destinoPegado([], { filaIni: 0, filaFin: 0, colIni: 0, colFin: 0 })).toEqual([]);
  });
});

describe("fórmulas", () => {
  /** Planilla de prueba: A1=10, A2=20, A3=30, B1="Arroz", C1==SUMA(A1:A3) */
  const celdas: Record<string, string> = {
    "0-0": "10", "1-0": "20", "2-0": "30",
    "0-1": "Arroz",
    "0-2": "=SUMA(A1:A3)",
  };
  const leer = (f: number, c: number) => celdas[`${f}-${c}`] ?? "";
  const ev = (f: string) => evaluarFormula(f, leer);

  it("reconoce lo que es una fórmula", () => {
    expect(esFormula("=A1+1")).toBe(true);
    expect(esFormula("1+1")).toBe(false);
  });

  it("aritmética con la precedencia correcta", () => {
    expect(ev("=2+3*4")).toBe("14");
    expect(ev("=(2+3)*4")).toBe("20");
    expect(ev("=2^3")).toBe("8");
    expect(ev("=-5+2")).toBe("-3");
  });

  it("suma un rango, que es el 90% de lo que se usa", () => {
    expect(ev("=SUMA(A1:A3)")).toBe("60");
    expect(ev("=SUM(A1:A3)")).toBe("60");   // también en inglés
  });

  it("referencias sueltas y mezcladas con números", () => {
    expect(ev("=A1*2")).toBe("20");
    expect(ev("=A1+A2+A3")).toBe("60");
  });

  it("las absolutas ($A$1) valen igual", () => {
    expect(ev("=$A$1+$A2")).toBe("30");
    expect(refACoordenada("$B$4")).toEqual({ fila: 3, columna: 1 });
  });

  it("resuelve una fórmula que apunta a otra fórmula", () => {
    expect(ev("=C1*2")).toBe("120");   // C1 es =SUMA(A1:A3)
  });

  it("promedio, mínimo, máximo y contar", () => {
    expect(ev("=PROMEDIO(A1:A3)")).toBe("20");
    expect(ev("=MIN(A1:A3)")).toBe("10");
    expect(ev("=MAX(A1:A3)")).toBe("30");
    expect(ev("=CONTAR(A1:A3)")).toBe("3");
  });

  it("SI con comparaciones", () => {
    expect(ev("=SI(A1>5;\"caro\";\"barato\")")).toBe("caro");
    expect(ev("=SI(A1>500;\"caro\";\"barato\")")).toBe("barato");
    expect(ev("=IF(A1=10,1,0)")).toBe("1");
  });

  it("SUMAR.SI con criterio", () => {
    expect(ev("=SUMAR.SI(A1:A3;\">15\")")).toBe("50");
    expect(ev("=CONTAR.SI(A1:A3;\">15\")")).toBe("2");
  });

  it("texto: concatenar y mayúsculas", () => {
    expect(ev('=B1&" 5kg"')).toBe("Arroz 5kg");
    expect(ev("=MAYUSC(B1)")).toBe("ARROZ");
    expect(ev("=LARGO(B1)")).toBe("5");
  });

  it("redondeo, que es lo que salva los centavos", () => {
    expect(ev("=REDONDEAR(10/3;2)")).toBe("3.33");
    expect(ev("=ROUND(2.555,2)")).toBe("2.56");
  });

  it("porcentaje posfijo", () => {
    expect(ev("=A1*10%")).toBe("1");
  });

  it("dividir por cero avisa en vez de mostrar Infinity", () => {
    expect(ev("=A1/0")).toBe(ERROR_DIV0);
  });

  it("una función que no existe se dice, no se inventa un número", () => {
    expect(ev("=BUSCARV(A1;A1:B3;2)")).toBe(ERROR_NOMBRE);
  });

  it("una celda vacía cuenta como cero", () => {
    expect(ev("=Z99+5")).toBe("5");
  });

  it("una referencia circular no cuelga el editor", () => {
    const circular: Record<string, string> = { "0-0": "=A1+1" };
    const v = evaluarFormula("=A1", (f, c) => circular[`${f}-${c}`] ?? "");
    expect(typeof v).toBe("string");   // devuelve algo y no se queda colgado
  });

  it("no arrastra colas de decimales binarias", () => {
    expect(ev("=0.1+0.2")).toBe("0.3");
  });
});
