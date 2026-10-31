/**
 * Lectura del texto para «Foto que se archiva sola» (Brandon 24-10): partir el
 * papel en palabras sin perder dónde estaba cada una, plegar lo que el OCR o
 * quien escribió cambia sin querer, y reconocer RUC/DNI, códigos y el tipo de
 * papel. Puro y sin IA paga: lo usan `sugerir-carpeta.ts` y sus tests.
 */

export interface Palabra {
  /** Sin tildes y en minúsculas: «chinchihuani». */
  n: string;
  /** Plegada (sonido): «chinchiwani» = Chinchiguani = Shinshiguani. */
  f: string;
  ini: number;
  fin: number;
}

/** Palabras que no distinguen a nadie: «Santa Rosa DE Chivis» = «Santa Rosa Chivis». */
export const VACIAS = new Set([
  "de", "del", "la", "las", "el", "los", "y", "e", "en", "para", "por", "con", "a", "al",
  "sin", "o", "u", "un", "una", "su", "sus", "lo",
]);

export const sinTildes = (s: string): string => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * Lo que suena igual se escribe igual: sh→ch, hu/gu+vocal→w, h muda, v→b,
 * z→s, k/qu→c, ce/ci→se/si, letras dobles una sola. Se aplica a los dos lados,
 * así que sólo importa que sea parejo.
 */
export function plegar(t: string): string {
  return t
    .replace(/sh/g, "ch")
    .replace(/[hg]u(?=[aeio])/g, "w")
    .replace(/(?<!c)h/g, "")
    .replace(/qu(?=[ei])/g, "c")
    .replace(/v/g, "b")
    .replace(/z/g, "s")
    .replace(/k/g, "c")
    .replace(/c(?=[ei])/g, "s")
    .replace(/y$/g, "i")
    .replace(/(.)\1+/g, "$1");
}

/** Las palabras del texto con su lugar en el original (para mostrar el tramo tal cual). */
export function palabras(texto: string): Palabra[] {
  const out: Palabra[] = [];
  for (const m of texto.matchAll(/[\p{L}\p{N}]+/gu)) {
    const n = sinTildes(m[0]);
    out.push({ n, f: plegar(n), ini: m.index, fin: m.index + m[0].length });
  }
  return out;
}

/** Singular para comparar tipos: «resoluciones» = «resolución», «poderes» = «poder». */
export function raiz(t: string): string {
  const s = t.length > 3 ? t.replace(/s$/, "") : t;
  return s.length > 4 ? s.replace(/(?<=[rndl])e$/, "") : s;
}

/** ¿Iguales salvo una letra? (para palabras largas: el OCR cambia una). */
export function casiIgual(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 7 || b.length < 7 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let cambios = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++cambios > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return cambios + (a.length - i) + (b.length - j) <= 1;
}

/** «SANTA ROSA DE CHIVIS» → «Santa Rosa de Chivis»; lo que ya viene escrito a mano, tal cual. */
export function mostrar(tramo: string): string {
  const limpio = tramo.replace(/\s+/g, " ").trim().slice(0, 60);
  if (limpio !== limpio.toUpperCase()) return limpio;
  return limpio
    .toLowerCase()
    .replace(/[\p{L}]+/gu, (p, i: number) => (i > 0 && VACIAS.has(sinTildes(p)) ? p : p[0].toUpperCase() + p.slice(1)));
}

// ── Carpetas: genéricas y nombre propio ─────────────────────────────────────

/** Donde cae lo que todavía no se ordenó: no se propone y lo que tiene cuenta como «sin ordenar». */
const DE_PASO = new Set([
  "entrada", "entradas", "varios", "otros", "otro", "general", "generales", "sin clasificar", "sin ordenar",
  "por ordenar", "por clasificar", "pendientes", "pendiente", "nueva carpeta", "escaneos", "escaneados",
  "escaneado", "descargas", "importados", "importado", "recibidos", "bandeja", "bandeja de entrada",
  "documentos", "archivos", "fotos", "imagenes", "llego por whatsapp", "whatsapp", "camaras", "temporal",
  "papeles", "mis documentos", "subidos",
]);

const clave = (nombre: string) => palabras(nombre).map((p) => p.n).join(" ");

/** «Otros», «Escaneos», «Llegó por WhatsApp»: carpetas de paso. */
export const esNombreDePaso = (nombre: string): boolean => DE_PASO.has(clave(nombre));

