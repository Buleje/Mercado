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
    expect(ev("=TABLA.DINAMICA(A1:A3)")).toBe(ERROR_NOMBRE);
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

/**
 * Las funciones que aparecen en una planilla de negocio de verdad: buscar en
 * una tabla, contar con condiciones, trabajar con fechas y armar textos.
 */
describe("catálogo de funciones", () => {
  // Tabla de precios: A=producto, B=precio, C=stock, D=proveedor
  const hoja: Record<string, string> = {
    "0-0": "Arroz",    "0-1": "22",   "0-2": "40",  "0-3": "Selva",
    "1-0": "Aceite",   "1-1": "8.5",  "1-2": "7",   "1-3": "Costa",
    "2-0": "Fideos",   "2-1": "4.2",  "2-2": "120", "2-3": "Selva",
    "3-0": "Azúcar",   "3-1": "15",   "3-2": "0",   "3-3": "Costa",
  };
  const ev = (f: string) => evaluarFormula(f, (fi, c) => hoja[`${fi}-${c}`] ?? "");

  it("BUSCARV encuentra el precio de un producto", () => {
    expect(ev('=BUSCARV("Fideos";A1:D4;2)')).toBe("4.2");
    expect(ev('=VLOOKUP("Aceite",A1:D4,4)')).toBe("Costa");
  });

  it("BUSCARV dice #N/A cuando no está, en vez de traer otra fila", () => {
    expect(ev('=BUSCARV("Quinua";A1:D4;2)')).toBe("#N/A");
  });

  it("COINCIDIR e INDICE ubican una fila", () => {
    expect(ev('=COINCIDIR("Fideos";A1:A4)')).toBe("3");
    expect(ev("=INDICE(B1:B4;3)")).toBe("4.2");
  });

  it("SUMAR.SI.CONJUNTO cruza dos condiciones", () => {
    // Stock de los productos de la Selva.
    expect(ev('=SUMAR.SI.CONJUNTO(C1:C4;D1:D4;"Selva")')).toBe("160");
  });

  it("CONTAR.SI.CONJUNTO cuenta con dos condiciones", () => {
    expect(ev('=CONTAR.SI.CONJUNTO(D1:D4;"Costa";C1:C4;">0")')).toBe("1");
  });

  it("PROMEDIO.SI ignora lo que no cumple", () => {
    expect(ev('=PROMEDIO.SI(D1:D4;"Selva";B1:B4)')).toBe("13.1");
  });

  it("Y / O / NO para armar condiciones", () => {
    expect(ev("=Y(B1>10;C1>10)")).toBe("VERDADERO");
    expect(ev("=O(B1>100;C1>10)")).toBe("VERDADERO");
    expect(ev("=NO(B1>100)")).toBe("VERDADERO");
  });

  it("SI.CONJUNTO elige el primer caso que se cumple", () => {
    expect(ev('=SI.CONJUNTO(C4>0;"hay stock";C4=0;"agotado")')).toBe("agotado");
  });

  it("ESBLANCO y ESNUMERO distinguen el contenido", () => {
    expect(ev("=ESBLANCO(Z9)")).toBe("VERDADERO");
    expect(ev("=ESNUMERO(B1)")).toBe("VERDADERO");
    expect(ev("=ESTEXTO(A1)")).toBe("VERDADERO");
  });

  it("redondeos: normal, hacia arriba y hacia abajo", () => {
    expect(ev("=REDONDEAR(2.555;2)")).toBe("2.56");
    expect(ev("=REDONDEAR.MAS(2.111;2)")).toBe("2.12");
    expect(ev("=REDONDEAR.MENOS(2.999;2)")).toBe("2.99");
    expect(ev("=MULTIPLO.SUPERIOR(23;5)")).toBe("25");
  });

  it("RESIDUO devuelve el signo del divisor, como Excel", () => {
    // En JavaScript -1 % 3 es -1; en Excel es 2.
    expect(ev("=RESIDUO(-1;3)")).toBe("2");
  });

  it("texto: izquierda, derecha, extrae y sustituir", () => {
    expect(ev('=IZQUIERDA("Arroz Costeño";5)')).toBe("Arroz");
    expect(ev('=DERECHA("Arroz Costeño";7)')).toBe("Costeño");
    expect(ev('=EXTRAE("Arroz Costeño";7;3)')).toBe("Cos");
    expect(ev('=SUSTITUIR("S/ 1,250";",";"")')).toBe("S/ 1250");
    expect(ev('=NOMPROPIO("arroz costeño")')).toBe("Arroz Costeño");
  });

  it("UNIRCADENAS arma una lista separada", () => {
    expect(ev('=UNIRCADENAS(", ";VERDADERO;A1:A4)')).toBe("Arroz, Aceite, Fideos, Azúcar");
  });

  it("ENCONTRAR y HALLAR ubican dentro del texto", () => {
    expect(ev('=ENCONTRAR("Cost";"Arroz Costeño")')).toBe("7");
    expect(ev('=HALLAR("cost";"Arroz Costeño")')).toBe("7");
  });

  it("fechas: armar una, sacarle el año y contar días", () => {
    expect(ev("=AÑO(FECHA(2026;7;22))")).toBe("2026");
    expect(ev("=MES(FECHA(2026;7;22))")).toBe("7");
    expect(ev("=DIA(FECHA(2026;7;22))")).toBe("22");
    expect(ev("=DIAS(FECHA(2026;7;22);FECHA(2026;7;1))")).toBe("21");
  });

  it("FECHA.MES corre los meses de un vencimiento", () => {
    expect(ev("=AÑO(FECHA.MES(FECHA(2026;12;15);1))")).toBe("2027");
  });

  it("mediana y desviación", () => {
    expect(ev("=MEDIANA(B1:B4)")).toBe("11.75");
    expect(Number(ev("=DESVEST(B1:B4)"))).toBeGreaterThan(0);
  });

  it("K.ESIMO.MAYOR para el top de una lista", () => {
    expect(ev("=K.ESIMO.MAYOR(B1:B4;1)")).toBe("22");
    expect(ev("=K.ESIMO.MENOR(B1:B4;1)")).toBe("4.2");
  });

  it("PAGO calcula la cuota de un préstamo", () => {
    // S/ 10,000 a 12 meses con 2% mensual: la cuota ronda los 945.
    expect(Math.abs(Number(ev("=PAGO(0.02;12;10000)")))).toBeGreaterThan(900);
    expect(Math.abs(Number(ev("=PAGO(0.02;12;10000)")))).toBeLessThan(1000);
  });

  it("SUBTOTALES respeta el código de operación", () => {
    expect(ev("=SUBTOTALES(9;B1:B4)")).toBe("49.7");   // suma
    expect(ev("=SUBTOTALES(4;B1:B4)")).toBe("22");     // máximo
  });

  it("SI.ERROR atrapa el error de otra función", () => {
    expect(ev('=SI.ERROR(BUSCARV("Quinua";A1:D4;2);"no está")')).toBe("no está");
  });
});

