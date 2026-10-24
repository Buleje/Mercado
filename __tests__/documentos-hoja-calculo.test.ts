/**
 * Editor de planillas del drive (abrir .xlsx/.csv, editar y guardar como
 * versión nueva).
 *
 * Lo que se blinda: el ida y vuelta. Si al guardar se pierde una fila, se
 * corren las columnas o un precio "1.234,56" queda como texto, el usuario
 * rompe su propia planilla creyendo que la está corrigiendo.
 */
import { describe, expect, it } from "vitest";
import {
  escribirXlsx,
  esHojaEditable,
  formatoDe,
  generarCsv,
  leerXlsx,
  parsearCsv,
  rectangular,
} from "@/lib/documentos/hoja-calculo";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("qué se puede abrir", () => {
  it("acepta xlsx y csv por mime", () => {
    expect(esHojaEditable(XLSX_MIME)).toBe(true);
    expect(esHojaEditable("text/csv")).toBe(true);
  });

  it("se apoya en la extensión cuando el mime no sirve", () => {
    // Los navegadores mandan octet-stream seguido para .xlsx.
    expect(esHojaEditable("application/octet-stream", "precios.xlsx")).toBe(true);
    expect(esHojaEditable(null, "lista.csv")).toBe(true);
  });

  it("no ofrece editar lo que no es planilla", () => {
    expect(esHojaEditable("application/pdf", "contrato.pdf")).toBe(false);
    expect(esHojaEditable("image/png", "foto.png")).toBe(false);
    expect(esHojaEditable(undefined, undefined)).toBe(false);
  });

  it("distingue el formato de salida", () => {
    expect(formatoDe("text/csv")).toBe("csv");
    expect(formatoDe("application/octet-stream", "datos.csv")).toBe("csv");
    expect(formatoDe(XLSX_MIME)).toBe("xlsx");
  });
});

describe("CSV", () => {
  it("respeta comas y comillas dentro de una celda", () => {
    const filas = parsearCsv('nombre,precio\n"Arroz, extra",12.50\n');
    expect(filas).toEqual([["nombre", "precio"], ["Arroz, extra", "12.50"]]);
  });

  it("entiende la comilla escapada", () => {
    expect(parsearCsv('a,"dijo ""hola""",b')).toEqual([["a", 'dijo "hola"', "b"]]);
  });

  it("no se rompe con saltos de línea de Windows", () => {
    expect(parsearCsv("a,b\r\nc,d\r\n")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("ida y vuelta sin perder ni agregar nada", () => {
    const original = [["nombre", "obs"], ["Arroz, extra", 'con "comillas"'], ["", "vacío al inicio"]];
    expect(parsearCsv(generarCsv(original))).toEqual(original);
  });

  it("sólo cita lo que hace falta", () => {
    expect(generarCsv([["simple", "con,coma"]])).toBe('simple,"con,coma"');
  });
});

describe("matriz rectangular", () => {
  it("empareja filas cortas (la grilla necesita todas iguales)", () => {
    expect(rectangular([["a", "b", "c"], ["d"]])).toEqual([["a", "b", "c"], ["d", "", ""]]);
  });

  it("respeta mínimos para no dejar la grilla vacía", () => {
    expect(rectangular([], 2, 3)).toEqual([["", "", ""], ["", "", ""]]);
  });
});

describe("ida y vuelta xlsx", () => {
  const hoja = (filas: string[][], nombre = "Datos") => [{ nombre, filas, tieneFormulas: false }];

  it("EL CASO QUE IMPORTA: lo que se guarda es lo que se vuelve a leer", async () => {
    const filas = [["Producto", "Precio", "Stock"], ["Arroz", "12.5", "40"], ["Aceite", "18", "7"]];
    const blob = await escribirXlsx(hoja(filas));
    const leido = await leerXlsx(await blob.arrayBuffer());

    expect(leido).toHaveLength(1);
    expect(leido[0].nombre).toBe("Datos");
    expect(leido[0].filas).toEqual(filas);
  });

  it("los números quedan como número, no como texto", async () => {
    // Si Excel los toma como texto, el usuario no puede sumarlos.
    const blob = await escribirXlsx(hoja([["Precio"], ["1234.56"]]));
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(typeof wb.getWorksheet("Datos")!.getCell("A2").value).toBe("number");
  });

  it("acepta la coma decimal que usa un usuario peruano", async () => {
    const blob = await escribirXlsx(hoja([["Precio"], ["1.234,56"]]));
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.getWorksheet("Datos")!.getCell("A2").value).toBe(1234.56);
  });

  it("no destroza los códigos con cero adelante", async () => {
    // "007" como número sería 7 y el código deja de servir.
    const blob = await escribirXlsx(hoja([["Codigo"], ["007"], ["00123"]]));
    const leido = await leerXlsx(await blob.arrayBuffer());
    expect(leido[0].filas[1][0]).toBe("007");
    expect(leido[0].filas[2][0]).toBe("00123");
  });

  it("conserva varias hojas con sus nombres", async () => {
    const blob = await escribirXlsx([
      { nombre: "Enero", filas: [["a"]], tieneFormulas: false },
      { nombre: "Febrero", filas: [["b"]], tieneFormulas: false },
    ]);
    const leido = await leerXlsx(await blob.arrayBuffer());
    expect(leido.map((h) => h.nombre)).toEqual(["Enero", "Febrero"]);
  });

  it("una planilla vacía no rompe el editor", async () => {
    const blob = await escribirXlsx([]);
    const leido = await leerXlsx(await blob.arrayBuffer());
    expect(leido.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(leido[0].filas)).toBe(true);
  });

  it("las celdas vacías no corren las columnas de lugar", async () => {
    const filas = [["a", "", "c"], ["", "b", ""]];
    const leido = await leerXlsx(await (await escribirXlsx(hoja(filas))).arrayBuffer());
    expect(leido[0].filas[0][2]).toBe("c");
    expect(leido[0].filas[1][1]).toBe("b");
  });

  it("avisa cuando el archivo original traía fórmulas", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Conf");
    ws.addRow([10]);
    ws.addRow([20]);
    ws.getCell("A3").value = { formula: "SUM(A1:A2)", result: 30 } as never;
    const buf = await wb.xlsx.writeBuffer();

    const leido = await leerXlsx(buf as ArrayBuffer);
    expect(leido[0].tieneFormulas).toBe(true);
    // Se muestra el RESULTADO, que es lo que el usuario espera ver.
    expect(leido[0].filas[2][0]).toBe("30");
  });
});