/** «09», «2026», «2026-10-17», «2026-10-12 a 2026-10-18»: sólo fechas o cifras. */
export const esNombreDeFecha = (nombre: string): boolean =>
  palabras(nombre).every((p) => /^\d+$/.test(p.n) || VACIAS.has(p.n));

/** Una carpeta que no se propone nunca: de paso o con nombre de fecha. */
export const esCarpetaGenerica = (nombre: string): boolean => !clave(nombre) || esNombreDePaso(nombre) || esNombreDeFecha(nombre);

/**
 * ¿Lo que está acá sigue «sin ordenar»? La raíz, una carpeta de paso y la
 * fecha DENTRO de una de paso («Llegó por WhatsApp › 2026-10-22»). Una fecha
 * dentro de una carpeta de verdad («Pagos › 2026-10-12 a 2026-10-18») ya la
 * ordenó alguien.
 */
export function estaSinOrdenar(
  folderId: string | null,
  porId: ReadonlyMap<string, { name: string; parentId: string | null }>,
): boolean {
  for (let id = folderId, n = 0; n < 50; n++) {
    const c = id ? porId.get(id) : undefined;
    if (!c) return !id;
    if (esNombreDePaso(c.name)) return true;
    if (!esNombreDeFecha(c.name)) return false;
    id = c.parentId;
  }
  return false;
}

/** «CCNN», «C.N.», «Comunidad Nativa»… no distinguen a una comunidad de otra. */
const MARCAS: string[][] = [
  ["comunidad", "nativa"], ["comunidad", "campesina"], ["comunidad"], ["ccnn"], ["cc", "nn"], ["c", "n"],
  ["cn"], ["ccpp"], ["cc", "pp"], ["cc", "cc"], ["centro", "poblado"], ["asociacion"],
];
const LEGALES: string[][] = [["s", "a", "c"], ["sac"], ["e", "i", "r", "l"], ["eirl"], ["s", "r", "l"], ["srl"], ["s", "a", "a"], ["saa"], ["s", "a"], ["sa"]];
/** Palabras que solas no nombran a nadie. */
const DEBILES = new Set(["prueba", "test", "demo", "nuevo", "nueva", "personas", "terceros", "archivo", "carpeta", "qa", "ui", "jefe", "representante", "copia", "foto", "fotos"]);

const empieza = (ps: string[], i: number, m: string[]) => m.every((w, k) => ps[i + k] === w);

/** El nombre propio: sin marcas de comunidad, forma legal, palabras vacías, de tipo ni cifras. */
export function nucleoDelNombre(nombre: string): string[] {
  const ps = palabras(nombre).map((p) => p.n);
  // «Sin permiso», «Falta firmar»: carpetas de un estado, no de alguien. Su palabra
  // («permiso») sale en papeles que justamente NO van ahí.
  if (/^(sin|no|falta|faltan|por)$/.test(ps[0] ?? "")) return [];
  const fuera: string[] = [];
  for (let i = 0; i < ps.length; ) {
    const m = MARCAS.find((mm) => empieza(ps, i, mm));
    if (m) { i += m.length; continue; }
    fuera.push(ps[i]);
    i++;
  }
  for (let quitado = true; quitado; ) {
    quitado = false;
    const l = LEGALES.find((m) => fuera.length > m.length && empieza(fuera, fuera.length - m.length, m));
    if (l) { fuera.splice(fuera.length - l.length); quitado = true; }
  }
  // Con cifras en el nombre, las siglas cortas son parte del código («19-SEC-REG-PLT-2025-096»).
  const conCodigo = /\d{2,}/.test(nombre);
  const tokens = fuera.filter((w) => !VACIAS.has(w) && !/^\d+$/.test(w) && !PALABRAS_DE_TIPO.has(raiz(w)) && !(conCodigo && w.length <= 3));
  if (tokens.every((w) => DEBILES.has(w))) return [];
  return palabras(tokens.join(" ")).map((p) => p.f);
}

// ── RUC y DNI ────────────────────────────────────────────────────────────────

