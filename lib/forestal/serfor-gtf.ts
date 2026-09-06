/**
 * serfor-gtf.ts — consulta pública de Guías de Transporte Forestal del SNIFFS.
 *
 * SERFOR publica "Consulta y Seguimiento de Guías Registradas" dentro del Módulo
 * de Control (el mismo lugar de donde se descarga el aplicativo ER-GTF). Es la
 * consulta que hay detrás del **código QR impreso en la GTF**: sin login, sin
 * captcha, con un solo dato — el "Número de Registro de GTF".
 *
 * ⚠️ Gotcha que costó tres intentos: llamar a `consultarGtf.do` con SÓLO
 * `nuRegistroGuia` devuelve **HTTP 500 (NullPointerException)**. El formulario
 * agrega por JavaScript otros dos parámetros, y sin ellos el servlet explota:
 *
 *     consultarGtf.do?nuRegistroGuia=<n>&tipoBusqueda=GTF&tipoSeguimiento=MAP
 *
 * Con los tres responde 200 — incluso cuando la guía no existe, en cuyo caso
 * devuelve un `alert-danger` explicando que el QR no está en su base.
 *
 * PURO: acá no se hace fetch. La lib arma la URL y entiende la respuesta; el
 * endpoint (`app/api/admin/forestal/gtf/serfor`) es el único que sale a la red,
 * con su timeout y su rate limit.
 */

/** Base de la consulta pública (Módulo de Control del SNIFFS). */
export const SERFOR_GTF_CONSULTA = "https://sniffs.serfor.gob.pe/control/gtf/consultas/consultarGtf.do";

/** La página del formulario — sirve de `Referer` y para abrirla en una pestaña. */
export const SERFOR_GTF_FORM = "https://sniffs.serfor.gob.pe/control/gtf/consultas.do";

export type EstadoConsultaGtf = "encontrada" | "no_encontrada" | "sin_respuesta";

export interface ProductoGtf {
  cientifico: string | null;
  comun: string | null;
  tipoProducto: string | null;
  presentacion: string | null;
  cantidad: number | null;
  unidad: string | null;
  volumen: number | null;
}

export interface TrozaGtf extends ProductoGtf {
  codificacion: string | null;
  dimensiones: string | null;
}

/**
 * La guía como la publica SERFOR. Los nombres siguen al formato oficial (los
 * casilleros numerados del papel) para que llenar el ingreso y armar el PDF sean
 * el mismo dato, no dos interpretaciones.
 */
export interface GtfSerfor {
  /** N° de constancia de registro: el que se consulta (`1-19-0313629`). */
  numeroRegistro: string;
  /** (1) N° de la guía impresa: `019-0000003`. */
  gtfNumber: string | null;
  /** "Activa", "Anulada"… tal como lo dice SERFOR. */
  estado: string | null;
  registradoPor: string | null;
  fechaRegistro: string | null;
  /** (3) y (4) del formato. */
  fechaExpedicion: string | null;
  fechaVencimiento: string | null;

  // ── Titular (casilleros 5 a 12) ──
  /** (5) Concesión · Permiso · Autorización · Plantación… */
  origenRecurso: string | null;
  /** (6) N° del título habilitante. */
  numeroTitulo: string | null;
  titular: string | null;
  direccionTitular: string | null;
  /** (8) N° de resolución que aprueba el plan de manejo. */
  numeroResolucion: string | null;
  representanteLegal: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  rucInstancia: string | null;
  instanciaRegistra: string | null;

  // ── Propietario del producto (13 a 21) ──
  propietario: string | null;
  propietarioDoc: string | null;
  propietarioDireccion: string | null;
  propietarioDepartamento: string | null;
  propietarioProvincia: string | null;
  propietarioDistrito: string | null;

  // ── Destinatario (22 a 28) ──
  destinatario: string | null;
  destinatarioDoc: string | null;
  destinatarioDireccion: string | null;
  destinatarioDepartamento: string | null;
  destinatarioProvincia: string | null;
  destinatarioDistrito: string | null;