describe("fórmulas entre hojas", () => {
  /** Dos hojas: Precios (B4=SUMA) y Totales (B1 apunta a Precios). */
  const libro: Record<string, string[][]> = {
    "Precios": [["Producto", "Precio"], ["Arroz", "10"], ["Azúcar", "20"], ["", "=SUM(B2:B3)"]],
    "Lista 2026": [["Total", "=Precios!B4"]],
  };
  const leer = (hojaActiva: string) => (f: number, c: number, hoja?: string) => {
    const nombre = hoja ?? hojaActiva;
    const filas = Object.entries(libro).find(([n]) => n.toLowerCase() === nombre.toLowerCase())?.[1];
    if (!filas) return null;
    return filas[f]?.[c] ?? "";
  };

  it("resuelve una referencia con nombre de hoja", () => {
    expect(evaluarFormula("=Precios!B2*2", leer("Lista 2026"), "Lista 2026")).toBe("20");
  });

  it("resuelve un rango de otra hoja", () => {
    expect(evaluarFormula("=SUMA(Precios!B2:B3)", leer("Lista 2026"), "Lista 2026")).toBe("30");
  });

  it("los nombres con espacios van entre comillas simples", () => {
    expect(evaluarFormula("='Lista 2026'!B1*2", leer("Precios"), "Precios")).toBe("60");
  });

  it("la fórmula de la otra hoja se evalúa EN su propia hoja", () => {
    // Totales!B1 = Precios!B4 = SUM(B2:B3) — ese SUM es de Precios, no de Totales.
    expect(evaluarFormula("='Lista 2026'!B1", leer("Precios"), "Precios")).toBe("30");
  });

  it("una hoja que no existe da #¡REF!", () => {
    expect(evaluarFormula("=Fantasma!A1", leer("Precios"), "Precios")).toBe("#¡REF!");
  });

  it("no distingue mayúsculas en el nombre, como Excel", () => {
    expect(evaluarFormula("=PRECIOS!B2", leer("Lista 2026"), "Lista 2026")).toBe("10");
  });
});
