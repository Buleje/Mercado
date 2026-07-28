/**
 * relevancia — por qué apareció este documento, y cuál va primero.
 *
 * Buscar en el drive devuelve una lista; lo que no devolvía era el PORQUÉ. Si
 * "alquiler" aparece en la descripción que escribió la IA y el archivo se llama
 * "IMG_2034.pdf", la lista mostraba un nombre que no dice nada y el usuario no
 * sabe si es el que busca. Acá se calcula dónde coincidió (nombre, descripción,
 * etiqueta, contenido), se recorta el fragmento exacto y se ordena poniendo
 * arriba las coincidencias más confiables.
 *
 * Sin dependencias de React ni de red: es lógica pura y por eso se testea.
 */

/** Lo mínimo que necesita saber esta lógica de un documento. */
export interface DocBuscable {
  name: string;
  originalName?: string;
  tags?: string[];
  aiTags?: string[];
  ocrText?: string | null;
  ocrMetadata?: Record<string, unknown> | null;
  favorite?: boolean;
  uploadedAt?: string;
}

export type CampoCoincidencia = "nombre" | "propia" | "descripcion" | "datos" | "etiqueta" | "contenido";

export interface Fragmento {
  antes: string;
  match: string;
  despues: string;
}

export interface Coincidencia {
  campo: CampoCoincidencia;
  fragmento: Fragmento | null;
  puntaje: number;
}

/** Cuánto vale encontrar el término en cada lugar. El nombre manda; el cuerpo
 *  del documento es el más débil porque una palabra suelta en la página 8 casi
 *  nunca es lo que la persona buscaba. */
const PESO: Record<CampoCoincidencia, number> = {
  nombre: 10,
  propia: 8,
  descripcion: 6,
  datos: 5,
  etiqueta: 4,
  contenido: 2,
};

export const ETIQUETA_CAMPO: Record<CampoCoincidencia, string> = {
  nombre: "En el nombre",
  propia: "En tu descripción",
  descripcion: "En la descripción",
  datos: "En los datos",
  etiqueta: "En una etiqueta",
  contenido: "En el contenido",
};

/** Vocales con tilde y ñ → su letra pelada, SIN cambiar el largo del texto
 *  (cada carácter se reemplaza por uno). Eso permite buscar sin tildes y seguir
 *  sabiendo en qué posición del texto ORIGINAL cayó la coincidencia. */
const MAPA_TILDES: Record<string, string> = {
  á: "a", à: "a", ä: "a", â: "a", ã: "a",
  é: "e", è: "e", ë: "e", ê: "e",
  í: "i", ì: "i", ï: "i", î: "i",
  ó: "o", ò: "o", ö: "o", ô: "o", õ: "o",
  ú: "u", ù: "u", ü: "u", û: "u",
  ñ: "n", ç: "c",
};

function plegar(s: string): string {
  const bajo = s.toLowerCase();
  if (bajo.length !== s.length) return bajo; // caso raro (İ turca): sin plegado
  const sinTildes = bajo.replace(/[^\x20-\x7E]/g, (c) => MAPA_TILDES[c] ?? c);
  return sinTildes.length === s.length ? sinTildes : bajo;
}

/** Índice de `aguja` dentro de `texto`, ignorando mayúsculas y tildes. -1 si no está. */
export function buscarIndice(texto: string, aguja: string): number {
  if (!texto || !aguja) return -1;
  const t = plegar(texto);
  return t.length === texto.length ? t.indexOf(plegar(aguja)) : texto.toLowerCase().indexOf(aguja.toLowerCase());
}

/** Marcas internas del texto buscable (ver `lib/documents/texto-buscable`). */
const MARCAS = /\n\n?\[(?:Descripción|Datos|Entidades|Etiquetas|Mi descripción)\]\s/;

/** El texto del archivo, sin los bloques que le agregó la IA. */
export function contenidoCrudo(ocrText: string | null | undefined): string {
  return (ocrText ?? "").split(MARCAS)[0] ?? "";
}

const leerString = (meta: Record<string, unknown> | null | undefined, clave: string): string => {
  const v = meta?.[clave];
  return typeof v === "string" ? v.trim() : "";
};

/** La descripción que escribió una persona (la que corrige a la IA). */
export function descripcionPropia(doc: DocBuscable): string {
  return leerString(doc.ocrMetadata, "descripcionUsuario");
}

/** La descripción que escribió la IA (o, si no hay, su resumen). */
export function descripcionIA(doc: DocBuscable): string {
  return leerString(doc.ocrMetadata, "description") || leerString(doc.ocrMetadata, "summary");
}

