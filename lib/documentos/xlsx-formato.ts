/**
 * xlsx-formato — leer una planilla del drive CON su formato, para poder
 * mostrarla como se ve en Excel y no como una grilla gris.
 *
 * Antes se leían sólo los valores: un catálogo real de 68 columnas quedaba
 * ilegible —todo el mismo ancho, sin colores, sin celdas combinadas, con los
 * títulos cortados—. Acá se leen además: ancho de columna, alto de fila,
 * negrita/cursiva, colores de letra y de fondo, alineación, bordes, celdas
 * combinadas, filas y columnas ocultas, el panel congelado y el formato
 * numérico (para que "1200" se vea "S/ 1,200.00" como en el archivo).
 *
 * Esto es SÓLO PRESENTACIÓN. Guardar no pasa por acá: se hace editando el
 * archivo original celda por celda (ver `xlsx-escritura.ts`), así lo que no se
 * tocó —gráficos, tablas dinámicas, formato condicional— sale intacto.
 */

/** Formato visual resuelto de una celda. Todo opcional: lo ausente se hereda. */
export interface EstiloCelda {
  negrita?: boolean;
  cursiva?: boolean;
  subrayado?: boolean;
  /** Color de la letra, `#rrggbb`. */
  color?: string;
  /** Color de fondo, `#rrggbb`. */
  fondo?: string;
  /** Tamaño en puntos, tal como lo guarda Excel. */
  tamano?: number;
  alineacion?: "left" | "center" | "right";
  alineacionVertical?: "top" | "middle" | "bottom";
  ajustarTexto?: boolean;
  /** Bordes presentes, para dibujar sólo los que tiene el archivo. */
  bordes?: { arriba?: boolean; abajo?: boolean; izq?: boolean; der?: boolean };
}

export interface CeldaHoja {
  /** Texto ya formateado, como se lee en Excel ("S/ 1,200.00"). */
  texto: string;
  /** Lo que se edita: el valor crudo, sin el disfraz del formato. */
  crudo: string;
  /** true si el valor sale de una fórmula (editarla la reemplaza). */
  formula?: string;
  /** Código de formato de Excel — hace falta para reformatear al recalcular. */
  numFmt?: string;
  estilo?: EstiloCelda;
  /** Cuántas celdas ocupa, si es el ancla de una celda combinada. */
  colspan?: number;
  rowspan?: number;
  /** true si está tapada por una celda combinada: no se dibuja. */
  tapada?: boolean;
}

export interface HojaFormato {
  nombre: string;
  filas: CeldaHoja[][];
  /** Ancho de cada columna en píxeles. */
  anchos: number[];
  /** Alto de cada fila en píxeles. */
  altos: number[];
  columnasOcultas: boolean[];
  filasOcultas: boolean[];
  /** Filas/columnas congeladas (el "Inmovilizar paneles" de Excel). */
  congelado: { filas: number; columnas: number };
  tieneFormulas: boolean;
  /** true si la hoja está oculta en Excel. */
  oculta: boolean;
}

/** Ancho por defecto de Excel, en píxeles. */
const ANCHO_DEFAULT = 64;
const ALTO_DEFAULT = 20;

/**
 * Ancho de Excel (en "caracteres") → píxeles. La fórmula sale de la
 * especificación OOXML para la fuente por defecto de 11 pt.
 */
function anchoAPx(width: number | undefined): number {
  if (!width || width <= 0) return ANCHO_DEFAULT;
  return Math.min(500, Math.round(width * 7 + 5));
}

/** Alto de fila en puntos → píxeles (72 pt = 96 px). */
function altoAPx(height: number | undefined): number {
  if (!height || height <= 0) return ALTO_DEFAULT;
  return Math.min(300, Math.round(height * (96 / 72)));
}

/**
 * Paleta estándar de temas de Office. Los archivos guardan muchos colores como
 * "tema 4 aclarado 60%" en vez de un RGB, y sin esta tabla se perderían.
 */
