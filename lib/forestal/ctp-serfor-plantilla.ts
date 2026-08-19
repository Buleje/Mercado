"use client";

/**
 * La plantilla del Libro de Operaciones, en el ÚNICO formato: el del SNIFFS.
 *
 * Antes convivían dos: la plantilla propia (hojas «1. Ingreso», «3.», «4.
 * Salida») y el reporte que devuelve el SNIFFS. Dos formatos para el mismo
 * libro es un formato de más — el operador tenía que acordarse de cuál bajó
 * para saber por dónde subirlo, y con dos importadores en el menú la
 * equivocación estaba servida.
 *
 * Queda uno solo, y es el oficial: las mismas cabeceras que imprime el SNIFFS,
 * en las mismas cinco secciones. Lo que se baja de acá y lo que se baja de allá
 * entran por la misma puerta.
 *
 * ROUND-TRIP: la plantilla se genera desde `COLUMNAS_POR_FORMATO`, la misma
 * tabla que usa el importador para reconocer columnas. No pueden divergir: si
 * alguien agrega una columna al formato, aparece en las dos puntas a la vez.
 */

import { COLUMNAS_POR_FORMATO, FORMATOS_LIBRO, type FormatoCtp, type FormatoLibro } from "./ctp-formatos-serfor";

/** Cómo llama el SNIFFS a cada sección en su encabezado. */
const ENCABEZADO_SECCION: Record<FormatoLibro, [string, string]> = {
  ingresos: ["SECCION 1", "INGRESOS"],
  consumos: ["SECCION 2", "CONSUMOS"],
  retrozado: ["APARTADO 2", "RETROZADO"],
  produccion: ["SECCION 3", "PRODUCCIÓN"],
  salidas: ["SECCION 4", "SALIDAS"],
};

/**
 * En qué fila cae la cabecera de cada sección en el libro real.
 *
 * No es un detalle cosmético: son las celdas que el operador ve cuando abre su
 * archivo del SNIFFS al lado de esta plantilla. Consumos es la excepción —su
 * cabecera va una fila más arriba porque no lleva el agrupador «ESPECIE»— y
 * copiarle la fila 6 a todas dejaba las dos planillas desalineadas.
 */
const FILA_CABECERA: Record<FormatoLibro, number> = {
  ingresos: 6,
  consumos: 5,
  retrozado: 6,
  produccion: 6,
  salidas: 6,
};

/**
 * La celda donde el libro pone «ESPECIE» agrupando Nombre Común y Científico.
 *
 * Va en la fila de arriba de la cabecera, sobre la primera de las dos columnas
 * de especie. Consumos no lo trae.
 */
function columnaDeEspecie(formato: FormatoCtp): number | null {
  if (formato === "consumos") return null;
  const i = COLUMNAS_POR_FORMATO[formato].findIndex((c) => c.clave === "especieComun");
  return i >= 0 ? i + 1 : null;
}

/** El nombre de hoja, corto porque Excel corta a 31 caracteres. */
const NOMBRE_HOJA: Record<FormatoLibro, string> = {
  ingresos: "1. Ingresos",
  consumos: "2. Consumos",
  retrozado: "Ap.2 Retrozado",
  produccion: "3. Producción",
  salidas: "4. Salidas",
};

/**
 * Una fila de ejemplo por sección, con datos que se enlazan entre sí.
 *
 * Los códigos NO son aleatorios: el retrozo `3012263/A` sale de la troza
 * `3012263` que ingresó en la Sección 1, y el consumo apunta a ese mismo
 * código. Un ejemplo con datos inconexos enseña el formato pero no la relación,
 * que es justamente lo que hay que entender para llenarlo bien.
 */
