/**
 * Arrastrar y soltar del explorador del Archivo: qué se lleva un arrastre
 * (la selección entera, archivos y carpetas) y si una carpeta lo puede recibir.
 *
 * Mientras se arrastra, el navegador no deja leer `dataTransfer.getData` (sólo
 * los tipos), así que la carga viaja también en una variable del módulo para
 * poder pintar la carpeta de destino como válida o no antes de soltar.
 */

export const MIME_EXPLORADOR = "application/x-explorador";
/** Los de antes: el árbol del panel lateral y las migas los siguen aceptando. */
export const MIME_DOC = "application/x-doc-id";
export const MIME_CARPETA = "application/x-folder-id";

export interface CargaArrastre {
  docs: string[];
  carpetas: string[];
}

let enVuelo: CargaArrastre | null = null;

/** Al empezar a arrastrar desde el explorador (y `null` al terminar). */
export function fijarArrastre(carga: CargaArrastre | null) {
  enVuelo = carga;
}
export const arrastreActual = () => enVuelo;

/** Escribe la carga en el `dataTransfer` (con los tipos viejos si es uno solo). */
export function escribirCarga(dt: DataTransfer, carga: CargaArrastre) {
  dt.setData(MIME_EXPLORADOR, JSON.stringify(carga));
  if (carga.docs.length === 1 && carga.carpetas.length === 0) dt.setData(MIME_DOC, carga.docs[0]);
  if (carga.carpetas.length === 1 && carga.docs.length === 0) dt.setData(MIME_CARPETA, carga.carpetas[0]);
  dt.effectAllowed = "move";
}

/** ¿Lo que se arrastra viene de adentro (no son archivos de la PC)? */
export const hayCargaInterna = (tipos: readonly string[]) =>
  tipos.includes(MIME_EXPLORADOR) || tipos.includes(MIME_DOC) || tipos.includes(MIME_CARPETA);

const sonTextos = (x: unknown): x is string[] => Array.isArray(x) && x.every((v) => typeof v === "string");

/** Lee la carga al soltar. Sin carga propia, cae a los tipos viejos. */
export function leerCarga(dt: Pick<DataTransfer, "getData">): CargaArrastre | null {
  const crudo = dt.getData(MIME_EXPLORADOR);
  if (crudo) {
    try {
      const j: unknown = JSON.parse(crudo);
      if (j && typeof j === "object" && sonTextos((j as CargaArrastre).docs) && sonTextos((j as CargaArrastre).carpetas)) {
        return { docs: (j as CargaArrastre).docs, carpetas: (j as CargaArrastre).carpetas };
      }
    } catch {
      // Carga rota: se ignora (no vino del explorador).
    }
  }
  const doc = dt.getData(MIME_DOC);
  const carpeta = dt.getData(MIME_CARPETA);
  if (!doc && !carpeta) return null;
  return { docs: doc ? [doc] : [], carpetas: carpeta ? [carpeta] : [] };
}

export interface ContextoSoltar {
  /** Carpeta padre de cada carpeta (`null` = raíz). */
  padreDeCarpeta: (id: string) => string | null | undefined;
  /** Carpeta donde está cada archivo. */
  carpetaDeDoc: (id: string) => string | null | undefined;
  /** Todas las subcarpetas (a cualquier profundidad) de una carpeta. */
  descendientes: (id: string) => ReadonlySet<string>;
}

export type Veredicto = { ok: true } | { ok: false; motivo: string };

/**
 * ¿Se puede soltar esta carga en `destinoId` (`null` = raíz)? Una carpeta no
 * entra en sí misma ni en una de sus subcarpetas; si todo ya está ahí, no hay
 * nada que mover.
 */
export function puedeSoltarEn(carga: CargaArrastre | null, destinoId: string | null, ctx: ContextoSoltar): Veredicto {
  if (!carga || (carga.docs.length === 0 && carga.carpetas.length === 0)) return { ok: false, motivo: "No hay nada que mover" };
  for (const c of carga.carpetas) {
    if (c === destinoId) return { ok: false, motivo: "Una carpeta no puede ir dentro de sí misma" };
    if (destinoId && ctx.descendientes(c).has(destinoId)) return { ok: false, motivo: "Una carpeta no puede ir dentro de una de sus subcarpetas" };
  }
  const { docs, carpetas } = filtrarQueSeMueven(carga, destinoId, ctx);
  if (docs.length === 0 && carpetas.length === 0) return { ok: false, motivo: "Ya está en esa carpeta" };
  return { ok: true };
}

/** Sólo lo que de verdad cambia de carpeta (lo que ya está ahí se queda quieto). */
export function filtrarQueSeMueven(carga: CargaArrastre, destinoId: string | null, ctx: ContextoSoltar): CargaArrastre {
  return {
    docs: carga.docs.filter((id) => (ctx.carpetaDeDoc(id) ?? null) !== destinoId),
    carpetas: carga.carpetas.filter((id) => id !== destinoId && (ctx.padreDeCarpeta(id) ?? null) !== destinoId),
  };
}

/** Todas las subcarpetas de `id` a partir del índice padre → hijos. */
export function descendientesDe(id: string, hijos: (padre: string) => readonly { id: string }[]): Set<string> {
  const out = new Set<string>();
  const pendientes = [id];
  while (pendientes.length > 0) {
    const actual = pendientes.pop() as string;
    for (const h of hijos(actual)) {
      if (out.has(h.id)) continue;
      out.add(h.id);
      pendientes.push(h.id);
    }
  }
  return out;
}
