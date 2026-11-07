/**
 * Buscar en todas las Esenciales (Brandon 23-10): escribes una palabra y salen
 * los papeles de todas tus carpetas esenciales con su camino. Puro y sin
 * `server-only`: lo usan la pantalla y los tests.
 */

export interface ResultadoBusqueda<D> {
  doc: D;
  /** La carpeta esencial donde cae. */
  esencialId: string;
  /** La carpeta del papel. */
  carpetaId: string;
  /** Nombres desde la esencial (incluida) hasta la carpeta del papel. */
  ruta: string[];
  coincideEn: "nombre" | "etiqueta" | "texto";
  /** Si fue en el texto leído: ~80 caracteres alrededor de la palabra. */
  fragmento: string | null;
}

/** Tope por defecto de resultados. */
export const TOPE_BUSQUEDA = 50;

const QUITAR_TILDES = /\p{Diacritic}/gu;

/** Sin tildes ni mayúsculas. */
export const sinTildes = (s: string): string => s.normalize("NFD").replace(QUITAR_TILDES, "").toLowerCase();

/** Las palabras de la búsqueda, sin tildes y sin repetir. */
export function palabrasDe(q: string): string[] {
  return [...new Set(sinTildes(q).split(/\s+/).filter(Boolean))];
}

/** Normaliza y recuerda a qué posición del original corresponde cada letra. */
function normalizarConMapa(texto: string): { norm: string; mapa: number[] } {
  let norm = "";
  const mapa: number[] = [];
  let i = 0;
  for (const ch of texto) {
    const n = sinTildes(ch);
    for (let k = 0; k < n.length; k++) mapa.push(i);
    norm += n;
    i += ch.length;
  }
  return { norm, mapa };
}

/** Parte `texto` en trozos, marcando los que son una de las palabras (sin tildes). */
export function partirResaltado(texto: string, palabras: readonly string[]): { texto: string; marca: boolean }[] {
  if (!texto || palabras.length === 0) return [{ texto, marca: false }];
  const { norm, mapa } = normalizarConMapa(texto);
  const huecos: [number, number][] = [];
  for (const p of palabras) {
    let desde = 0;
    for (;;) {
      const at = norm.indexOf(p, desde);
      if (at < 0) break;
      huecos.push([mapa[at], (mapa[at + p.length - 1] ?? texto.length - 1) + 1]);
      desde = at + p.length;
    }
  }
  if (huecos.length === 0) return [{ texto, marca: false }];
  huecos.sort((a, b) => a[0] - b[0]);
  const unidos: [number, number][] = [];
  for (const h of huecos) {
    const u = unidos[unidos.length - 1];
    if (u && h[0] <= u[1]) u[1] = Math.max(u[1], h[1]);
    else unidos.push([h[0], h[1]]);
  }
  const partes: { texto: string; marca: boolean }[] = [];
  let pos = 0;
  for (const [a, b] of unidos) {
    if (a > pos) partes.push({ texto: texto.slice(pos, a), marca: false });
    partes.push({ texto: texto.slice(a, b), marca: true });
    pos = b;
  }
  if (pos < texto.length) partes.push({ texto: texto.slice(pos), marca: false });
  return partes;
}

/** ~80 caracteres alrededor de la primera palabra hallada en el texto. */
function fragmentoDe(texto: string, palabras: readonly string[]): string | null {
  const { norm, mapa } = normalizarConMapa(texto);
  let mejor = -1;
  let largo = 0;
  for (const p of palabras) {
    const at = norm.indexOf(p);
    if (at >= 0 && (mejor < 0 || at < mejor)) {
      mejor = at;
      largo = p.length;
    }
  }
  if (mejor < 0) return null;
  const ini = mapa[mejor];
  const fin = (mapa[mejor + largo - 1] ?? ini) + 1;
  const medio = Math.max(0, Math.floor((80 - (fin - ini)) / 2));
  const a = Math.max(0, ini - medio);
  const b = Math.min(texto.length, fin + medio);
  const cuerpo = texto.slice(a, b).replace(/\s+/g, " ").trim();
  return `${a > 0 ? "…" : ""}${cuerpo}${b < texto.length ? "…" : ""}`;
}

