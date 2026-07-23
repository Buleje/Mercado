/**
 * Editor de planillas de alta fidelidad: leer un .xlsx COMO SE VE en Excel y
 * guardarlo sin destruir lo que el editor no entiende.
 *
 * Lo que se blinda es la promesa entera del editor: que abrir un catálogo real
 * en el panel y corregir un precio no cueste perder los gráficos, el formato
 * condicional ni las celdas combinadas del archivo.
 */
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  colorHex, colorLegible, colorMuyOscuro, formatearValor, leerXlsxConFormato,
  letraANumero, numeroALetra, textoDeValor,
} from "@/lib/documentos/xlsx-formato";
import { abrirPaquete, guardarCambios, rutasDeHojas } from "@/lib/documentos/xlsx-escritura";

/** Planilla con el formato que trae un archivo real de un negocio. */
async function libroDePrueba(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Catálogo");

  ws.getColumn(1).width = 40;          // columna ancha para nombres largos
  ws.getColumn(2).width = 12;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).hidden = true;

  const cab = ws.addRow(["Producto", "Costo", "Venta", "Interno"]);
  cab.height = 28;
  cab.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF00A0A0" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = { bottom: { style: "thin" } };
  });

  const fila = ws.addRow(["Arroz Costeño 5kg", 22, 27.9, "x"]);
  fila.getCell(2).numFmt = '"S/ "#,##0.00';
  fila.getCell(3).numFmt = '"S/ "#,##0.00';
  ws.addRow(["Aceite Primor 1L", 8.5, 11.2, "y"]);
  ws.getCell("A5").value = "TOTAL";
  ws.getCell("A5").font = { bold: true };
  ws.getCell("B5").value = { formula: "SUM(B2:B3)", result: 30.5 } as never;

  ws.mergeCells("A7:C7");
  ws.getCell("A7").value = "Precios sujetos a cambio";
  ws.getCell("A7").alignment = { horizontal: "center" };

  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];

  wb.addWorksheet("Proveedores").addRow(["Nombre", "RUC"]);

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe("leer con el formato del archivo", () => {
  it("respeta el ancho de cada columna en vez de igualarlas", async () => {
    const [hoja] = await leerXlsxConFormato(await libroDePrueba());
    expect(hoja.anchos[0]).toBeGreaterThan(hoja.anchos[1]);   // 40 vs 12
    expect(hoja.anchos[0]).toBeGreaterThan(200);
  });

  it("trae el alto de fila y las columnas ocultas", async () => {
    const [hoja] = await leerXlsxConFormato(await libroDePrueba());
    expect(hoja.altos[0]).toBeGreaterThan(30);   // 28 pt → px
    expect(hoja.columnasOcultas[3]).toBe(true);
  });

  it("lee negrita, color de letra y color de fondo", async () => {
    const [hoja] = await leerXlsxConFormato(await libroDePrueba());
    const cab = hoja.filas[0][0];
    expect(cab.estilo?.negrita).toBe(true);
    expect(cab.estilo?.color).toBe("#ffffff");
    expect(cab.estilo?.fondo).toBe("#00a0a0");
    expect(cab.estilo?.alineacion).toBe("center");
  });

  it("muestra el número con el formato del archivo, no crudo", async () => {
    const [hoja] = await leerXlsxConFormato(await libroDePrueba());
    expect(hoja.filas[1][1].texto).toContain("S/");
    expect(hoja.filas[1][1].texto).toContain("22.00");
    // Editable = el valor de verdad, sin el disfraz.
    expect(hoja.filas[1][1].crudo).toBe("22");
  });

  it("marca la celda combinada y tapa las que quedan debajo", async () => {
    const [hoja] = await leerXlsxConFormato(await libroDePrueba());
    expect(hoja.filas[6][0].colspan).toBe(3);
    expect(hoja.filas[6][1].tapada).toBe(true);
    expect(hoja.filas[6][2].tapada).toBe(true);
  });

  it("conserva el panel congelado para que el encabezado no se pierda", async () => {
    const [hoja] = await leerXlsxConFormato(await libroDePrueba());
    expect(hoja.congelado).toEqual({ filas: 1, columnas: 1 });
  });

  it("señala las fórmulas y muestra su resultado", async () => {
    const [hoja] = await leerXlsxConFormato(await libroDePrueba());
    expect(hoja.tieneFormulas).toBe(true);
    expect(hoja.filas[4][1].formula).toBe("SUM(B2:B3)");
    expect(hoja.filas[4][1].texto).toBe("30.5");
  });

  it("lee todas las hojas del libro", async () => {
    const hojas = await leerXlsxConFormato(await libroDePrueba());
    expect(hojas.map((h) => h.nombre)).toEqual(["Catálogo", "Proveedores"]);
  });
});

