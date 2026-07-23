/**
 * Las herramientas de edición que hacen que la planilla se use como Excel:
 * formato (negrita, colores, moneda), insertar y eliminar filas y columnas,
 * anchos, y fórmulas escritas a mano.
 *
 * Todo esto se aplica SOBRE EL ARCHIVO ORIGINAL. Lo que se blinda acá es que
 * ninguna de esas operaciones deje el archivo inconsistente: una fila insertada
 * que no corre las fórmulas de abajo produce totales equivocados, y eso es peor
 * que no poder insertar filas.
 */
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { leerXlsxConFormato } from "@/lib/documentos/xlsx-formato";
import { abrirPaquete, guardarCambios } from "@/lib/documentos/xlsx-escritura";
import { moverFormula } from "@/lib/documentos/xlsx-estructura";
import { FORMATOS } from "@/lib/documentos/xlsx-estilos";

async function libro(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Datos");
  ws.getColumn(1).width = 30;
  ws.addRow(["Producto", "Costo", "Cantidad"]);
  ws.addRow(["Arroz", 22, 10]);
  ws.addRow(["Aceite", 8.5, 4]);
  ws.getCell("B4").value = { formula: "SUM(B2:B3)", result: 30.5 } as never;
  ws.mergeCells("A6:C6");
  ws.getCell("A6").value = "Pie de tabla";
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

const primeraHoja = async (blob: Blob) => (await leerXlsxConFormato(await blob.arrayBuffer()))[0];

describe("formato aplicado al archivo", () => {
  it("pone negrita sin perder lo que la celda ya tenía", async () => {
    const zip = await abrirPaquete(await libro());
    const blob = await guardarCambios(zip, {
      estilos: [{ hoja: 0, fila: 2, columna: 1, formato: { negrita: true } }],
    });
    const hoja = await primeraHoja(blob);
    expect(hoja.filas[1][0].estilo?.negrita).toBe(true);
    expect(hoja.filas[1][0].crudo).toBe("Arroz");   // el valor sigue
  });

  it("pinta el relleno y la letra", async () => {
    const zip = await abrirPaquete(await libro());
    const blob = await guardarCambios(zip, {
      estilos: [{ hoja: 0, fila: 1, columna: 1, formato: { fondo: "#00a0a0", color: "#ffffff" } }],
    });
    const hoja = await primeraHoja(blob);
    expect(hoja.filas[0][0].estilo?.fondo).toBe("#00a0a0");
    expect(hoja.filas[0][0].estilo?.color).toBe("#ffffff");
  });

  it("aplica moneda: el número pasa a verse S/", async () => {
    const zip = await abrirPaquete(await libro());
    const blob = await guardarCambios(zip, {
      estilos: [{ hoja: 0, fila: 2, columna: 2, formato: { numFmt: FORMATOS.moneda } }],
    });
    const hoja = await primeraHoja(blob);
    expect(hoja.filas[1][1].texto).toBe("S/ 22.00");
  });

  it("porcentaje y alineación", async () => {
    const zip = await abrirPaquete(await libro());
    const blob = await guardarCambios(zip, {
      estilos: [{ hoja: 0, fila: 2, columna: 3, formato: { numFmt: FORMATOS.porcentaje, alineacion: "center" } }],
    });
    const hoja = await primeraHoja(blob);
    expect(hoja.filas[1][2].texto).toBe("1000.00%");   // 10 → 1000%
    expect(hoja.filas[1][2].estilo?.alineacion).toBe("center");
  });

  it("dos celdas con el mismo formato comparten una sola entrada de estilo", async () => {
    // Si no se deduplica, una planilla grande se infla sin control.
    const zip = await abrirPaquete(await libro());
    const blob = await guardarCambios(zip, {
      estilos: [
        { hoja: 0, fila: 2, columna: 1, formato: { negrita: true } },
        { hoja: 0, fila: 3, columna: 1, formato: { negrita: true } },
      ],
    });
    const salida = await JSZip.loadAsync(await blob.arrayBuffer());
    const styles = await salida.file("xl/styles.xml")!.async("string");
    const negritas = (styles.match(/<b\/>|<b \/>/g) ?? []).length;
    expect(negritas).toBe(1);
  });

  it("acumular formatos no borra el anterior", async () => {
    const zip = await abrirPaquete(await libro());
    const paso1 = await guardarCambios(zip, {
      estilos: [{ hoja: 0, fila: 2, columna: 1, formato: { negrita: true } }],
    });
    const zip2 = await abrirPaquete(await paso1.arrayBuffer());
    const paso2 = await guardarCambios(zip2, {
      estilos: [{ hoja: 0, fila: 2, columna: 1, formato: { fondo: "#ffff00" } }],
    });
    const hoja = await primeraHoja(paso2);
    expect(hoja.filas[1][0].estilo?.negrita).toBe(true);
    expect(hoja.filas[1][0].estilo?.fondo).toBe("#ffff00");
  });
});

describe("fórmulas escritas por el usuario", () => {
  it("se guardan como fórmula, no como texto", async () => {
    const zip = await abrirPaquete(await libro());
    const blob = await guardarCambios(zip, {
      celdas: [{ hoja: 0, fila: 5, columna: 2, valor: "=SUM(B2:B3)" }],
    });
    const salida = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await salida.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(xml).toContain("<f>SUM(B2:B3)</f>");
    expect(xml).not.toContain(">=SUM(B2:B3)<");   // no quedó como texto
  });

  it("el libro pide recalcular para que Excel resuelva la fórmula nueva", async () => {
    const zip = await abrirPaquete(await libro());
    const blob = await guardarCambios(zip, {
      celdas: [{ hoja: 0, fila: 5, columna: 2, valor: "=SUM(B2:B3)" }],
    });
    const salida = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(await salida.file("xl/workbook.xml")!.async("string")).toContain("fullCalcOnLoad");
  });
});

describe("mover referencias al insertar o eliminar", () => {
  it("EL CASO QUE IMPORTA: insertar una fila corre las fórmulas de abajo", () => {
    // Insertar en la fila 2 ⇒ lo que apuntaba a B2:B3 pasa a apuntar a B3:B4.
    expect(moverFormula("SUM(B2:B3)", "fila", 2, 1)).toBe("SUM(B3:B4)");
  });

  it("no toca lo que está por encima del corte", () => {
    expect(moverFormula("SUM(B2:B3)", "fila", 5, 1)).toBe("SUM(B2:B3)");
  });

  it("eliminar una fila deja #REF! donde apuntaba a la borrada", () => {
    expect(moverFormula("A5*2", "fila", 5, -1)).toContain("#REF!");
  });

  it("respeta las referencias absolutas y las mueve igual", () => {
    expect(moverFormula("$B$2+1", "fila", 1, 1)).toBe("$B$3+1");
  });

  it("no toca un texto entre comillas que parece una referencia", () => {
    expect(moverFormula('SI(A1>0;"ver B2";"")', "fila", 1, 1)).toBe('SI(A2>0;"ver B2";"")');
  });

  it("mueve columnas igual que filas", () => {
    expect(moverFormula("SUM(B2:C2)", "columna", 2, 1)).toBe("SUM(C2:D2)");
  });
});

describe("insertar y eliminar en el archivo", () => {
  it("insertar una fila empuja los datos hacia abajo", async () => {
    const zip = await abrirPaquete(await libro());
    const blob = await guardarCambios(zip, {
      estructura: [{ hoja: 0, eje: "fila", indice: 2, delta: 1 }],
    });
    const hoja = await primeraHoja(blob);
    expect(hoja.filas[0][0].crudo).toBe("Producto");   // el encabezado no se movió
    expect(hoja.filas[1][0].crudo).toBe("");           // fila nueva, vacía
    expect(hoja.filas[2][0].crudo).toBe("Arroz");      // bajó una
  });

  it("insertar una fila corrige la fórmula del total", async () => {
    const zip = await abrirPaquete(await libro());
    const blob = await guardarCambios(zip, {
      estructura: [{ hoja: 0, eje: "fila", indice: 2, delta: 1 }],
    });
    const hoja = await primeraHoja(blob);
    const conFormula = hoja.filas.flat().find((c) => c.formula);
    expect(conFormula?.formula).toBe("SUM(B3:B4)");
  });

  it("eliminar una fila la saca de verdad", async () => {
    const zip = await abrirPaquete(await libro());
    const blob = await guardarCambios(zip, {
      estructura: [{ hoja: 0, eje: "fila", indice: 2, delta: -1 }],
    });
    const hoja = await primeraHoja(blob);
    expect(hoja.filas[1][0].crudo).toBe("Aceite");     // Arroz ya no está
  });

  it("insertar una columna corre las celdas a la derecha", async () => {
    const zip = await abrirPaquete(await libro());
    const blob = await guardarCambios(zip, {
      estructura: [{ hoja: 0, eje: "columna", indice: 2, delta: 1 }],
    });
    const hoja = await primeraHoja(blob);
    expect(hoja.filas[0][0].crudo).toBe("Producto");
    expect(hoja.filas[0][1].crudo).toBe("");           // columna nueva
    expect(hoja.filas[0][2].crudo).toBe("Costo");
  });

  it("la celda combinada se estira al insertar dentro", async () => {
    const zip = await abrirPaquete(await libro());
    const blob = await guardarCambios(zip, {
      estructura: [{ hoja: 0, eje: "columna", indice: 2, delta: 1 }],
    });
    const hoja = await primeraHoja(blob);
    const combinada = hoja.filas.flat().find((c) => c.colspan);
    expect(combinada?.colspan).toBe(4);   // era A6:C6 (3), ahora abarca 4
  });

  it("insertar y después escribir cae en la posición nueva", async () => {
    const zip = await abrirPaquete(await libro());
    const blob = await guardarCambios(zip, {
      estructura: [{ hoja: 0, eje: "fila", indice: 2, delta: 1 }],
      celdas: [{ hoja: 0, fila: 2, columna: 1, valor: "Fideos" }],
    });
    const hoja = await primeraHoja(blob);
    expect(hoja.filas[1][0].crudo).toBe("Fideos");
    expect(hoja.filas[2][0].crudo).toBe("Arroz");
  });
});

describe("ancho de columna", () => {
  it("se guarda el ancho arrastrado", async () => {
    const zip = await abrirPaquete(await libro());
    const blob = await guardarCambios(zip, {
      anchos: [{ hoja: 0, columna: 2, anchoPx: 250 }],
    });
    const hoja = await primeraHoja(blob);
    expect(hoja.anchos[1]).toBeGreaterThan(230);
    expect(hoja.anchos[1]).toBeLessThan(270);
  });

  it("cambiar una columna no le cambia el ancho a las demás", async () => {
    const zip = await abrirPaquete(await libro());
    const blob = await guardarCambios(zip, {
      anchos: [{ hoja: 0, columna: 2, anchoPx: 250 }],
    });
    const hoja = await primeraHoja(blob);
    expect(hoja.anchos[0]).toBeGreaterThan(200);   // la 1 seguía en 30 caracteres
    expect(hoja.anchos[0]).toBeLessThan(230);
  });
});

describe("todo junto", () => {
  it("estructura, valores, formato y ancho en un solo guardado", async () => {
    const zip = await abrirPaquete(await libro());
    const blob = await guardarCambios(zip, {
      estructura: [{ hoja: 0, eje: "fila", indice: 2, delta: 1 }],
      celdas: [{ hoja: 0, fila: 2, columna: 1, valor: "Fideos" }, { hoja: 0, fila: 2, columna: 2, valor: "15.9" }],
      estilos: [{ hoja: 0, fila: 2, columna: 2, formato: { negrita: true, numFmt: FORMATOS.moneda } }],
      anchos: [{ hoja: 0, columna: 2, anchoPx: 180 }],
    });
    const hoja = await primeraHoja(blob);
    expect(hoja.filas[1][0].crudo).toBe("Fideos");
    expect(hoja.filas[1][1].texto).toBe("S/ 15.90");
    expect(hoja.filas[1][1].estilo?.negrita).toBe(true);
    expect(hoja.anchos[1]).toBeGreaterThan(160);
    expect(hoja.filas[2][0].crudo).toBe("Arroz");
  });
});