const contieneTodas = (campo: string, palabras: readonly string[]) => palabras.every((p) => campo.includes(p));

export function buscarEnEsenciales<
  D extends {
    id: string;
    folderId: string | null;
    name: string;
    originalName?: string | null;
    tags?: string[] | null;
    aiTags?: string[] | null;
    ocrText?: string | null;
    uploadedAt: string;
    deletedAt?: string | null;
  },
>(args: {
  q: string;
  esenciales: readonly { carpeta: { id: string; name: string }; carpetaIds: Set<string> }[];
  carpetas: readonly { id: string; name: string; parentId: string | null }[];
  docs: readonly D[];
  tope?: number;
}): ResultadoBusqueda<D>[] {
  const palabras = palabrasDe(args.q);
  if (args.q.trim().length < 2 || palabras.length === 0) return [];
  const tope = args.tope ?? TOPE_BUSQUEDA;

  const porId = new Map(args.carpetas.map((c) => [c.id, c]));
  const esencialPorId = new Map(args.esenciales.map((e) => [e.carpeta.id, e]));
  // Caché por carpeta: camino hasta la esencial más cercana (null = ninguna).
  const caminos = new Map<string, { esencialId: string; ruta: string[] } | null>();
  const caminoDe = (carpetaId: string) => {
    if (caminos.has(carpetaId)) return caminos.get(carpetaId)!;
    const nombres: string[] = [];
    let actual: string | null = carpetaId;
    let hallado: { esencialId: string; ruta: string[] } | null = null;
    const vistos = new Set<string>();
    while (actual && !vistos.has(actual)) {
      vistos.add(actual);
      const c = porId.get(actual);
      const esencial = esencialPorId.get(actual);
      if (!c && !esencial) break;
      nombres.unshift(c?.name ?? esencial!.carpeta.name);
      if (esencial && esencial.carpetaIds.has(carpetaId)) {
        hallado = { esencialId: actual, ruta: nombres };
        break;
      }
      actual = c?.parentId ?? null;
    }
    caminos.set(carpetaId, hallado);
    return hallado;
  };

  const coincidencias: { r: ResultadoBusqueda<D>; rango: number; t: number }[] = [];
  for (const doc of args.docs) {
    if (doc.deletedAt || !doc.folderId) continue;
    const camino = caminoDe(doc.folderId);
    if (!camino) continue;
    const nombre = sinTildes([doc.name, doc.originalName].filter(Boolean).join(" "));
    const etiquetas = sinTildes([...(doc.tags ?? []), ...(doc.aiTags ?? [])].join(" "));
    const texto = doc.ocrText ? sinTildes(doc.ocrText) : "";
    if (!contieneTodas(`${nombre} ${etiquetas} ${texto}`, palabras)) continue;

    let coincideEn: ResultadoBusqueda<D>["coincideEn"];
    if (contieneTodas(nombre, palabras)) coincideEn = "nombre";
    else if (contieneTodas(`${nombre} ${etiquetas}`, palabras)) coincideEn = "etiqueta";
    else coincideEn = "texto";

    coincidencias.push({
      r: {
        doc,
        esencialId: camino.esencialId,
        carpetaId: doc.folderId,
        ruta: camino.ruta,
        coincideEn,
        fragmento: coincideEn === "texto" && doc.ocrText ? fragmentoDe(doc.ocrText, palabras) : null,
      },
      rango: coincideEn === "nombre" ? 0 : coincideEn === "etiqueta" ? 1 : 2,
      t: Date.parse(doc.uploadedAt) || 0,
    });
  }
  coincidencias.sort((a, b) => a.rango - b.rango || b.t - a.t);
  return coincidencias.slice(0, tope).map((c) => c.r);
}