describe("formato numérico", () => {
  it("moneda con separador de miles", () => {
    expect(formatearValor(1234.5, '"S/ "#,##0.00')).toBe("S/ 1,234.50");
  });
  it("porcentaje", () => {
    expect(formatearValor(0.155, "0.0%")).toBe("15.5%");
  });
  it("sin formato, el valor tal cual", () => {
    expect(formatearValor(42, "General")).toBe("42");
    expect(formatearValor("texto")).toBe("texto");
  });
  it("celda vacía no dice 'undefined'", () => {
    expect(formatearValor(null)).toBe("");
    expect(formatearValor(undefined)).toBe("");
  });
});

describe("colores", () => {
  it("argb con alfa → hex", () => {
    expect(colorHex({ argb: "FF00A0A0" })).toBe("#00a0a0");
  });
  it("alfa 00 es 'sin color', no negro", () => {
    expect(colorHex({ argb: "00000000" })).toBeUndefined();
  });
  it("resuelve los colores de tema, que son la mayoría", () => {
    expect(colorHex({ theme: 4 })).toBe("#4472c4");
    expect(colorHex({ theme: 4, tint: 0.6 })).not.toBe("#4472c4");
  });

  it("EL AUTOMÁTICO no se fija: en dark dejaría letra negra sobre fondo oscuro", () => {
    // Los temas 0 y 1 sin matiz son el "color automático" de Excel, no negro
    // y blanco literales. Casi toda celda sin formato viene así.
    expect(colorHex({ theme: 1 })).toBeUndefined();
    expect(colorHex({ theme: 0 })).toBeUndefined();
    // Con matiz sí es una elección del autor y se respeta.
    expect(colorHex({ theme: 1, tint: 0.5 })).toBeDefined();
  });

  it("detecta el color de letra que sería ilegible sobre fondo oscuro", () => {
    expect(colorMuyOscuro("#000000")).toBe(true);
    expect(colorMuyOscuro("#1f4e79")).toBe(true);
    expect(colorMuyOscuro("#ffffff")).toBe(false);
  });
});

describe("valores que llegan como objeto", () => {
  // Antes terminaban en "[object Object]" dentro de la celda.
  it("texto con formato mezclado (richText)", () => {
    expect(textoDeValor({ richText: [{ text: "Nota " }, { text: "urgente" }] })).toBe("Nota urgente");
  });

  it("hipervínculo: se lee su texto, no la URL", () => {
    expect(textoDeValor({ text: "Distribuidora Selva", hyperlink: "https://x.pe" })).toBe("Distribuidora Selva");
  });

  it("fórmula: su resultado", () => {
    expect(textoDeValor({ formula: "SUM(A1:A2)", result: 30 })).toBe("30");
  });

  it("error de Excel", () => {
    expect(textoDeValor({ error: "#DIV/0!" })).toBe("#DIV/0!");
  });

  it("nada raro con lo simple", () => {
    expect(textoDeValor("hola")).toBe("hola");
    expect(textoDeValor(42)).toBe("42");
    expect(textoDeValor(null)).toBe("");
  });
});

describe("contraste sobre el relleno del archivo", () => {
  // En modo oscuro, una fila con relleno claro quedaba con letra clara: ilegible.
  it("letra oscura sobre fondo claro y clara sobre fondo oscuro", () => {
    expect(colorLegible("#f8fafc")).toBe("#111827");
    expect(colorLegible("#00a0a0")).toBe("#ffffff");
    expect(colorLegible("#ffffff")).toBe("#111827");
  });

  it("la celda con relleno del archivo trae su color de letra resuelto", async () => {
    const [hoja] = await leerXlsxConFormato(await libroDePrueba());
    expect(hoja.filas[0][0].estilo?.fondo).toBe("#00a0a0");
    expect(hoja.filas[0][0].estilo?.color).toBe("#ffffff");   // el del archivo, respetado
  });
});

describe("referencias de celda", () => {
  it("van y vuelven como en Excel", () => {
    expect(numeroALetra(1)).toBe("A");
    expect(numeroALetra(27)).toBe("AA");
    expect(numeroALetra(68)).toBe("BP");
    expect(letraANumero("BP")).toBe(68);
    expect(letraANumero(numeroALetra(703))).toBe(703);
  });
});