  // ── Transportista (29 a 34) ──
  transportista: string | null;
  transportistaDni: string | null;
  licenciaConducir: string | null;
  guiaRemision: string | null;
  tipoTransporte: string | null;
  tipoVehiculo: string | null;
  placa: string | null;

  /** (35) Lista de trozas / productos transformados. */
  listaTrozas: string | null;
  /** (37) Detalle del producto. */
  productos: ProductoGtf[];
  /** Lista de trozas con su codificación y dimensiones, si la guía la trae. */
  trozas: TrozaGtf[];
  /** Suma declarada por SERFOR (no se recalcula: es lo que dice el documento). */
  volumenTotal: number | null;
  /** Todo lo que publicó SERFOR, por si una etiqueta nueva no está mapeada. */
  campos: Record<string, string>;
}

export interface ResultadoConsultaGtf {
  estado: EstadoConsultaGtf;
  /** Lo que SERFOR dice cuando no hay datos, en sus palabras. */
  mensaje: string | null;
  gtf: GtfSerfor | null;
}

/**
 * Los dos modos de la consulta pública, tomados de los campos ocultos del propio
 * formulario: "Detalle de GTF" manda `GTF` y "Seguimiento de GTF" manda `SEG`.
 * Una guía puede figurar en uno y no en el otro, así que se prueban los dos.
 */
export type ModoConsultaGtf = "GTF" | "SEG";

/** URL completa de la consulta, con los tres parámetros que el servlet exige. */
export function urlConsultaGtf(numeroRegistro: string, modo: ModoConsultaGtf = "GTF"): string {
  const n = numeroRegistro.trim();
  const p = new URLSearchParams({ nuRegistroGuia: n, tipoBusqueda: modo, tipoSeguimiento: "MAP" });
  return `${SERFOR_GTF_CONSULTA}?${p.toString()}`;
}

/** Combinaciones a intentar: cada escritura del número × cada modo. */
export function intentosConsulta(v: string): { numero: string; modo: ModoConsultaGtf }[] {
  const modos: ModoConsultaGtf[] = ["GTF", "SEG"];
  return variantesNumeroRegistro(v).flatMap((numero) => modos.map((modo) => ({ numero, modo })));
}

/**
 * El número de registro LLEVA GUIONES y hay que mandarlo tal cual.
 *
 * Formato del manual del ER-GTF: `tipo-región-correlativo` — `2-17-0002328`,
 * `1-25-0002326`. Es "el número único que le asigna el sistema a cada GTF
 * registrada o emitida por el MC SNIFFS", y NO es el N° de GTF impreso
 * (`001-0100024`), que es otra columna.
 *
 * ⚠️ La primera versión de esto limpiaba los guiones y mandaba `2170002328`:
 * SERFOR respondía "no se encontraron datos" para guías que SÍ existían. Sólo se
 * recortan espacios; los separadores viajan como el operador los ve impresos.
 */
export function normalizarNumeroRegistro(v: string): string {
  return v.trim().replace(/\s+/g, "");
}

/** Variantes a intentar con el mismo número, en orden. Nunca inventa números:
 *  son escrituras distintas del que tipeó el operador (con y sin guiones). */
export function variantesNumeroRegistro(v: string): string[] {
  const base = normalizarNumeroRegistro(v);
  const sinGuiones = base.replace(/[-.]/g, "");
  return [...new Set([base, sinGuiones].filter(Boolean))];
}

export function esNumeroRegistroValido(v: string): boolean {
  const n = normalizarNumeroRegistro(v);
  // Dígitos y guiones, 4 a 20 caracteres: cubre `2-17-0002328` y variantes
  // regionales sin exigir una forma exacta que después rechace un número válido.
  return /^[\d-]{4,20}$/.test(n) && /\d{3,}/.test(n);
}

// ── Parseo de la respuesta ──────────────────────────────────────────────────

