/**
 * Cómo se dicen las cosas de las piezas en la pantalla del superadmin.
 * Un solo lugar: la tabla, el modal y los avisos leen de acá.
 */
import type { EnchufeId } from "@/extensiones/_contrato";
import type { FilaDeLaMatriz } from "@/lib/extensiones/resolver";

export const ROTULO_ENCHUFE: Readonly<Record<EnchufeId, string>> = {
  "tienda.portada": "Portada de la tienda",
  "forestal.guia-impresa": "Guía impresa",
  "panel.pestana": "Pestaña «A medida»",
  "tienda.pagina": "Página propia",
};

export interface AvisoDeFila {
  /** `error` = la pieza NO corre; `aviso` = corre pero conviene mirarla. */
  tono: "error" | "aviso";
  texto: string;
}

/** Lo que el superadmin necesita saber de una fila guardada, en su idioma. */
export function avisosDeFila(f: Pick<FilaDeLaMatriz, "huerfana" | "desactualizada" | "opcionesValidas">): AvisoDeFila[] {
  const avisos: AvisoDeFila[] = [];
  if (f.huerfana) {
    avisos.push({ tono: "error", texto: "Esta pieza ya no existe en el código: no hace nada." });
    return avisos;
  }
  if (!f.opcionesValidas) {
    avisos.push({ tono: "error", texto: "Las opciones guardadas ya no sirven: la pieza no corre. Ábrelas y guárdalas de nuevo." });
  }
  if (f.desactualizada) {
    avisos.push({ tono: "aviso", texto: "Se guardó con otra versión de la pieza. Revisa sus opciones y guarda para ponerla al día." });
  }
  return avisos;
}

/** El rótulo de un enchufe que llega como texto (una fila vieja puede traer uno que ya no existe). */
export const rotuloDeEnchufe = (e: string): string => (ROTULO_ENCHUFE as Record<string, string>)[e] ?? e;
