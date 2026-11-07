import { CARPETA_PERSONAS } from "@/lib/camaras/personas";
import { CARPETA_GUIAS } from "@/lib/forestal/documentos-guia";
import { RAIZ_DRIVE_LOTH } from "@/lib/forestal/plan-documentos-tipos";

/**
 * Carpetas raíz que crea el SISTEMA solo en el Archivo. Brandon las puede mover
 * dentro de otra carpeta: el sistema las reconoce por una etiqueta invisible
 * (`sistema:<clave>` en `DocumentFolder.tags`) y no por estar en la raíz con su
 * nombre. Módulo puro (sin DB): lo usan el cliente y el servidor.
 */
export type ClaveSistema = "guias" | "libro-th" | "camaras";

export const PREFIJO_TAG_SISTEMA = "sistema:";

export const RAICES_SISTEMA: Record<ClaveSistema, { tag: string; nombre: string }> = {
  guias: { tag: `${PREFIJO_TAG_SISTEMA}guias`, nombre: CARPETA_GUIAS },
  "libro-th": { tag: `${PREFIJO_TAG_SISTEMA}libro-th`, nombre: RAIZ_DRIVE_LOTH },
  camaras: { tag: `${PREFIJO_TAG_SISTEMA}camaras`, nombre: CARPETA_PERSONAS[0] },
};

/** `sistema:*` es de máquina: no se muestra ni se ofrece como etiqueta. */
export const esTagDeSistema = (tag: string): boolean => tag.trim().toLowerCase().startsWith(PREFIJO_TAG_SISTEMA);

export const mismoNombre = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

export interface CarpetaConTag {
  id: string;
  name: string;
  parentId?: string | null;
  tags?: readonly string[] | null;
}

/** La carpeta que lleva la marca de esa raíz del sistema, esté donde esté. */
export function raizEtiquetada<T extends CarpetaConTag>(carpetas: readonly T[], clave: ClaveSistema): T | undefined {
  const tag = RAICES_SISTEMA[clave].tag;
  return carpetas.find((c) => c.tags?.includes(tag));
}

/**
 * Lectura pura de `ruta` (primer tramo = nombre de la raíz del sistema) en una
 * lista de carpetas ya leída: primero desde la raíz etiquetada, después desde la
 * raíz por nombre (como antes de las etiquetas). `null` si no existe.
 */
export function idDeRutaDelSistema(carpetas: readonly CarpetaConTag[], clave: ClaveSistema, ruta: readonly string[]): string | null {
  const bajar = (desde: string | null, tramos: readonly string[]): string | null => {
    let actual = desde;
    for (const nombre of tramos) {
      const f = carpetas.find((c) => (c.parentId ?? null) === actual && mismoNombre(c.name, nombre));
      if (!f) return null;
      actual = f.id;
    }
    return actual;
  };
  const marcada = raizEtiquetada(carpetas, clave);
  return (marcada ? bajar(marcada.id, ruta.slice(1)) : null) ?? bajar(null, ruta);
}