const sinTags = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é").replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó").replace(/&uacute;/gi, "ú").replace(/&ntilde;/gi, "ñ")
    .replace(/\s+/g, " ")
    .trim();

const sinTildes = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[°º:.]/g, "").replace(/\s+/g, " ").trim();

/**
 * La ficha de SERFOR es una grilla de "panels" de Bootstrap: cada dato es un
 * `panel-heading` (la etiqueta) seguido de un `panel-body` (el valor). Verificado
 * contra una guía real el 2026-07-30.
 */
function extraerPanels(html: string): Record<string, string> {
  const campos: Record<string, string> = {};
  const re = /<div[^>]*class="[^"]*panel-heading[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class="[^"]*panel-body[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  for (const m of html.matchAll(re)) {
    const k = sinTags(m[1] ?? "").replace(/:$/, "").trim();
    const v = sinTags(m[2] ?? "").trim();
    if (k && v && !campos[k]) campos[k] = v;
  }
  return campos;
}

/** Busca un valor por cualquiera de sus etiquetas posibles, sin tildes ni case. */
export function tomar(campos: Record<string, string>, ...etiquetas: string[]): string | null {
  const buscadas = etiquetas.map(sinTildes);
  for (const [k, v] of Object.entries(campos)) {
    const norm = sinTildes(k);
    if (buscadas.some((b) => norm === b)) return v || null;
  }
  // Segunda pasada, más laxa: la etiqueta contiene lo buscado.
  for (const [k, v] of Object.entries(campos)) {
    const norm = sinTildes(k);
    if (buscadas.some((b) => norm.includes(b))) return v || null;
  }
  return null;
}