/** La que se muestra cuando hay lugar para una sola: gana la de la persona. */
export function descripcionDe(doc: DocBuscable): { texto: string; fuente: "usuario" | "ia" } | null {
  const propia = descripcionPropia(doc);
  if (propia) return { texto: propia, fuente: "usuario" };
  const ia = descripcionIA(doc);
  return ia ? { texto: ia, fuente: "ia" } : null;
}

/** ¿Ya sabemos qué es este documento? */
export function tieneDescripcion(doc: DocBuscable): boolean {
  return descripcionDe(doc) !== null;
}

/** Datos clave + entidades, aplanados (viven en ocrMetadata). */
function datosDe(doc: DocBuscable): string {
  const meta = doc.ocrMetadata ?? {};
  const facts = Array.isArray(meta.keyFacts) ? (meta.keyFacts as unknown[]).filter((f) => typeof f === "string") : [];
  const ent = (meta.entities ?? null) as Record<string, unknown> | null;
  const entidades = ent
    ? Object.values(ent).flatMap((v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []))
    : [];
  return [...facts, ...entidades].join(" · ");
}

/** Recorta el texto alrededor de la coincidencia, con puntos suspensivos. */
export function fragmentoDe(texto: string, aguja: string, radio = 40): Fragmento | null {
  const idx = buscarIndice(texto, aguja);
  if (idx === -1) return null;
  const desde = Math.max(0, idx - radio);
  const hasta = Math.min(texto.length, idx + aguja.length + radio + 20);
  return {
    antes: (desde > 0 ? "…" : "") + texto.slice(desde, idx),
    match: texto.slice(idx, idx + aguja.length),
    despues: texto.slice(idx + aguja.length, hasta) + (hasta < texto.length ? "…" : ""),
  };
}

/** Los campos en el orden en que conviene mirarlos (del más confiable al menos). */
function camposDe(doc: DocBuscable): { campo: CampoCoincidencia; texto: string }[] {
  return [
    { campo: "nombre", texto: [doc.name, doc.originalName].filter(Boolean).join(" ") },
    { campo: "propia", texto: descripcionPropia(doc) },
    { campo: "descripcion", texto: descripcionIA(doc) },
    { campo: "datos", texto: datosDe(doc) },
    { campo: "etiqueta", texto: [...(doc.tags ?? []), ...(doc.aiTags ?? [])].join(" ") },
    { campo: "contenido", texto: contenidoCrudo(doc.ocrText) },
  ];
}

/**
 * Dónde coincidió y cuánto vale. `terminos` puede ser la frase entera y/o las
 * palabras sueltas (la búsqueda IA expande a sinónimos): cada término que
 * aparece suma, así el que trae más términos sube.
 */
export function coincidenciaDe(doc: DocBuscable, terminos: string[]): Coincidencia | null {
  const utiles = terminos.map((t) => t.trim()).filter((t) => t.length >= 2);
  if (utiles.length === 0) return null;

  const campos = camposDe(doc);
  let mejor: { campo: CampoCoincidencia; aguja: string } | null = null;
  let puntaje = 0;

  for (const t of utiles) {
    for (const { campo, texto } of campos) {
      if (!texto || buscarIndice(texto, t) === -1) continue;
      puntaje += PESO[campo];
      // Frase completa en el nombre: es casi seguro el que buscaba.
      if (campo === "nombre" && utiles.length > 1 && t.includes(" ")) puntaje += 8;
      if (!mejor || PESO[campo] > PESO[mejor.campo]) mejor = { campo, aguja: t };
      break; // el término ya sumó por su lugar más fuerte
    }
  }

  if (!mejor) return null;
  const texto = campos.find((c) => c.campo === mejor!.campo)?.texto ?? "";
  return { campo: mejor.campo, fragmento: fragmentoDe(texto, mejor.aguja), puntaje };
}

/**
 * Ordena por relevancia. Los que no coinciden con nada (llegaron por otro
 * filtro) quedan al final, ordenados como siempre: favoritos y luego recientes.
 */
export function ordenarPorRelevancia<T extends DocBuscable>(docs: T[], terminos: string[]): T[] {
  const puntajes = new Map<T, number>(docs.map((d) => [d, coincidenciaDe(d, terminos)?.puntaje ?? 0]));
  return [...docs].sort((a, b) => {
    const pa = puntajes.get(a) ?? 0;
    const pb = puntajes.get(b) ?? 0;
    if (pa !== pb) return pb - pa;
    if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1;
    return new Date(b.uploadedAt ?? 0).getTime() - new Date(a.uploadedAt ?? 0).getTime();
  });
}
