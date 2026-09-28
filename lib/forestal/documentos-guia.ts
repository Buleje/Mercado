/**
 * Documentos de una guía de ingreso (Libro CTP, ADR-438) — lógica PURA.
 *
 * Los archivos NO viven en un sistema aparte: son documentos del Drive del
 * tenant (`Document`, bucket privado `documents`), en la carpeta de las guías
 * por año/mes. Lo que los ata a su guía y a su casillero son dos etiquetas de
 * máquina que pone el servidor al subir:
 *
 *   `gtf:<N° de guía>`       → de qué guía es
 *   `casillero:<clave>`      → en qué casillero va
 *
 * Por qué etiquetas y no una tabla nueva: el Drive ya da miniatura, lectura
 * con IA, búsqueda, papelera (baja lógica que se recupera), auditoría de quién
 * subió/vio/quitó y permisos por rol. Una tabla puente repetía todo eso para
 * guardar dos textos. Y al revés también sirve: una factura que YA estaba en el
 * Drive entra a su casillero poniéndole esas dos etiquetas.
 *
 * Legado: antes de ADR-438, «Guardar en el expediente» del «Documento de la
 * guía» archivaba la GTF y la lista de trozas con `["forestal", "GTF" | "lista
 * de trozas", <N°>, …]`. Se reconocen igual (medido el 26-09: 3 GTF + 1 lista en
 * main, 1 + 2 en Blas) para que el casillero no aparezca vacío con el papel ya
 * guardado.
 */

export const CASILLEROS_GUIA = [
  { clave: "factura", label: "Factura", hint: "La factura o boleta de la madera" },
  {
    clave: "guia_remitente",
    label: "Guía de remisión del remitente",
    hint: "La que emite quien vende o manda la madera",
  },
  {
    clave: "guia_transportista",
    label: "Guía del transportista",
    hint: "La que emite el dueño del camión",
  },
  {
    clave: "lista_trozas",
    label: "Lista de trozas",
    hint: "La lista firmada que viaja con la GTF",
  },
  {
    clave: "gtf",
    label: "GTF",
    hint: "La guía de transporte forestal (la de papel o la que arma el sistema)",
  },
  {
    clave: "otros",
    label: "Otros",
    hint: "Actas, pesaje, fotos del papel, lo que no entra arriba",
  },
] as const;

export type CasilleroGuia = (typeof CASILLEROS_GUIA)[number]["clave"];
export const CLAVES_CASILLERO = CASILLEROS_GUIA.map((c) => c.clave) as unknown as readonly [
  CasilleroGuia,
  ...CasilleroGuia[],
];
export const TOTAL_CASILLEROS = CASILLEROS_GUIA.length;

export const PREFIJO_TAG_GTF = "gtf:";
export const PREFIJO_TAG_CASILLERO = "casillero:";
/** Dónde viven las guías en el Drive. Un solo nombre (lo usa también «Guardar en el expediente»). */
export const CARPETA_GUIAS = "Guías forestales (GTF)";

/** Tope por archivo: Vercel corta el PEDIDO en 4,5 MB con un 413 sin JSON. */
export const MAX_BYTES_DOC_GUIA = 4 * 1024 * 1024;
/** Hasta cuántos archivos por casillero (una factura de 8 hojas fotografiadas entra). */
export const MAX_DOCS_POR_CASILLERO = 12;

export function esCasilleroGuia(v: unknown): v is CasilleroGuia {
  return typeof v === "string" && (CLAVES_CASILLERO as readonly string[]).includes(v);
}

export function labelDeCasillero(c: CasilleroGuia): string {
  return CASILLEROS_GUIA.find((x) => x.clave === c)?.label ?? c;
}

export const tagGtf = (gtf: string) => `${PREFIJO_TAG_GTF}${gtf.trim()}`;
export const tagCasillero = (c: CasilleroGuia) => `${PREFIJO_TAG_CASILLERO}${c}`;

/**
 * Las etiquetas de un documento de la guía. Las humanas (`forestal`, el N°,
 * el nombre del casillero) son para buscarlo en el Drive; las de máquina
 * (`gtf:`, `casillero:`) son las que lo ponen en su casillero.
 */
export function etiquetasDeDocumentoGuia(gtf: string, casillero: CasilleroGuia): string[] {
  const n = gtf.trim();
  return [
    "forestal",
    "documento de guía",
    labelDeCasillero(casillero).toLowerCase(),
    n,
    tagGtf(n),
    tagCasillero(casillero),
  ];
}

/**
 * Las etiquetas con las que se BUSCA en el Drive lo de estas guías (un
 * `hasSome`): la de máquina tal cual y en minúscula (el «renombrar etiqueta»
 * del Drive la baja a minúscula) y el N° solo, por el legado.
 */
export function etiquetasDeBusqueda(gtfs: readonly string[]): string[] {
  const out = new Set<string>();
  for (const g of gtfs) {
    const n = g.trim();
    if (!n) continue;
    out.add(tagGtf(n));
    out.add(tagGtf(n).toLowerCase());
    out.add(n);
  }
  return [...out];
}

const bajo = (s: string) => s.trim().toLowerCase();

/**
 * ¿En qué casillero de ESTA guía va un documento, según sus etiquetas?
 * `null` = no es de esta guía. Con `gtf:` y sin casillero reconocible → «otros»
 * (no se esconde un papel por una etiqueta mal escrita).
 */