const TEMA_OFFICE = [
  "#ffffff", "#000000", "#e7e6e6", "#44546a", "#4472c4", "#ed7d31",
  "#a5a5a5", "#ffc000", "#5b9bd5", "#70ad47",
];

/** Aclara u oscurece un color según el `tint` de Excel (-1 a 1). */
function aplicarTint(hex: string, tint: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mezcla = (c: number) => {
    const v = tint < 0 ? c * (1 + tint) : c + (255 - c) * tint;
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  const r = mezcla((n >> 16) & 0xff), g = mezcla((n >> 8) & 0xff), b = mezcla(n & 0xff);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

type ColorExcel = { argb?: string; theme?: number; tint?: number } | undefined;

/**
 * Color de exceljs (argb, tema o índice) → `#rrggbb`.
 *
 * Los temas 0 y 1 SIN matiz son el "color automático" de Excel: significan
 * "el color de texto/fondo por defecto", no negro y blanco literales. Se
 * devuelven como `undefined` para que mande el tema de la aplicación — si se
 * fijaran a negro, en modo oscuro cada celda sin formato quedaría con letra
 * negra sobre fondo oscuro, ilegible.
 */
export function colorHex(c: ColorExcel): string | undefined {
  if (!c) return undefined;
  if (typeof c.argb === "string" && c.argb.length >= 6) {
    const hex = c.argb.length === 8 ? c.argb.slice(2) : c.argb;
    // Alpha 00 = transparente: no es un color, es "sin relleno".
    if (c.argb.length === 8 && c.argb.slice(0, 2) === "00") return undefined;
    return `#${hex.toLowerCase()}`;
  }
  if (typeof c.theme === "number") {
    if ((c.theme === 0 || c.theme === 1) && !c.tint) return undefined;   // automático
    const base = TEMA_OFFICE[c.theme] ?? "#000000";
    return c.tint ? aplicarTint(base, c.tint) : base;
  }
  return undefined;
}

/**
 * ¿Este color de letra se puede leer sobre un fondo oscuro?
 *
 * Un archivo puede fijar el negro explícitamente (no como "automático"): en
 * modo oscuro, respetarlo al pie de la letra deja la celda ilegible. Se avisa
 * para poder ignorarlo sólo en ese caso.
 */
export function colorMuyOscuro(hex: string): boolean {
  const n = parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(n)) return false;
  const [r, g, b] = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.35;
}

/**
 * Aplica el formato numérico de Excel para MOSTRAR el valor.
 *
 * No se implementa el lenguaje completo de formatos (es enorme): se cubre lo
 * que aparece en las planillas de un negocio —moneda, miles, decimales,
 * porcentaje y fecha— y ante cualquier otra cosa se muestra el valor tal cual,
 * que es preferible a inventar.
 */
export function formatearValor(valor: unknown, numFmt?: string): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) return valor.toLocaleDateString("es-PE");
  // Un valor de exceljs puede ser un objeto: texto con formato ("richText"),
  // un hipervínculo, una fórmula o un error. Sin desenvolverlo, la celda
  // mostraba "[object Object]".
  if (typeof valor === "object") return textoDeValor(valor);
  if (typeof valor !== "number") return String(valor);
  if (!numFmt || numFmt === "General") return String(valor);

  const f = numFmt.toLowerCase();
  if (f.includes("%")) {
    const dec = (f.split(".")[1]?.match(/0/g) ?? []).length;
    return `${(valor * 100).toFixed(dec)}%`;
  }
  if (/[ymd]/.test(f) && !f.includes("#") && !f.includes("0.0")) {
    // Excel cuenta días desde 1900; exceljs ya devuelve Date en la mayoría de
    // los casos, esto cubre los que llegan como número.
    const ms = (valor - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? String(valor) : d.toLocaleDateString("es-PE");
  }

  const decimales = (f.split(".")[1]?.match(/[0#]/g) ?? []).length;
  const miles = f.includes("#,##") || f.includes("#.##");
  let out = miles
    ? valor.toLocaleString("es-PE", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
    : valor.toFixed(decimales);

  // Símbolo de moneda literal del formato ("S/", "$", "€").
  const moneda = /\[?\$?(s\/|us\$|\$|€|£)/.exec(f)?.[1];
  if (moneda) out = `${moneda.toUpperCase().replace("S/", "S/ ")}${out}`.replace("$ ", "$");
  return out;
}

/**
 * Cualquier valor de exceljs → texto plano.
 *
 * Los tipos que llegan como objeto son: texto con formato mezclado
 * (`richText`), hipervínculo (`text` + `hyperlink`), fórmula (`result`) y
 * error (`error`). Cada uno tiene su forma de decir "lo que se lee".
 */
export function textoDeValor(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toLocaleDateString("es-PE");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return o.richText.map((r) => String((r as { text?: string }).text ?? "")).join("");
    }
    if ("text" in o) return textoDeValor(o.text);          // hipervínculo
    if ("result" in o) return textoDeValor(o.result);      // fórmula
    if ("error" in o) return String(o.error);
    if ("hyperlink" in o) return String(o.hyperlink);
  }
  return String(v);
}

/**
 * Color de letra legible sobre un fondo dado.
 *
 * Hace falta porque el archivo define el relleno de una celda pero casi nunca
 * el color de la letra: Excel asume negro. Si se dejara que la letra tomara el
 * color del tema de la app, en modo oscuro una fila con relleno claro quedaría
 * texto claro sobre fondo claro — ilegible. Se decide por luminancia relativa.
 */
export function colorLegible(fondo: string): string {
  const n = parseInt(fondo.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  // Coeficientes de luminancia percibida (ITU-R BT.601).
  const luz = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luz > 0.55 ? "#111827" : "#ffffff";
}

/** Alineación horizontal por defecto: los números a la derecha, como Excel. */
function alineacionPorTipo(valor: unknown): EstiloCelda["alineacion"] {
  return typeof valor === "number" ? "right" : "left";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- el modelo de exceljs no está tipado a este nivel de detalle
type WS = any;

function estiloDeCelda(cell: WS, valor: unknown): EstiloCelda | undefined {
  const e: EstiloCelda = {};
  const font = cell.font;
  if (font?.bold) e.negrita = true;
  if (font?.italic) e.cursiva = true;
  if (font?.underline) e.subrayado = true;
  if (font?.size && font.size !== 11) e.tamano = font.size;
  const color = colorHex(font?.color);
  if (color) e.color = color;

  // `pattern: "solid"` es el relleno plano; los degradés se ignoran.
  if (cell.fill?.type === "pattern" && cell.fill.pattern === "solid") {
    const fondo = colorHex(cell.fill.fgColor);
    if (fondo) {
      e.fondo = fondo;
      // Sin color explícito, Excel pinta la letra en negro sobre el relleno:
      // se replica para que la celda se lea igual en claro y en oscuro.
      if (!e.color) e.color = colorLegible(fondo);
    }
  }

  const al = cell.alignment;
  const h = al?.horizontal;
  e.alineacion = h === "center" ? "center" : h === "right" ? "right" : h === "left" ? "left" : alineacionPorTipo(valor);
  if (al?.vertical === "top" || al?.vertical === "middle" || al?.vertical === "bottom") e.alineacionVertical = al.vertical;
  if (al?.wrapText) e.ajustarTexto = true;

  const b = cell.border;
  if (b && (b.top || b.bottom || b.left || b.right)) {
    e.bordes = { arriba: !!b.top, abajo: !!b.bottom, izq: !!b.left, der: !!b.right };
  }
  return Object.keys(e).length > 0 ? e : undefined;
}

/** El valor sin formato — lo que el usuario edita y lo que se guarda. */
function valorCrudo(valor: unknown): string {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return textoDeValor(valor);
}

/** Lee un .xlsx completo con su formato, listo para mostrar. */
export async function leerXlsxConFormato(datos: ArrayBuffer): Promise<HojaFormato[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(datos);

  const hojas: HojaFormato[] = [];
  wb.eachSheet((ws: WS) => {
    const totalFilas = Math.max(ws.rowCount || 0, 1);
    const totalCols = Math.max(ws.columnCount || 0, 1);

    // Celdas combinadas: se marca el ancla con su tamaño y se tapan las demás,
    // que en Excel no se ven.
    const spans = new Map<string, { colspan: number; rowspan: number }>();
    const tapadas = new Set<string>();
    const merges: string[] = Array.isArray(ws.model?.merges) ? ws.model.merges : [];
    for (const rango of merges) {
      const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(rango);
      if (!m) continue;
      const [, c1, f1, c2, f2] = m;
      const col1 = letraANumero(c1), col2 = letraANumero(c2);
      const fil1 = Number(f1), fil2 = Number(f2);
      spans.set(`${fil1}-${col1}`, { colspan: col2 - col1 + 1, rowspan: fil2 - fil1 + 1 });
      for (let f = fil1; f <= fil2; f++) {
        for (let c = col1; c <= col2; c++) {
          if (f !== fil1 || c !== col1) tapadas.add(`${f}-${c}`);
        }
      }
    }

    const filas: CeldaHoja[][] = [];
    const altos: number[] = [];
    const filasOcultas: boolean[] = [];
    let tieneFormulas = false;

    for (let f = 1; f <= totalFilas; f++) {
      const row = ws.getRow(f);
      altos.push(altoAPx(row.height));
      filasOcultas.push(!!row.hidden);

      const celdas: CeldaHoja[] = [];
      for (let c = 1; c <= totalCols; c++) {
        const cell = row.getCell(c);
        const v = cell.value;
        const formula = typeof v === "object" && v !== null && "formula" in v
          ? String((v as { formula: string }).formula)
          : undefined;
        if (formula) tieneFormulas = true;

        const bruto = formula ? (v as { result?: unknown }).result : v;
        const span = spans.get(`${f}-${c}`);
        celdas.push({
          texto: formatearValor(bruto, cell.numFmt),
          crudo: valorCrudo(v),
          formula,
          numFmt: cell.numFmt || undefined,
          estilo: estiloDeCelda(cell, bruto),
          colspan: span?.colspan,
          rowspan: span?.rowspan,
          tapada: tapadas.has(`${f}-${c}`) || undefined,
        });
      }
      filas.push(celdas);
    }

    const anchos: number[] = [];
    const columnasOcultas: boolean[] = [];
    for (let c = 1; c <= totalCols; c++) {
      const col = ws.getColumn(c);
      anchos.push(anchoAPx(col.width));
      columnasOcultas.push(!!col.hidden);
    }

    const vista = Array.isArray(ws.views) ? ws.views[0] : undefined;
    hojas.push({
      nombre: ws.name,
      filas,
      anchos,
      altos,
      columnasOcultas,
      filasOcultas,
      congelado: {
        filas: vista?.state === "frozen" ? Number(vista.ySplit) || 0 : 0,
        columnas: vista?.state === "frozen" ? Number(vista.xSplit) || 0 : 0,
      },
      tieneFormulas,
      oculta: ws.state === "hidden" || ws.state === "veryHidden",
    });
  });

  if (hojas.length === 0) {
    hojas.push({
      nombre: "Hoja1", filas: [[{ texto: "", crudo: "" }]], anchos: [ANCHO_DEFAULT], altos: [ALTO_DEFAULT],
      columnasOcultas: [false], filasOcultas: [false], congelado: { filas: 0, columnas: 0 },
      tieneFormulas: false, oculta: false,
    });
  }
  return hojas;
}

/** "A" → 1, "Z" → 26, "AA" → 27. */
export function letraANumero(letra: string): number {
  let n = 0;
  for (const ch of letra.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** 1 → "A", 27 → "AA" (como Excel). */
export function numeroALetra(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}
