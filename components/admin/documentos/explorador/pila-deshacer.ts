/**
 * Deshacer (Ctrl+Z) del explorador del Archivo, como el de Windows: guarda
 * lo último que hiciste y lo da vuelta con los MISMOS endpoints de siempre.
 *
 * - mover        → los vuelve a su carpeta de antes (cada uno a la suya).
 * - renombrar    → le pone el nombre de antes.
 * - eliminar     → los saca de la papelera (sólo archivos: las carpetas no
 *                  van a la papelera, se borran de verdad, y no se apilan).
 * - crear carpeta → la borra, sólo si sigue vacía.
 *
 * Vive en memoria de la pestaña (tope 20): recargar la página la vacía.
 */

export type AccionDeshacer =
  | {
      tipo: "mover";
      /** Cada archivo con la carpeta de donde salió (`null` = raíz). */
      docs: readonly { id: string; desde: string | null }[];
      carpetas: readonly { id: string; desde: string | null }[];
      /** «Facturas»: a dónde fueron, para el texto «Deshacer mover a…». */
      nombreDestino: string;
    }
  | { tipo: "renombrar"; objeto: "doc" | "carpeta"; id: string; antes: string; despues: string }
  | { tipo: "eliminar"; docs: readonly string[]; nombre: string }
  | { tipo: "crear-carpeta"; id: string; nombre: string };

/** Lo que el deshacer necesita del módulo (todo existe en `useDocuments`). */
export interface ApiDeshacer {
  moverDocs: (ids: string[], carpetaId: string | null) => Promise<unknown>;
  moverCarpeta: (id: string, padreId: string | null) => Promise<unknown>;
  renombrarDoc: (id: string, nombre: string) => Promise<unknown>;
  renombrarCarpeta: (id: string, nombre: string) => Promise<unknown>;
  restaurar: (ids: string[]) => Promise<unknown>;
  /** ¿Sigue vacía (sin archivos ni subcarpetas)? */
  /** Puede preguntar al servidor: la lista de la pantalla es sólo la carpeta abierta. */
  carpetaVacia: (id: string) => boolean | Promise<boolean>;
  borrarCarpeta: (id: string) => Promise<unknown>;
}

export const TOPE_DESHACER = 20;

/** Apila sin pasar el tope (se cae lo más viejo). */
export function apilar(pila: readonly AccionDeshacer[], accion: AccionDeshacer, tope = TOPE_DESHACER): AccionDeshacer[] {
  const nueva = [...pila, accion];
  return nueva.length > tope ? nueva.slice(nueva.length - tope) : nueva;
}

const cuantos = (n: number, uno: string, varios: string) => (n === 1 ? uno : `${n} ${varios}`);

/** «Deshacer mover a Facturas», «Deshacer cambiar nombre»… lo que dice el menú. */
export function etiquetaDeshacer(a: AccionDeshacer | undefined): string | null {
  if (!a) return null;
  switch (a.tipo) {
    case "mover": return `Deshacer mover a «${a.nombreDestino}»`;
    case "renombrar": return "Deshacer cambiar nombre";
    case "eliminar": return `Deshacer eliminar ${cuantos(a.docs.length, `«${a.nombre}»`, "archivos")}`;
    case "crear-carpeta": return `Deshacer nueva carpeta «${a.nombre}»`;
  }
}

/** Agrupa los archivos por la carpeta de donde salieron (un pedido por carpeta). */
export function agruparPorOrigen(docs: readonly { id: string; desde: string | null }[]): Map<string | null, string[]> {
  const grupos = new Map<string | null, string[]>();
  for (const d of docs) {
    const lista = grupos.get(d.desde);
    if (lista) lista.push(d.id);
    else grupos.set(d.desde, [d.id]);
  }
  return grupos;
}

export class NoSePuedeDeshacer extends Error {}

/** Da vuelta la acción. Tira `NoSePuedeDeshacer` con el motivo en castellano. */
export async function revertir(a: AccionDeshacer, api: ApiDeshacer): Promise<string> {
  switch (a.tipo) {
    case "mover": {
      for (const [desde, ids] of agruparPorOrigen(a.docs)) await api.moverDocs(ids, desde);
      for (const c of a.carpetas) await api.moverCarpeta(c.id, c.desde);
      const n = a.docs.length + a.carpetas.length;
      return n === 1 ? "Volvió a su carpeta" : `${n} elementos volvieron a su carpeta`;
    }
    case "renombrar":
      if (a.objeto === "doc") await api.renombrarDoc(a.id, a.antes);
      else await api.renombrarCarpeta(a.id, a.antes);
      return `Vuelve a llamarse «${a.antes}»`;
    case "eliminar":
      await api.restaurar([...a.docs]);
      return a.docs.length === 1 ? `«${a.nombre}» salió de la papelera` : `${a.docs.length} archivos salieron de la papelera`;
    case "crear-carpeta":
      if (!(await api.carpetaVacia(a.id))) throw new NoSePuedeDeshacer(`«${a.nombre}» ya tiene cosas adentro: bórrala a mano si ya no la quieres`);
      await api.borrarCarpeta(a.id);
      return `Se quitó la carpeta «${a.nombre}»`;
  }
}