const EJEMPLO: Record<FormatoLibro, Record<string, string | number>> = {
  ingresos: {
    numero: 1,
    fecha: "28/05/2024",
    tipoDocumento: "GTF Primaria",
    numeroDocumento: "019-0000002",
    fuenteOrigen: "3",
    tipoProducto: "MADERA EN ROLLO",
    especieComun: "Copaiba",
    especieCientifica: "Copaifera paupera (Herzog) Dwyer",
    codigoOrigen: "33/B (0000010)",
    codigoCtp: "3012263",
    unidad: "Metros Cúbicos",
    cantidad: "3.010",
    observaciones: "",
  },
  consumos: {
    numero: 1,
    fecha: "03/07/2026",
    tipoProducto: "MADERA EN ROLLO",
    especieComun: "Copaiba",
    especieCientifica: "Copaifera paupera (Herzog) Dwyer",
    codigoOrigen: "3012263",
    fuenteOrigen: "",
    unidad: "Metros Cúbicos",
    cantidad: "1.500",
    lote: "001",
    observaciones: "",
  },
  retrozado: {
    fecha: "08/07/2026",
    codigoMadre: "3012263",
    volumenInicial: "3.010",
    codigoRetrozo: "3012263/A",
    especieComun: "Copaiba",
    especieCientifica: "Copaifera paupera (Herzog) Dwyer",
    diametroMayor: "60",
    diametroMenor: "59",
    longitud: "3.1",
    volumenFinal: "1.505",
    observaciones: "",
  },
  produccion: {
    numero: 441,
    fecha: "03/07/2026",
    tipoProducto: "MADERA ASERRADA (COMERCIAL)",
    especieComun: "Copaiba",
    especieCientifica: "Copaifera paupera (Herzog) Dwyer",
    unidad: "Metros Cúbicos",
    cantidad: "0.900",
    lote: "001",
    observaciones: "",
  },
  salidas: {
    numero: 1,
    fecha: "24/07/2026",
    tipoDocumento: "GTF de Establecimiento",
    numeroDocumento: "19-001-0000051",
    tipoProducto: "MADERA ASERRADA (COMERCIAL)",
    especieComun: "Copaiba",
    especieCientifica: "Copaifera paupera (Herzog) Dwyer",
    lote: "001",
    codigoProducto: "MA2",
    unidad: "Metros Cúbicos",
    cantidad: "0.900",
    observaciones: "",
  },
};

/** El número que trae el libro de ejemplo; el operador lo reemplaza por el suyo. */
export const N_REGISTRO_DEMO = "19-SEC/AUT-CTP-2020-12";

const TITULO_LIBRO =
  "LIBRO DE OPERACIONES DE CENTROS DE TRANSFORMACION PRIMARIA DE PRODUCTOS Y SUB PRODUCTOS FORESTALES MADERABLES";

/**
 * Genera la plantilla con el preámbulo real del SNIFFS.
 *
 * Se incluye el preámbulo —título, N° de registro, sección— a propósito: es
 * como viene el archivo de verdad, y el importador tiene que saber saltarlo. Una
 * plantilla «limpia» que empieza en la fila 1 probaría un caso que no existe.
 */
export async function descargarPlantillaSerfor(nRegistro = N_REGISTRO_DEMO): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Buleje";
  wb.created = new Date();

  // ── Hoja de instrucciones ──
  const guia = wb.addWorksheet("Cómo llenarla");
  guia.columns = [{ width: 110 }];
  const lineas: [string, boolean][] = [
    ["Libro de Operaciones del CTP — formato SERFOR (RDE D000025-2023)", true],
    ["", false],
    ["Esta plantilla tiene las MISMAS columnas que el reporte del SNIFFS.", false],
    ["Si ya bajaste el Excel del SNIFFS, subí ese directamente: no hace falta pasarlo acá.", false],
    ["", false],
    ["Cómo llenarla", true],
    ["1. Una hoja por sección. Llená solo las que necesites — las vacías se ignoran.", false],
    ["   También podés bajar cada sección por separado y subirlas de a una.", false],
    ["2. Borrá la fila de ejemplo (va en gris) antes de subirla.", false],
    ["3. NO cambies los nombres de las columnas ni el orden: así es como se reconoce el formato.", false],
    ["4. Fechas en DD/MM/AAAA. Números con punto decimal (3.010).", false],
    ["", false],
    ["Cómo se enlazan las secciones", true],
    ["· El «Código de CTP» del ingreso identifica la troza (ej. 3012263).", false],
    ["· El retrozado parte esa troza en pedazos (3012263/A, 3012263/B).", false],
    ["· El consumo apunta al código de la troza o del retrozo que entró a la sierra.", false],
    ["· La producción y la salida se enlazan por el Lote (ej. 001).", false],
    ["", false],
    ["Los ejemplos de cada hoja usan esos mismos códigos para que se vea la relación.", false],
  ];
  for (const [texto, negrita] of lineas) {
    const row = guia.addRow([texto]);
    if (negrita) row.font = { bold: true, size: 12 };
  }

  // ── Una hoja por sección ──
  for (const formato of FORMATOS_LIBRO) {
    escribirSeccion(wb.addWorksheet(NOMBRE_HOJA[formato]), formato, nRegistro);
  }

  await bajar(wb, "plantilla-libro-CTP-SERFOR.xlsx");
}

