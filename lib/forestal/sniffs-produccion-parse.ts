/**
 * Leer el «Detalle de la programación de producción» del SNIFFS (ADR-397).
 *
 * El operador ya declaró la corrida en el sistema de SERFOR y tiene la
 * pantalla a la vista: N° de lote, fechas, especie, volumen consumido y el
 * «Resumen de Producción por PMF y Producto» (producto · m³ · % aprovechado).
 * Volver a tipear eso en el libro es donde aparecen los volúmenes que después
 * no cuadran con lo declarado. Acá se lee lo que el operador pega —el texto
 * copiado de la tabla, o el texto que el OCR sacó de una captura— y se
 * convierte en filas listas para revisar.
 *
 * Funciones puras, sin DOM ni red: lo que lee el OCR y lo que copia el
 * portapapeles pasan por el MISMO camino, y se prueban con texto.
 *
 * Regla: **nunca se inventa un dato**. Lo que no se lee vuelve `null`; lo que
 * se lee raro se marca `dudoso` y se dice en `avisos`. El operador revisa
 * antes de que nada entre al libro.
 */

import { TIPOS_PRODUCTO_LOCTP, presentacionSugerida } from "./loctp-catalogos";
import type { PaqueteBorrador } from "./produccion-paquetes";

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

export interface ProductoSniffs {
  /** Cómo venía escrito en la pantalla del SNIFFS. */
  productoCrudo: string;
  /** El valor del catálogo LO-CTP que le corresponde; `null` si no se reconoce. */
  productType: string | null;
  volumenM3: number;
  /** El «Porcentaje aprovechado (%)» del SNIFFS, si la fila lo trae. */
  pctAprovechado: number | null;
  /** La especie de ESA fila, si la fila la trae (el resumen la repite por fila). */
  especie: string | null;
  /**
   * El número se leyó sin punto decimal y se reinterpretó (el SNIFFS imprime
   * siempre tres decimales; un OCR flojo se los come). Hay que mirarlo.
   */
  dudoso: boolean;
  /** Lo que decía el texto, tal cual, para poder cotejar el dudoso. */
  volumenLeido: string;
}

export interface DetalleProduccionSniffs {
  /** «N° de Lote», ej. `18-2026`. */
  lote: string | null;
  /** `AAAA-MM-DD`. */
  fechaInicio: string | null;
  fechaFin: string | null;
  /** Nombre común en mayúsculas, como lo escribe el SNIFFS: `TORNILLO`. */
  especieComun: string | null;
  /** `Cedrelinga cateniformis`. */
  especieCientifica: string | null;
  volumenConsumidoM3: number | null;
  productos: ProductoSniffs[];
  /** Lo que no se pudo leer o no cuadra — para decirlo, no para frenar. */
  avisos: string[];
}

/**
 * Lo que se GUARDA en el lote de lo que dijo el SNIFFS (ADR-398): la foto para
 * cotejar después, no el detalle de pantalla. Vive en `ForestLoteAserrio.sniffs`.
 */
export interface SniffsRefLote {
  lote: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  especieCientifica: string | null;
  especieComun: string | null;
  volumenConsumidoM3: number | null;
  productos: {
    productType: string | null;
    productoCrudo: string;
    volumenM3: number;
    pctAprovechado: number | null;
  }[];
  /** ISO de cuándo se leyó. */
  leidoEn: string;
  fuente: "captura" | "texto" | "lista";
}

export function sniffsRefDesdeDetalle(
  d: DetalleProduccionSniffs,
  fuente: SniffsRefLote["fuente"],
  ahora: Date = new Date(),
): SniffsRefLote {
  return {
    lote: d.lote,
    fechaInicio: d.fechaInicio,
    fechaFin: d.fechaFin,
    especieCientifica: d.especieCientifica,
    especieComun: d.especieComun,
    volumenConsumidoM3: d.volumenConsumidoM3,
    productos: d.productos.map((p) => ({
      productType: p.productType,
      productoCrudo: p.productoCrudo,
      volumenM3: r4(p.volumenM3),
      pctAprovechado: p.pctAprovechado,
    })),
    leidoEn: ahora.toISOString(),
    fuente,
  };
}