export function casilleroDeDocumento(tags: readonly string[], gtf: string): CasilleroGuia | null {
  const g = bajo(gtf);
  if (!g) return null;
  const t = tags.map(bajo);
  if (t.includes(`${PREFIJO_TAG_GTF}${g}`)) {
    const c = t
      .find((x) => x.startsWith(PREFIJO_TAG_CASILLERO))
      ?.slice(PREFIJO_TAG_CASILLERO.length);
    return esCasilleroGuia(c) ? c : "otros";
  }
  /* Legado: archivado desde «Documento de la guía». La GTF de SALIDA y el
     legajo del mes también llevan «GTF»: no son papeles de este ingreso. */
  if (t.includes(g) && t.includes("forestal") && !t.includes("salida") && !t.includes("legajo")) {
    if (t.includes("gtf")) return "gtf";
    if (t.includes("lista de trozas")) return "lista_trozas";
  }
  return null;
}

/** Lo mínimo de un documento que necesita el agrupador. */
export interface DocConEtiquetas {
  tags: readonly string[];
}

export type DocsPorCasillero<D> = Record<CasilleroGuia, D[]>;

export function vacioPorCasillero<D>(): DocsPorCasillero<D> {
  return Object.fromEntries(CLAVES_CASILLERO.map((c) => [c, [] as D[]])) as DocsPorCasillero<D>;
}

/** Los documentos de UNA guía, cada uno en su casillero (el orden de entrada se respeta). */
export function agruparPorCasillero<D extends DocConEtiquetas>(
  docs: readonly D[],
  gtf: string,
): DocsPorCasillero<D> {
  const out = vacioPorCasillero<D>();
  for (const d of docs) {
    const c = casilleroDeDocumento(d.tags, gtf);
    if (c) out[c].push(d);
  }
  return out;
}

/** Cuántos casilleros tienen al menos un archivo (el «3» de «3 de 6»). */
export function casillerosLlenos<D>(g: DocsPorCasillero<D>): number {
  return CLAVES_CASILLERO.filter((c) => g[c].length > 0).length;
}

/**
 * Casilleros llenos por guía, para la fila de la tabla. Un documento cuenta
 * para cada guía que sus etiquetas nombran (casi siempre una).
 */
export function llenosPorGuia(
  docs: readonly DocConEtiquetas[],
  gtfs: readonly string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const gtf of gtfs) {
    if (!gtf.trim() || gtf in out) continue;
    out[gtf] = casillerosLlenos(agruparPorCasillero(docs, gtf));
  }
  return out;
}

/**
 * Un nombre de carpeta a partir de un dato del papel. La `/` es el separador
 * de rutas de `createFolderTree`: el permiso «19-SEC/REG-PLT-2021-017» sin esto
 * se abría en tres carpetas. Tampoco van `\ : * ? " < > |` (la carpeta se
 * sincroniza con Windows, ADR-307) ni marcas invisibles.
 */
export function segmentoDeCarpeta(v: string | null | undefined): string {
  return (v ?? "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/[\\/]+/g, "-")
    .replace(/[:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    /* 80 = lo que guarda `createFolderTree`; más largo, la carpeta se
       duplicaba en cada subida (busca por el nombre entero, guarda cortado). */
    .slice(0, 80)
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .trim();
}

export const SIN_TITULAR = "Sin titular";
export const SIN_PERMISO = "Sin permiso";

/**
 * Carpeta del Drive de UNA guía (ADR-442): el titular, su permiso y la guía.
 *
 *   Guías forestales (GTF) / COMUNIDAD NATIVA SANTA ROSA DE CHIVIS /
 *     19-SEC-REG-PLT-2021-017 / GTF 019-001-0000003
 *
 * Dos niveles (titular → permiso) y no uno «titular · permiso»: un titular
 * puede tener varios permisos (ADR-425) y así quedan juntos. Sin dato, la
 * carpeta lo dice («Sin titular»): el papel nunca se pierde por un dato ausente.
 */
export function carpetaGuiaPorTitular(o: {
  titular?: string | null;
  permiso?: string | null;
  gtfNumber: string;
}): string[] {
  const gtf = segmentoDeCarpeta(o.gtfNumber);
  return [
    CARPETA_GUIAS,
    segmentoDeCarpeta(o.titular) || SIN_TITULAR,
    segmentoDeCarpeta(o.permiso) || SIN_PERMISO,
    gtf ? `GTF ${gtf}` : "GTF sin número",
  ];
}

/** «Factura — GTF 019-0000003 (IMG_2031).webp»: dice qué es aunque se lo mire suelto en el Drive. */
export function nombreDeDocumentoGuia(
  casillero: CasilleroGuia,
  gtf: string,
  original: string,
  ext: string,
): string {
  const base = original
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    // Marcas bidi / invisibles (U+202A-202E, U+2066-2069, U+200B-200F): con
    // ellas un nombre se muestra al revés en la lista (spoofing de extensión).
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .trim()
    .slice(0, 60);
  return `${labelDeCasillero(casillero)} — GTF ${gtf.trim()}${base ? ` (${base})` : ""}.${ext}`;
}

/**
 * ¿Los bytes son de un PDF? Por la firma `%PDF-`, no por lo que dice el
 * navegador. La especificación la deja aparecer en el primer KB (hay
 * generadores que meten basura antes).
 */
export function esPdfPorFirma(bytes: Uint8Array): boolean {
  const lim = Math.min(bytes.length - 5, 1024);
  for (let i = 0; i <= lim; i++) {
    if (
      bytes[i] === 0x25 &&
      bytes[i + 1] === 0x50 &&
      bytes[i + 2] === 0x44 &&
      bytes[i + 3] === 0x46 &&
      bytes[i + 4] === 0x2d
    )
      return true;
  }
  return false;
}