describe("guardar sin romper el archivo", () => {
  it("EL CASO QUE IMPORTA: cambia una celda y el resto del formato queda", async () => {
    const zip = await abrirPaquete(await libroDePrueba());
    const blob = await guardarCambios(zip, [{ hoja: 0, fila: 2, columna: 2, valor: "25.5" }]);

    const [hoja] = await leerXlsxConFormato(await blob.arrayBuffer());
    expect(hoja.filas[1][1].crudo).toBe("25.5");
    expect(hoja.filas[1][1].texto).toContain("S/");            // el formato sigue
    expect(hoja.filas[0][0].estilo?.fondo).toBe("#00a0a0");    // el encabezado sigue
    expect(hoja.filas[6][0].colspan).toBe(3);                  // la combinada sigue
    expect(hoja.anchos[0]).toBeGreaterThan(200);               // los anchos siguen
    expect(hoja.congelado.filas).toBe(1);                      // el congelado sigue
  });

  it("no toca los archivos del paquete que no le tocan", async () => {
    const original = await libroDePrueba();
    const antes = await JSZip.loadAsync(original);
    // Un gráfico: lo que se perdería si el archivo se regenerara.
    antes.file("xl/charts/chart1.xml", "<chart>ventas por mes</chart>");
    const conGrafico = await antes.generateAsync({ type: "arraybuffer" });

    const zip = await abrirPaquete(conGrafico);
    const blob = await guardarCambios(zip, [{ hoja: 0, fila: 2, columna: 2, valor: "99" }]);

    const despues = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(await despues.file("xl/charts/chart1.xml")?.async("string")).toBe("<chart>ventas por mes</chart>");
  });

  it("un texto se guarda como texto y un número como número", async () => {
    const zip = await abrirPaquete(await libroDePrueba());
    const blob = await guardarCambios(zip, [
      { hoja: 0, fila: 2, columna: 1, valor: "Arroz Añejo" },
      { hoja: 0, fila: 2, columna: 2, valor: "31.75" },
    ]);
    const [hoja] = await leerXlsxConFormato(await blob.arrayBuffer());
    expect(hoja.filas[1][0].crudo).toBe("Arroz Añejo");
    expect(hoja.filas[1][1].crudo).toBe("31.75");
    // Como número: si fuera texto, en Excel no se podría sumar.
    expect(hoja.filas[1][1].estilo?.alineacion).toBe("right");
  });

  it("no destroza un código con cero adelante", async () => {
    const zip = await abrirPaquete(await libroDePrueba());
    const blob = await guardarCambios(zip, [{ hoja: 0, fila: 2, columna: 1, valor: "007" }]);
    const [hoja] = await leerXlsxConFormato(await blob.arrayBuffer());
    expect(hoja.filas[1][0].crudo).toBe("007");
  });

  it("escribe en la hoja correcta cuando hay varias", async () => {
    const zip = await abrirPaquete(await libroDePrueba());
    const blob = await guardarCambios(zip, [{ hoja: 1, fila: 2, columna: 1, valor: "Distribuidora Selva" }]);
    const hojas = await leerXlsxConFormato(await blob.arrayBuffer());
    expect(hojas[1].filas[1][0].crudo).toBe("Distribuidora Selva");
    expect(hojas[0].filas[1][0].crudo).toBe("Arroz Costeño 5kg"); // la otra intacta
  });

  it("escribe en una celda que no existía en el archivo", async () => {
    const zip = await abrirPaquete(await libroDePrueba());
    const blob = await guardarCambios(zip, [{ hoja: 0, fila: 20, columna: 5, valor: "nota al pie" }]);
    const [hoja] = await leerXlsxConFormato(await blob.arrayBuffer());
    expect(hoja.filas[19][4].crudo).toBe("nota al pie");
  });

  it("vaciar una celda la deja vacía de verdad", async () => {
    const zip = await abrirPaquete(await libroDePrueba());
    const blob = await guardarCambios(zip, [{ hoja: 0, fila: 2, columna: 1, valor: "" }]);
    const [hoja] = await leerXlsxConFormato(await blob.arrayBuffer());
    expect(hoja.filas[1][0].crudo).toBe("");
  });

  it("pisar una celda con fórmula deja el libro pidiendo recalcular", async () => {
    // Si no, Excel muestra los totales viejos y avisa de contenido ilegible.
    const zip = await abrirPaquete(await libroDePrueba());
    const blob = await guardarCambios(zip, [{ hoja: 0, fila: 2, columna: 2, valor: "50" }]);
    const salida = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(salida.file("xl/calcChain.xml")).toBeNull();
    expect(await salida.file("xl/workbook.xml")!.async("string")).toContain("fullCalcOnLoad");
  });

  it("los caracteres XML no rompen el archivo", async () => {
    const zip = await abrirPaquete(await libroDePrueba());
    const blob = await guardarCambios(zip, [{ hoja: 0, fila: 2, columna: 1, valor: 'Arroz <"especial"> & Cía' }]);
    const [hoja] = await leerXlsxConFormato(await blob.arrayBuffer());
    expect(hoja.filas[1][0].crudo).toBe('Arroz <"especial"> & Cía');
  });

  it("guardar sin cambios devuelve el archivo igual", async () => {
    const zip = await abrirPaquete(await libroDePrueba());
    const blob = await guardarCambios(zip, []);
    const [hoja] = await leerXlsxConFormato(await blob.arrayBuffer());
    expect(hoja.filas[1][0].crudo).toBe("Arroz Costeño 5kg");
  });

  it("resuelve las hojas por el orden de Excel, no por el nombre del archivo", async () => {
    const zip = await abrirPaquete(await libroDePrueba());
    const rutas = await rutasDeHojas(zip);
    expect(rutas).toHaveLength(2);
    expect(rutas[0]).toMatch(/^xl\/worksheets\/.+\.xml$/);
  });
});