/** Sin acentos, en mayúsculas, sólo letras/números separados por un espacio. */
export function normalizarTexto(s: string): string {
  return quitarAcentos(s)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function quitarAcentos(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Cómo escribe el SNIFFS lo que el catálogo del LO-CTP escribe distinto. Se
 * aplica sobre el texto normalizado, antes de buscar el producto.
 */
const ALIAS_NORMALIZADOS: [RegExp, string][] = [
  [/\bCEPILLADA\b/g, "CEBILLADA"],
  [/\bPAQUETERIAS?\b/g, "PAQUETERIA"],
];

/** El catálogo, normalizado y del más largo al más corto: «MADERA ASERRADA
 *  (PAQUETERIA CORTA)» tiene que ganarle a «MADERA ASERRADA». */
const CATALOGO = TIPOS_PRODUCTO_LOCTP.map((t) => ({
  valor: t.valor,
  norm: normalizarTexto(t.valor),
  regex: new RegExp(
    normalizarTexto(t.valor)
      .split(" ")
      .map((tok) => tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[^A-Za-z0-9]+"),
    "i",
  ),
})).sort((a, b) => b.norm.length - a.norm.length);

/**
 * El producto del catálogo que nombra un texto, o `null`.
 *
 * `normalizarProductoLoctp("Madera aserrada (paquetería corta)")` →
 * `"MADERA ASERRADA (PAQUETERIA CORTA)"`. Un texto que nombra dos productos
 * devuelve el más largo que contenga: «MADERA ASERRADA (TABLA)» contiene
 * «MADERA ASERRADA» y gana el primero.
 */
export function normalizarProductoLoctp(crudo: string): string | null {
  let norm = normalizarTexto(crudo);
  for (const [re, por] of ALIAS_NORMALIZADOS) norm = norm.replace(re, por);
  const hit = CATALOGO.find((c) => norm.includes(c.norm));
  return hit?.valor ?? null;
}

const NUMERO = /-?\d+(?:[.,]\d+)?/g;
const FECHA = /(\d{1,2})\/(\d{1,2})\/(\d{4})/g;
/**
 * «Cedrelinga cateniformis - TORNILLO». El nombre común son palabras en
 * mayúsculas separadas por UN espacio: ni tab (la celda siguiente del
 * portapapeles) ni salto de línea (el rótulo siguiente del OCR).
 */
const ESPECIE = /([A-Z][a-z]+(?: [a-z]+){1,2}) *- *([A-ZÑ]{2,}(?: [A-ZÑ]{2,})*)/;

function aNumero(s: string): number {
  return Number(s.replace(",", "."));
}

/**
 * Un volumen leído, con la corrección del punto perdido.
 *
 * El SNIFFS imprime los m³ con tres decimales (`9.753`). Un OCR sin
 * ampliación lee `9753`. Un producto de 9753 m³ no existe en un lote, así que
 * si el número no trae separador y tiene cuatro o más dígitos se toma como
 * milésimas — y se MARCA: la reinterpretación es la hipótesis, no el dato.
 */
function volumenLeido(crudo: string): { valor: number; dudoso: boolean } {
  const sinSeparador = !/[.,]/.test(crudo);
  const n = aNumero(crudo);
  if (sinSeparador && crudo.replace(/^-/, "").length >= 4) {
    return { valor: r4(n / 1000), dudoso: true };
  }
  return { valor: n, dudoso: false };
}

function filaProducto(linea: string): ProductoSniffs | null {
  const plano = quitarAcentos(linea);
  let norm = normalizarTexto(plano);
  for (const [re, por] of ALIAS_NORMALIZADOS) norm = norm.replace(re, por);
  const cat = CATALOGO.find((c) => norm.includes(c.norm));
  /* Una fila sin producto del catálogo no es una fila de producción: puede ser
     el encabezado, el título del cuadro o basura del OCR. */
  if (!cat) return null;
  const m = cat.regex.exec(plano.replace(/CEPILLADA/gi, "CEBILLADA"));
  if (!m) return null;
  const antes = plano.slice(0, m.index);
  /**
   * El paréntesis que cierra.
   *
   * La regex se arma de los TOKENS del catálogo unidos por separadores, así que
   * termina en la última letra: «MADERA ASERRADA (PAQUETERIA CORTA)» matcheaba
   * sin su `)` y lo leído se mostraba mutilado. Se recupera el cierre cuando el
   * match dejó un paréntesis abierto.
   */
  const cierra =
    (m[0].match(/\(/g)?.length ?? 0) > (m[0].match(/\)/g)?.length ?? 0) &&
    plano[m.index + m[0].length] === ")";
  const largo = m[0].length + (cierra ? 1 : 0);
  const crudo = plano.slice(m.index, m.index + largo).trim();
  const despues = plano.slice(m.index + largo);
  const numeros = despues.match(NUMERO) ?? [];
  const primero = numeros[0];
  const segundo = numeros[1];
  if (!primero) return null;
  const vol = volumenLeido(primero);
  const esp = ESPECIE.exec(antes);
  return {
    productoCrudo: crudo,
    productType: cat.valor,
    volumenM3: vol.valor,
    pctAprovechado: segundo != null ? aNumero(segundo) : null,
    especie: esp ? esp[2].trim() : null,
    dudoso: vol.dudoso,
    volumenLeido: primero,
  };
}

function aIso(d: string, m: string, a: string): string | null {
  const dia = Number(d);
  const mes = Number(m);
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  return `${a}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Interpreta el texto de la pantalla «Detalle de la programación de producción».
 *
 * Acepta las dos formas en que llega: el texto copiado (celdas separadas por
 * tabulaciones) y el texto que sacó un OCR de una captura (todo separado por
 * espacios, con los rótulos del encabezado en una línea y sus valores en la
 * siguiente). No hace falta que venga la pantalla entera: con la tabla alcanza
 * para los productos, y el encabezado sólo agrega lo que sirve para cotejar.
 */
export function interpretarDetalleProduccionSniffs(
  texto: string,
  opts: {
    /** Lo que ESTE lote consumió, para detectar un volumen leído sin punto. */
    consumidoM3?: number | null;
  } = {},
): DetalleProduccionSniffs {
  const plano = quitarAcentos(texto ?? "").replace(/\r/g, "");
  const avisos: string[] = [];

  // ── Encabezado ──
  let lote: string | null = null;
  const labelLote = /N\W{0,3}\s*de\s*Lote/i.exec(plano);
  if (labelLote) {
    const tramo = plano.slice(labelLote.index + labelLote[0].length, labelLote.index + labelLote[0].length + 160);
    const token = tramo
      .split(/[\s:]+/)
      .filter(Boolean)
      .find((t) => /\d/.test(t) && !/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(t));
    lote = token ?? null;
  }

  const cabecera = plano.split(/Resumen\s+de\s+Producci/i)[0] ?? plano;
  const fechas = [...cabecera.matchAll(FECHA)].map((m) => aIso(m[1], m[2], m[3])).filter(Boolean) as string[];
  const fechaInicio = fechas[0] ?? null;
  const fechaFin = fechas[1] ?? null;

  let volumenConsumidoM3: number | null = null;
  const vc = /Volumen\s*consumido\s*:?\s*(-?\d+(?:[.,]\d+)?)/i.exec(plano);
  if (vc) {
    const v = volumenLeido(vc[1]);
    volumenConsumidoM3 = v.valor;
    if (v.dudoso) avisos.push(`Leí «${vc[1]}» como volumen consumido, sin punto decimal: lo tomé como ${v.valor} m³. Revisalo.`);
  }

  // ── Filas de producto ──
  const productos: ProductoSniffs[] = [];
  for (const linea of plano.split("\n")) {
    const fila = filaProducto(linea);
    if (fila) productos.push(fila);
  }

  /**
   * La especie: del encabezado si se leyó; si no, la de la primera fila. En
   * una fila el OCR separa con espacios y el nombre común se pegaría al
   * producto («TORNILLO MADERA ASERRADA»); `filaProducto` ya la corta donde
   * empieza el producto, así que ese dato es más confiable que una regex
   * sobre el texto entero.
   */
  const esp = ESPECIE.exec(cabecera);
  /* Sin encabezado, el nombre científico sale de la primera fila que lo traiga:
     esa parte de la regex no se contamina con lo que sigue. */
  const espFila = !esp && productos.length > 0 ? ESPECIE.exec(plano) : null;
  const especieCientifica = esp?.[1].trim() ?? espFila?.[1].trim() ?? null;
  const especieComun = esp?.[2].trim() ?? productos[0]?.especie ?? null;

  const referencia = opts.consumidoM3 ?? volumenConsumidoM3;
  for (const p of productos) {
    if (p.dudoso) {
      avisos.push(`«${p.productoCrudo}»: leí «${p.volumenLeido}» sin punto decimal y lo tomé como ${p.volumenM3} m³. Revisalo.`);
    } else if (referencia != null && referencia > 0 && p.volumenM3 > referencia) {
      /* Más producto que materia prima no existe: o el OCR leyó mal o la
         captura es de otro lote. Se marca, no se corrige. */
      p.dudoso = true;
      avisos.push(`«${p.productoCrudo}» dice ${p.volumenM3} m³, más que los ${referencia} m³ consumidos: revisá el número.`);
    }
  }

  if (productos.length === 0) {
    avisos.push(
      "No encontré filas de producto. Pegá la tabla «Resumen de Producción por PMF y Producto» completa, con la columna de producto y la de volumen.",
    );
  }

  return { lote, fechaInicio, fechaFin, especieComun, especieCientifica, volumenConsumidoM3, productos, avisos };
}

/**
 * ¿El texto pegado parece esta pantalla del SNIFFS?
 *
 * Para decidir si un Ctrl+V con texto se interpreta o se deja pasar: pegar
 * «Tornillo» en una observación no tiene que disparar una importación.
 */
export function pareceDetalleSniffs(texto: string): boolean {
  const norm = normalizarTexto(texto ?? "");
  if (norm.length < 20) return false;
  return (
    /RESUMEN DE PRODUCCION/.test(norm) ||
    /PORCENTAJE APROVECHADO/.test(norm) ||
    /PROGRAMACION DE PRODUCCION/.test(norm) ||
    CATALOGO.some((c) => c.norm.length > 16 && norm.includes(c.norm))
  );
}

/** Misma especie aunque una venga en mayúsculas o con acento. */
export function mismaEspecie(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return true;
  const na = normalizarTexto(a);
  const nb = normalizarTexto(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

/**
 * Las filas revisadas → paquetes del borrador, uno por producto.
 *
 * El resumen del SNIFFS es por PRODUCTO, no por atado: no trae cantidad de
 * piezas ni medidas. Cada fila entra como un paquete con su volumen y
 * `cantidad: 0` — lo honesto es no inventar piezas. La presentación sale del
 * producto, como cuando se elige a mano.
 */
export function paquetesDesdeSniffs(
  filas: readonly { productType: string; volumenM3: number }[],
  opts: {
    /** El próximo código libre de la serie, esquivando los ya repartidos acá. */
    siguienteCodigo: (ocupados: readonly string[]) => string;
    lote?: string | null;
    /** Semilla de los ids locales; por defecto `Date.now()`. */
    ahora?: number;
  },
): PaqueteBorrador[] {
  const ahora = opts.ahora ?? Date.now();
  const ocupados: string[] = [];
  const observations = `Traído del SNIFFS${opts.lote ? ` · lote ${opts.lote}` : ""}`;
  return filas
    .filter((f) => f.productType && f.volumenM3 > 0)
    .map((f, i) => {
      const codigo = opts.siguienteCodigo(ocupados);
      ocupados.push(codigo);
      return {
        id: `sniffs-${ahora}-${i}`,
        codigo,
        productType: f.productType,
        presentacion: presentacionSugerida(f.productType) ?? "PAQUETES",
        cantidad: 0,
        volumenM3: r4(f.volumenM3),
        espesorCm: null,
        anchoCm: null,
        largoM: null,
        observations,
      };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// La LISTA de programaciones del SNIFFS (ADR-398): una fila por lote programado
// ─────────────────────────────────────────────────────────────────────────────

/** Una fila de la lista «Programación de producción» del SNIFFS. */
export interface ProgramacionSniffs {
  lote: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  especieCientifica: string | null;
  especieComun: string | null;
  /** Si la lista lo trae; muchas veces sólo está en el detalle. */
  volumenConsumidoM3: number | null;
  /** «Finalizado por fecha límite», «En proceso»… tal como lo escribe el SNIFFS. */
  estado: string | null;
  /** La línea tal cual, para cotejar lo leído. */
  crudo: string;
}

const ESTADO_SNIFFS = /(finalizad[oa][^\t\n]*|en\s+proceso|registrad[oa]|anulad[oa]|vigente|cerrad[oa]|pendiente)/i;
/** Un decimal que no es parte de una fecha ni de un código con guión. */
const DECIMAL_SUELTO = /(?<![\d/\-])\d{1,6}[.,]\d{1,4}(?![\d/\-])/g;
/** `FECHA` sin la bandera global: para preguntar «¿hay una fecha?» sin arrastrar `lastIndex`. */
const HAY_FECHA = /\d{1,2}\/\d{1,2}\/\d{4}/;

function filaProgramacion(linea: string): ProgramacionSniffs | null {
  const plano = quitarAcentos(linea).trim();
  if (!plano) return null;
  /* El encabezado de la tabla nombra las columnas, no una programación. */
  if (/Fecha\s*Inicio|Fecha\s*Fin|N\W{0,3}\s*(de\s*)?Lote/i.test(plano) && !HAY_FECHA.test(plano)) return null;
  const fechas = [...plano.matchAll(FECHA)];
  const esp = ESPECIE.exec(plano);
  if (fechas.length === 0 && !esp) return null;

  const fechaInicio = fechas[0] ? aIso(fechas[0][1], fechas[0][2], fechas[0][3]) : null;
  const fechaFin = fechas[1] ? aIso(fechas[1][1], fechas[1][2], fechas[1][3]) : null;

  /* El N° de lote: el primer token con un dígito que aparece ANTES de la
     primera fecha y no es un número decimal ni una fecha. */
  const hastaFecha = fechas[0] ? plano.slice(0, fechas[0].index) : plano.slice(0, esp?.index ?? plano.length);
  const lote =
    hastaFecha
      .split(/[\s:|]+/)
      .filter(Boolean)
      .find((t) => /\d/.test(t) && !/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(t) && !/^\d+[.,]\d+$/.test(t) && t.length <= 24) ??
    null;

  const despuesDeFechas = fechas[1] ? plano.slice(fechas[1].index + fechas[1][0].length) : fechas[0] ? plano.slice(fechas[0].index + fechas[0][0].length) : plano;
  const decimales = despuesDeFechas.match(DECIMAL_SUELTO) ?? [];
  const volumenConsumidoM3 = decimales[0] != null ? aNumero(decimales[0]) : null;
  const estado = ESTADO_SNIFFS.exec(plano)?.[1]?.trim() ?? null;

  return {
    lote,
    fechaInicio,
    fechaFin,
    especieCientifica: esp ? esp[1].trim() : null,
    especieComun: esp ? esp[2].trim() : null,
    volumenConsumidoM3,
    estado,
    crudo: linea.trim(),
  };
}

/**
 * Interpreta la lista de programaciones (la tabla de fondo del SNIFFS, con una
 * fila por lote): N° de lote, inicio, fin, especie y —si la columna existe—
 * volumen consumido y estado. Acepta el texto copiado (tabs) o el OCR de una
 * captura (espacios).
 */
export function interpretarListaProgramacionesSniffs(texto: string): { filas: ProgramacionSniffs[]; avisos: string[] } {
  const filas: ProgramacionSniffs[] = [];
  for (const linea of (texto ?? "").replace(/\r/g, "").split("\n")) {
    const f = filaProgramacion(linea);
    if (f) filas.push(f);
  }
  const avisos: string[] = [];
  if (filas.length === 0) avisos.push("No encontré filas con fecha y especie. Pegá la lista de programaciones del SNIFFS (una fila por lote).");
  const sinLote = filas.filter((f) => !f.lote).length;
  if (sinLote > 0) avisos.push(`${sinLote} fila(s) sin N° de lote: se les asigna el correlativo automático si las importás.`);
  const sinVolumen = filas.filter((f) => f.volumenConsumidoM3 == null).length;
  if (sinVolumen > 0) avisos.push(`${sinVolumen} fila(s) sin volumen consumido: completalo antes de importar.`);
  return { filas, avisos };
}

/**
 * ¿El texto pegado parece la lista de programaciones?
 *
 * `minimoFilas` es la diferencia entre las dos puertas y no un detalle: en el
 * Ctrl+V global hacen falta DOS filas con fecha para no confundir cualquier
 * texto con una lista, pero DENTRO del modal de importación el operador ya dijo
 * qué está pegando — exigirle dos programaciones para poder traer una sola era
 * un candado sin motivo.
 */
export function pareceListaProgramaciones(texto: string, minimoFilas = 2): boolean {
  return (texto ?? "").split("\n").filter((l) => HAY_FECHA.test(l)).length >= minimoFilas;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lo que devuelve el modelo de visión (ADR-398), a la misma forma que el parser
// ─────────────────────────────────────────────────────────────────────────────

/** El JSON de `/api/admin/forestal/sniffs-ocr`, ya validado por su Zod. */
export interface DetalleSniffsDeIA {
  lote: string;
  fechaInicio: string;
  fechaFin: string;
  especieCientifica: string;
  especieComun: string;
  volumenConsumidoM3: number;
  productos: { producto: string; volumenM3: number; pctAprovechado: number }[];
  advertencia: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lo que leyó el modelo, con la MISMA forma que lo que lee el parser local.
 *
 * Así la tabla de revisión, los cotejos y el guardado son los mismos vengan de
 * donde vengan las filas: una segunda forma de representar lo mismo es una
 * segunda forma de que un volumen salga distinto.
 *
 * El producto se vuelve a mapear contra el catálogo del LO-CTP acá y no se
 * confía en el nombre que devolvió el modelo: el catálogo es de SERFOR, no del
 * que lo transcribe.
 */
export function detalleDesdeIA(
  crudo: DetalleSniffsDeIA,
  opts: { consumidoM3?: number | null } = {},
): DetalleProduccionSniffs {
  const avisos: string[] = [];
  if (crudo.advertencia?.trim()) avisos.push(crudo.advertencia.trim());

  const referencia = opts.consumidoM3 ?? (crudo.volumenConsumidoM3 > 0 ? crudo.volumenConsumidoM3 : null);
  const productos: ProductoSniffs[] = (crudo.productos ?? [])
    .filter((p) => (p.producto ?? "").trim() || p.volumenM3 > 0)
    .map((p) => {
      const productType = normalizarProductoLoctp(p.producto ?? "");
      const volumenM3 = r4(Number(p.volumenM3) || 0);
      /* El mismo cotejo que el parser local: más producto que materia prima se
         MARCA, no se corrige. Que lo haya leído un modelo no lo hace más cierto. */
      const dudoso = referencia != null && referencia > 0 && volumenM3 > referencia;
      if (!productType && (p.producto ?? "").trim()) {
        avisos.push(`«${p.producto}» no está en el catálogo del LO-CTP: elegí el producto a mano.`);
      }
      if (dudoso) {
        avisos.push(`«${p.producto}» dice ${volumenM3} m³, más que los ${referencia} m³ consumidos: revisá el número.`);
      }
      return {
        productoCrudo: (p.producto ?? "").trim() || "—",
        productType,
        volumenM3,
        pctAprovechado: Number.isFinite(p.pctAprovechado) ? p.pctAprovechado : null,
        especie: crudo.especieComun?.trim() || null,
        dudoso,
        volumenLeido: String(p.volumenM3 ?? ""),
      };
    });

  if (productos.length === 0 && !crudo.advertencia?.trim()) {
    avisos.push("El modelo no encontró filas de producto en la foto.");
  }

  return {
    lote: crudo.lote?.trim() || null,
    fechaInicio: ISO.test(crudo.fechaInicio ?? "") ? crudo.fechaInicio : null,
    fechaFin: ISO.test(crudo.fechaFin ?? "") ? crudo.fechaFin : null,
    especieComun: crudo.especieComun?.trim() || null,
    especieCientifica: crudo.especieCientifica?.trim() || null,
    volumenConsumidoM3: crudo.volumenConsumidoM3 > 0 ? r4(crudo.volumenConsumidoM3) : null,
    productos,
    avisos,
  };
}