const NRO = String.raw`(?:N(?:ro|°|º|o)?\.?\s*)?[:#.\-]?\s*`;
const RE_RUC = new RegExp(String.raw`R\.?\s?U\.?\s?C\.?\s*${NRO}(\d{11})(?!\d)`, "gi");
const RE_DNI = new RegExp(String.raw`D\.?\s?N\.?\s?I\.?\s*${NRO}(\d{8})(?!\d)`, "gi");
/** RUC suelto: 11 cifras que empiezan como empiezan los RUC peruanos. */
const RE_RUC_SUELTO = /(?<!\d)(?:10|15|16|17|20)\d{9}(?!\d)/g;

export type TipoId = "RUC" | "DNI";

/** Los RUC y DNI que nombra el texto. */
export function idsDelTexto(texto: string): Map<string, TipoId> {
  const ids = new Map<string, TipoId>();
  for (const m of texto.matchAll(RE_RUC)) ids.set(m[1], "RUC");
  for (const m of texto.matchAll(RE_DNI)) if (!ids.has(m[1])) ids.set(m[1], "DNI");
  for (const m of texto.matchAll(RE_RUC_SUELTO)) if (!ids.has(m[0])) ids.set(m[0], "RUC");
  return ids;
}

// ── Códigos en el nombre de la carpeta («19-SEC-REG-PLT-2021-017», «GTF 019-0000002») ──

export interface CodigoDeCarpeta {
  re: RegExp;
}

/** El código que distingue a la carpeta: sus dos últimas tandas de cifras (o una larga). */
export function codigoDeCarpeta(nombre: string): CodigoDeCarpeta | null {
  const tandas = nombre.match(/\d+/g) ?? [];
  const letras = String.raw`(?:(?<![A-Za-z])[A-Za-z]{2,6}[\s\-\/]{0,2})?`;
  // Los ceros de adelante pueden faltar o sobrar («19-000004» = «019-000004»),
  // pero la tanda no puede quedar más corta que 3 cifras: «001-02» no es «1 y 2».
  const tanda = (t: string) => String.raw`(?<!\d)(?=\d{${Math.min(t.length, 3)}})0*${t.replace(/^0+(?=\d)/, "")}(?!\d)`;
  if (tandas.length >= 2) {
    const [a, b] = tandas.slice(-2);
    if (a.length + b.length < 5) return null;
    return { re: new RegExp(String.raw`${letras}${tanda(a)}\D{1,3}${tanda(b)}`, "i") };
  }
  if (tandas.length === 1 && tandas[0].length >= 6) return { re: new RegExp(`${letras}${tanda(tandas[0])}`, "i") };
  return null;
}

// ── Tipo de papel ────────────────────────────────────────────────────────────

export interface TipoPapel {
  clave: string;
  /** «es un título de propiedad» */
  etiqueta: string;
  /** Frases que lo delatan en el título del papel (sin tildes, en singular). */
  enPapel: string[];
  /** Sólo cuentan en el NOMBRE del archivo («DNI JEFE.jpg»): en el texto, «DNI N°…» lo dice cualquier contrato. */
  enNombre?: string[];
  /** Palabras que lo nombran solas en una carpeta. */
  enCarpeta: string[];
  /** Las que lo acompañan en la carpeta pero no lo nombran solas («de propiedad», «forestales»). */
  acompanan?: string[];
}