const aNumero = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const n = Number(String(v).replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Filas de una tabla cuyo encabezado contenga las columnas pedidas. */
function tablaPorEncabezados(html: string, requeridos: string[]): { encabezados: string[]; filas: string[][] } | null {
  for (const tabla of html.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
    const filas = tabla.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    const cabecera = filas[0];
    if (!cabecera || filas.length < 2) continue;
    const encabezados = (cabecera.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []).map((c) => sinTildes(sinTags(c)));
    if (!requeridos.every((r) => encabezados.some((h) => h.includes(r)))) continue;
    const cuerpo = filas.slice(1).map((f) => (f.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []).map((c) => sinTags(c)));
    return { encabezados, filas: cuerpo.filter((f) => f.some((c) => c)) };
  }
  return null;
}

const idx = (encabezados: string[], ...claves: string[]) =>
  encabezados.findIndex((h) => claves.some((c) => h.includes(c)));

function extraerProductos(html: string): ProductoGtf[] {
  const t = tablaPorEncabezados(html, ["nombre cientifico", "volumen"]);
  if (!t) return [];
  const iCien = idx(t.encabezados, "cientific");
  const iComun = idx(t.encabezados, "comun");
  const iTipo = idx(t.encabezados, "tipo de producto");
  const iPres = idx(t.encabezados, "presentacion");
  const iCant = idx(t.encabezados, "cantidad");
  const iUnid = idx(t.encabezados, "unidad");
  const iVol = idx(t.encabezados, "volumen");
  // La fila del total no es un producto.
  return t.filas
    .filter((f) => !/total/i.test(f[0] ?? "") && (f[iCien] || f[iComun]))
    .map((f) => ({
      cientifico: iCien >= 0 ? f[iCien] || null : null,
      comun: iComun >= 0 ? f[iComun] || null : null,
      tipoProducto: iTipo >= 0 ? f[iTipo] || null : null,
      presentacion: iPres >= 0 ? f[iPres] || null : null,
      cantidad: iCant >= 0 ? aNumero(f[iCant]) : null,
      unidad: iUnid >= 0 ? f[iUnid] || null : null,
      volumen: iVol >= 0 ? aNumero(f[iVol]) : null,
    }));
}

function extraerTrozas(html: string): TrozaGtf[] {
  const t = tablaPorEncabezados(html, ["codificacion"]);
  if (!t) return [];
  const iCien = idx(t.encabezados, "cientific");
  const iComun = idx(t.encabezados, "comun");
  const iTipo = idx(t.encabezados, "tipo de producto");
  const iPres = idx(t.encabezados, "presentacion");
  const iCod = idx(t.encabezados, "codificacion");
  const iDim = idx(t.encabezados, "dimension");
  const iCant = idx(t.encabezados, "cantidad");
  const iUnid = idx(t.encabezados, "unidad");
  const iVol = idx(t.encabezados, "volumen");
  return t.filas
    .filter((f) => !/total/i.test(f[0] ?? "") && (f[iCod] || f[iCien]))
    .map((f) => ({
      cientifico: iCien >= 0 ? f[iCien] || null : null,
      comun: iComun >= 0 ? f[iComun] || null : null,
      tipoProducto: iTipo >= 0 ? f[iTipo] || null : null,
      presentacion: iPres >= 0 ? f[iPres] || null : null,
      codificacion: iCod >= 0 ? f[iCod] || null : null,
      dimensiones: iDim >= 0 ? f[iDim] || null : null,
      cantidad: iCant >= 0 ? aNumero(f[iCant]) : null,
      unidad: iUnid >= 0 ? f[iUnid] || null : null,
      volumen: iVol >= 0 ? aNumero(f[iVol]) : null,
    }));
}

/** "TOTAL VOLUMEN: 13.939" — se toma el declarado, no se recalcula. */
function extraerVolumenTotal(html: string): number | null {
  const m = sinTags(html).match(/total\s*volumen\s*:?\s*([\d.,]+)/i);
  return m ? aNumero(m[1]) : null;
}

/**
 * Entiende la respuesta del servlet.
 *
 * "No encontrada" NO es un error del lado nuestro: significa que ese número no
 * está en la base de SERFOR (guía en papel sin sincronizar, número mal tipeado o
 * guía de una ARFFS que todavía no subió su talonario). Se distingue de "sin
 * respuesta" —que sí es un problema de conexión o del servicio— porque lo que el
 * operador tiene que hacer es distinto en cada caso.
 */
export function parsearConsultaGtf(html: string, numeroRegistro: string): ResultadoConsultaGtf {
  if (!html || html.trim().length === 0) {
    return { estado: "sin_respuesta", mensaje: "El servicio de SERFOR no devolvió contenido.", gtf: null };
  }
  const texto = sinTags(html);
  const noHayDatos =
    /alert-danger/i.test(html) ||
    /no se encontraron datos/i.test(texto) ||
    /no existe en nuestra base/i.test(texto);
  if (noHayDatos) {
    const m = texto.match(/No se encontraron datos\.?([\s\S]{0,240})/i);
    return {
      estado: "no_encontrada",
      mensaje: (m?.[0] ?? "SERFOR no encontró esa guía.").replace(/\s+/g, " ").trim(),
      gtf: null,
    };
  }

  const campos = extraerPanels(html);
  if (Object.keys(campos).length === 0) {
    return {
      estado: "sin_respuesta",
      mensaje: "SERFOR respondió, pero no se reconoció ningún dato en la página.",
      gtf: null,
    };
  }

  // Las secciones repiten etiquetas ("Dirección", "Departamento"…) para titular,
  // propietario y destinatario. Se parten por sus títulos para no cruzarlas.
  const bloque = (desde: string, hasta: string): Record<string, string> => {
    const i = html.search(new RegExp(desde, "i"));
    if (i === -1) return {};
    // El título de sección vive DENTRO de un `panel-heading`: si se corta justo
    // ahí, el `<div>` que lo abre queda afuera y el par heading/body deja de
    // reconocerse — el nombre del propietario salía null. Se retrocede hasta la
    // apertura del panel.
    const inicio = Math.max(0, html.lastIndexOf("<div", i));
    const j = html.slice(inicio).search(new RegExp(hasta, "i"));
    return extraerPanels(html.slice(inicio, j > 0 ? inicio + j : undefined));
  };
  const bTitular = bloque("DATOS DEL REGISTRO", "PROPIETARIO DEL PRODUCTO");
  const bPropietario = bloque("PROPIETARIO DEL PRODUCTO", "DESTINATARIO");
  const bDestinatario = bloque("DESTINATARIO", "TRANSPORTISTA");
  const bTransporte = bloque("TRANSPORTISTA", "DETALLE DEL PRODUCTO");

  const gtf: GtfSerfor = {
    numeroRegistro: tomar(campos, "N° DE CONSTANCIA DE REGISTRO", "constancia de registro") ?? numeroRegistro,
    gtfNumber: tomar(campos, "GUIA DE TRANSPORTE N°", "guia de transporte n"),
    estado: tomar(campos, "Estado de la GTF"),
    registradoPor: tomar(campos, "Registrado por"),
    fechaRegistro: tomar(campos, "Fecha de Registro"),
    fechaExpedicion: tomar(campos, "Fecha de Expedición", "fecha de expedicion"),
    fechaVencimiento: tomar(campos, "Fecha de Vencimiento"),

    origenRecurso: tomar(campos, "Origen del Recurso"),
    numeroTitulo: tomar(bTitular, "Numero", "número"),
    titular: tomar(campos, "Nombre del titular"),
    direccionTitular: tomar(campos, "Dirección del titular", "direccion del titular"),
    numeroResolucion: tomar(campos, "N° de Resolucion", "n de resolucion"),
    representanteLegal: tomar(campos, "Representante Legal"),
    departamento: tomar(bTitular, "Departamento"),
    provincia: tomar(bTitular, "Provincia"),
    distrito: tomar(bTitular, "Distrito"),
    rucInstancia: tomar(campos, "RUC de la Instancia que Registra"),
    instanciaRegistra: tomar(campos, "Instancia que Registra"),

    propietario: tomar(bPropietario, "PROPIETARIO DEL PRODUCTO"),
    propietarioDoc: tomar(bPropietario, "N° RUC/DNI", "n ruc/dni"),
    propietarioDireccion: tomar(bPropietario, "Dirección", "direccion"),
    propietarioDepartamento: tomar(bPropietario, "Departamento"),
    propietarioProvincia: tomar(bPropietario, "Provincia"),
    propietarioDistrito: tomar(bPropietario, "Distrito"),

    destinatario: tomar(bDestinatario, "DESTINATARIO"),
    destinatarioDoc: tomar(bDestinatario, "N° RUC/DNI", "n ruc/dni"),
    destinatarioDireccion: tomar(bDestinatario, "Dirección", "direccion"),
    destinatarioDepartamento: tomar(bDestinatario, "Departamento"),
    destinatarioProvincia: tomar(bDestinatario, "Provincia"),
    destinatarioDistrito: tomar(bDestinatario, "Distrito"),

    transportista: tomar(bTransporte, "TRANSPORTISTA"),
    transportistaDni: tomar(bTransporte, "N° DNI", "n dni"),
    licenciaConducir: tomar(bTransporte, "N° de Licencia", "n de licencia"),
    guiaRemision: tomar(bTransporte, "Guia Remisión", "guia remision"),
    tipoTransporte: tomar(bTransporte, "Tipo de Transporte"),
    tipoVehiculo: tomar(bTransporte, "Tipo Vehiculo", "tipo vehiculo"),
    placa: tomar(bTransporte, "N° Placa Vehiculo", "n placa vehiculo", "placa"),

    listaTrozas: tomar(campos, "Lista de Trozas / Productos Transformados", "lista de trozas"),
    productos: extraerProductos(html),
    trozas: extraerTrozas(html),
    volumenTotal: extraerVolumenTotal(html),
    campos,
  };

  return { estado: "encontrada", mensaje: null, gtf };
}