/**
 * Escribe una sección con el preámbulo y las celdas del libro real.
 *
 * Se comparte entre la plantilla completa y la individual: son el MISMO formato,
 * y tenerlo en un solo lugar es lo que garantiza que un archivo bajado suelto
 * entre por la misma puerta que el libro entero.
 */
function escribirSeccion(ws: import("exceljs").Worksheet, formato: FormatoLibro, nRegistro: string): void {
    const cols = COLUMNAS_POR_FORMATO[formato];
    const [seccion, nombre] = ENCABEZADO_SECCION[formato];
    const filaCab = FILA_CABECERA[formato];

    ws.addRow([TITULO_LIBRO]).font = { bold: true, size: 11 };
    ws.addRow([]);
    ws.addRow(["N° REGISTRO", nRegistro]);
    ws.addRow([seccion, nombre]).font = { bold: true };

    /* La fila que va justo encima de la cabecera: lleva «ESPECIE» agrupando las
       dos columnas de especie, salvo en Consumos, que no la tiene. */
    if (filaCab > 5) {
      const agrup = ws.addRow([]);
      const colEsp = columnaDeEspecie(formato);
      if (colEsp) {
        const celda = agrup.getCell(colEsp);
        celda.value = "ESPECIE";
        celda.font = { bold: true };
        celda.alignment = { horizontal: "center" };
        /* Merge sobre las dos columnas de especie, como en el libro. */
        ws.mergeCells(agrup.number, colEsp, agrup.number, colEsp + 1);
      }
    }

    const cab = ws.addRow(cols.map((c) => c.label));
    cab.font = { bold: true };
    cab.alignment = { vertical: "middle", wrapText: true };
    cab.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF3F3" } };
      cell.border = {
        top: { style: "thin" }, left: { style: "thin" },
        bottom: { style: "thin" }, right: { style: "thin" },
      };
    });

    /* La fila de ejemplo va en gris e itálica: tiene que leerse como «esto se
       borra», no como un dato del libro. */
    const ej = ws.addRow(cols.map((c) => EJEMPLO[formato][c.clave] ?? ""));
    ej.font = { italic: true, color: { argb: "FF9AA5B1" } };

    ws.columns = cols.map((c) => ({
      width: Math.min(38, Math.max(12, c.label.length + 4)),
    })) as never;
    /* Las cabeceras congeladas: con doce columnas y doscientas filas, sin esto
       no se sabe qué se está llenando a partir de la fila 30. */
    ws.views = [{ state: "frozen", ySplit: filaCab }];
}

/**
 * La plantilla de UNA sección, para el operador que trabaja archivo por archivo.
 *
 * Mismas celdas que la hoja correspondiente del libro completo —lo escribe la
 * misma función— así que el importador no distingue de cuál de las dos salió.
 */
export async function descargarPlantillaDeSeccion(formato: FormatoLibro, nRegistro = N_REGISTRO_DEMO): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Buleje";
  wb.created = new Date();
  escribirSeccion(wb.addWorksheet(NOMBRE_HOJA[formato]), formato, nRegistro);
  await bajar(wb, `plantilla-CTP-${ARCHIVO[formato]}.xlsx`);
}

/** El sufijo del archivo de cada sección. */
const ARCHIVO: Record<FormatoLibro, string> = {
  ingresos: "1-ingresos",
  consumos: "2-consumos",
  retrozado: "ap2-retrozado",
  produccion: "3-produccion",
  salidas: "4-salidas",
};

async function bajar(wb: import("exceljs").Workbook, nombre: string): Promise<void> {
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

/** Para el test de round-trip: las cabeceras que escribe la plantilla. */
export function cabecerasDePlantilla(formato: FormatoLibro): string[] {
  return COLUMNAS_POR_FORMATO[formato].map((c) => c.label);
}