export const TIPOS_PAPEL: TipoPapel[] = [
  { clave: "titulo", etiqueta: "un título de propiedad", enPapel: ["titulo de propiedad", "titulo propiedad"], enCarpeta: ["titulo"], acompanan: ["propiedad"] },
  { clave: "contrato", etiqueta: "un contrato", enPapel: ["contrato", "adenda"], enCarpeta: ["contrato", "adenda"] },
  { clave: "factura", etiqueta: "una factura", enPapel: ["factura"], enCarpeta: ["factura", "comprobante"] },
  { clave: "boleta", etiqueta: "una boleta", enPapel: ["boleta de venta", "boleta"], enCarpeta: ["boleta", "comprobante"] },
  { clave: "recibo", etiqueta: "un recibo", enPapel: ["recibo"], enCarpeta: ["recibo"] },
  { clave: "dni", etiqueta: "un DNI", enPapel: ["documento nacional de identidad"], enNombre: ["dni"], enCarpeta: ["dni"], acompanan: ["identidad", "documento"] },
  { clave: "acta", etiqueta: "un acta", enPapel: ["acta"], enCarpeta: ["acta"] },
  { clave: "resolucion", etiqueta: "una resolución", enPapel: ["resolucion"], enCarpeta: ["resolucion"] },
  { clave: "guia", etiqueta: "una guía forestal", enPapel: ["guia de transporte forestal", "gtf"], enNombre: ["guia"], enCarpeta: ["guia", "gtf"], acompanan: ["forestal", "transporte"] },
  { clave: "trozas", etiqueta: "una lista de trozas", enPapel: ["lista de troza", "relacion de troza"], enCarpeta: ["troza"], acompanan: ["lista", "relacion"] },
  { clave: "certificado", etiqueta: "un certificado", enPapel: ["certificado"], enCarpeta: ["certificado"] },
  { clave: "poder", etiqueta: "un poder", enPapel: ["vigencia de poder", "carta poder"], enCarpeta: ["poder"], acompanan: ["vigencia", "carta"] },
  { clave: "licencia", etiqueta: "una licencia", enPapel: ["licencia"], enCarpeta: ["licencia"] },
  { clave: "planilla", etiqueta: "una planilla", enPapel: ["planilla"], enCarpeta: ["planilla"] },
  { clave: "constancia", etiqueta: "una constancia", enPapel: ["constancia"], enCarpeta: ["constancia"] },
  { clave: "declaracion", etiqueta: "una declaración jurada", enPapel: ["declaracion jurada"], enCarpeta: ["declaracion"], acompanan: ["jurada"] },
  { clave: "plano", etiqueta: "un plano o mapa", enPapel: ["plano", "mapa"], enCarpeta: ["plano", "mapa"] },
  { clave: "cotizacion", etiqueta: "una cotización", enPapel: ["cotizacion", "proforma"], enCarpeta: ["cotizacion", "proforma"] },
];

/** Las palabras de los nombres de tipo (se sacan del nombre propio de la carpeta). */
export const PALABRAS_DE_TIPO = new Set(TIPOS_PAPEL.flatMap((t) => [...t.enCarpeta, ...(t.acompanan ?? [])]));

/** El MRZ del DNI: «I<PER45098711<…» */
const RE_MRZ_DNI = /I[D<]PER\d{8}/;

const enZona = (zona: string, frase: string) => zona.indexOf(` ${frase.split(" ").map(raiz).join(" ")} `);

/**
 * De qué tipo es el papel: lo que dice el nombre, el título (las primeras ~60
 * palabras) o lo que leyó la IA. Uno solo: el que aparece primero.
 */
export function tipoDelPapel(nombre: string, texto: string, tipoLeido?: string | null): TipoPapel | null {
  if (RE_MRZ_DNI.test(texto)) return TIPOS_PAPEL.find((t) => t.clave === "dni") ?? null;
  const zonaNombre = ` ${palabras(nombre).map((p) => raiz(p.n)).join(" ")} `;
  const zona = ` ${[...palabras(nombre), ...palabras(texto).slice(0, 60)].map((p) => raiz(p.n)).join(" ")} `;
  let mejor: { t: TipoPapel; en: number } | null = null;
  for (const t of TIPOS_PAPEL) {
    const lugares = [
      ...t.enPapel.map((f) => enZona(zona, f)),
      ...(t.enNombre ?? []).map((f) => enZona(zonaNombre, f)),
    ].filter((en) => en >= 0);
    const en = lugares.length ? Math.min(...lugares) : -1;
    if (en >= 0 && (!mejor || en < mejor.en)) mejor = { t, en };
  }
  if (mejor) return mejor.t;
  const leido = tipoLeido ? raiz(sinTildes(tipoLeido.trim())) : "";
  return TIPOS_PAPEL.find((t) => t.clave === leido) ?? null;
}

/**
 * Los tipos que nombra una carpeta («Títulos de propiedad», «Contratos QA-UI»,
 * «Jefe - representante (DNI, actas, poderes)») y si es SÓLO eso: sin nombre
 * propio que la distinga.
 */
export function tiposDeCarpeta(nombre: string): { claves: Set<string>; soloTipo: boolean } | null {
  const ps = palabras(nombre).map((p) => raiz(p.n)).filter((p) => !VACIAS.has(p));
  const claves = new Set(TIPOS_PAPEL.filter((t) => t.enCarpeta.some((w) => ps.includes(w))).map((t) => t.clave));
  if (!claves.size) return null;
  const resto = ps.filter((p) => !PALABRAS_DE_TIPO.has(p) && !DEBILES.has(p) && !/^\d+$/.test(p));
  return { claves, soloTipo: resto.length === 0 };
}
