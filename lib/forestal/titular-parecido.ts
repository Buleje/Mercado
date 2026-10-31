/**
 * La misma comunidad escrita de varias formas (Brandon 24-10: «juntar
 * escrituras de la comunidad»).
 *
 * Medido en Blas (24-10-2026): el Directorio dice «COMUNIDAD NATIVA SAN LUIS DE
 * CHINCHIHUANI» y una GTF «CCNN SAN LUIS DE CHINCHIGUANI». Para el libro son dos
 * titulares distintos; para la ARFFS, el mismo. Esto los junta: sin tildes, sin
 * mayúsculas, sin la forma de la organización («CCNN», «C.N.», «Comunidad
 * Nativa», «Comunidad Campesina», «C.C.») y con una distancia de edición chica
 * para la letra cambiada («CHINCHIGUANI» / «CHINCHIHUANI»).
 *
 * Sin juntar de más (revisión 25-10): la distancia se mide PALABRA por
 * palabra, con a lo sumo una letra por palabra y ninguna en las de hasta 4
 * letras («Santa Rosa» ≠ «Santa Rita»); una diferencia que sólo cambia el
 * género o el número («Puerto Nuevo» ≠ «Puerto Nueva») es otro nombre; y una
 * comunidad nativa nunca es la campesina del mismo nombre.
 *
 * No escribe nada: sugiere «Usar el nombre del Directorio» y la persona decide.
 * PURO: lo usan el formulario del plan y, si se quiere, el de la GTF.
 */

/** Nativa o campesina; `null` = no lo dice («Comunidad X» a secas, o una empresa). */
export type FormaTitular = "nativa" | "campesina";

/* La forma de la organización, al principio del nombre. Más largas primero. */
const FORMAS: readonly { re: RegExp; forma: FormaTitular | null }[] = [
  { re: /^comunidad(es)? nativa(s)?\b/, forma: "nativa" },
  { re: /^comunidad(es)? campesina(s)?\b/, forma: "campesina" },
  { re: /^comunidad\b/, forma: null },
  { re: /^cc\.?\s?nn\.?(?=\s|$)/, forma: "nativa" },
  { re: /^c\.?\s?c\.?\s?n\.?\s?n\.?(?=\s|$)/, forma: "nativa" },
  { re: /^c\.?\s?n\.?(?=\s|$)/, forma: "nativa" },
  { re: /^c\.?\s?c\.?(?=\s|$)/, forma: "campesina" },
  { re: /^cn(?=\s|$)/, forma: "nativa" },
  { re: /^cc(?=\s|$)/, forma: "campesina" },
];

/** La forma y la clave del nombre: sin tildes, en minúsculas, sin signos y sin la forma. */
function partirTitular(nombre: string | null | undefined): { forma: FormaTitular | null; clave: string } {
  let t = (nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  let forma: FormaTitular | null = null;
  for (const f of FORMAS) {
    const sin = t.replace(f.re, "").trim();
    if (sin !== t) {
      t = sin;
      forma = f.forma;
      break;
    }
  }
  const clave = t
    .replace(/^(de|del)\s+/, "")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { forma, clave };
}

/** Sin tildes, en minúsculas, sin signos y sin la forma de la organización. */
export function claveDeTitular(nombre: string | null | undefined): string {
  return partirTitular(nombre).clave;
}

/** «Comunidad Nativa X» → "nativa"; «C.C. X» → "campesina"; «Comunidad X» → null. */
export function formaDeTitular(nombre: string | null | undefined): FormaTitular | null {
  return partirTitular(nombre).forma;
}

/** Distancia de Levenshtein, cortando apenas pasa el tope (los nombres son cortos). */
export function distanciaEdicion(a: string, b: string, tope = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let minFila = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < minFila) minFila = v;
    }
    if (minFila > tope) return tope + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/* Las palabras que no distinguen un nombre de otro. */
const CONECTORES = new Set(["de", "del", "la", "las", "los", "el", "y"]);
const palabrasDe = (clave: string) => clave.split(" ").filter((p) => p && !CONECTORES.has(p));
/** Lo que queda sin la terminación de género o número: «nuevo», «nueva», «nuevos» → «nuev». */
const raizDeGenero = (p: string) => p.replace(/[oa]s?$/, "");

/**
 * Cuántas letras separan dos claves, palabra por palabra; `null` = son otro
 * nombre. Hasta 4 letras, la palabra va exacta («rosa» ≠ «rita»); más larga,
 * una letra a lo sumo, salvo que esa letra sea la del género o el número.
 */
function distanciaPorPalabras(ka: string, kb: string): number | null {
  const pa = palabrasDe(ka);
  const pb = palabrasDe(kb);
  if (pa.length === 0 || pa.length !== pb.length) return null;
  let total = 0;
  for (let i = 0; i < pa.length; i++) {
    const a = pa[i] ?? "";
    const b = pb[i] ?? "";
    if (a === b) continue;
    if (Math.min(a.length, b.length) <= 4) return null;
    if (raizDeGenero(a) === raizDeGenero(b)) return null;
    const d = distanciaEdicion(a, b, 1);
    if (d > 1) return null;
    total += d;
  }
  return total;
}

/** Distancia entre dos nombres ya partidos; `null` = no son el mismo titular. */
function distanciaTitular(a: { forma: FormaTitular | null; clave: string }, b: { forma: FormaTitular | null; clave: string }): number | null {
  if (!a.clave || !b.clave) return null;
  // Una comunidad nativa no es la campesina del mismo nombre (si las dos lo dicen).
  if (a.forma && b.forma && a.forma !== b.forma) return null;
  if (a.clave === b.clave) return 0;
  return distanciaPorPalabras(a.clave, b.clave);
}

/** ¿Es el mismo titular escrito distinto? (igual exacto también cuenta). */
export function mismoTitular(a: string | null | undefined, b: string | null | undefined): boolean {
  return distanciaTitular(partirTitular(a), partirTitular(b)) != null;
}

export interface ParecidoTitular<T> {
  item: T;
  nombre: string;
  /** 0 = idéntico tras normalizar. */
  distancia: number;
  /** Se escribe EXACTAMENTE igual (con mayúsculas y tildes): no hace falta sugerir nada. */
  identico: boolean;
}

/**
 * El nombre del Directorio que más se parece a lo escrito, si alguno se
 * parece. `null` cuando ninguno pasa la tolerancia.
 */
export function titularParecido<T>(
  escrito: string | null | undefined,
  candidatos: readonly T[],
  nombreDe: (c: T) => string,
): ParecidoTitular<T> | null {
  const e = partirTitular(escrito);
  if (e.clave.length < 3) return null;
  let mejor: ParecidoTitular<T> | null = null;
  for (const c of candidatos) {
    const nombre = nombreDe(c);
    const d = distanciaTitular(e, partirTitular(nombre));
    if (d == null) continue;
    if (!mejor || d < mejor.distancia) {
      mejor = { item: c, nombre, distancia: d, identico: nombre.trim() === (escrito ?? "").trim() };
      if (d === 0 && mejor.identico) break;
    }
  }
  return mejor;
}
