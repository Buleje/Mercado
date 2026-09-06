"use client";

/**
 * ctp-cola-archivado.ts — recorrer la cola de papeles que van al expediente.
 *
 * Vive fuera del componente porque acá el error no se ve: la primera versión
 * avanzaba la cola en dos lados —el camino "ya estaba en el Drive" y el
 * `finally`— y un `return` dentro del `try` PASA por el `finally`. La cola
 * saltaba de a dos y la lista de trozas de cada guía se perdía sin error, sin
 * aviso y sin nada raro en pantalla. Se descubrió comparando el resumen contra
 * lo que había en la carpeta.
 *
 * Como función pura con sus dependencias inyectadas, eso se prueba: "cada hoja
 * se toca exactamente una vez" es un test, no una lectura atenta.
 */

import { logger } from "@/lib/logger";

export interface PapelEnCola {
  /** Identifica la hoja: id del ingreso + nombre del archivo. */
  clave: string;
  /** Nombre del archivo SIN extensión. */
  nombre: string;
}

export interface ResumenArchivado {
  guardadas: number;
  yaEstaban: number;
  fallidas: number;
  /** Qué se guardó, para poder decirlo con nombre y apellido. */
  nombres: string[];
}

export interface DependenciasCola<T extends PapelEnCola> {
  /** ¿Ese papel ya está en el expediente? */
  existe: (papel: T) => Promise<boolean>;
  /** Sube el papel. Debe rechazar si no se pudo. */
  guardar: (papel: T) => Promise<void>;
}

/**
 * Recorre la cola DE A UNA y devuelve qué pasó con cada papel.
 *
 * De a una a propósito: validar veinte guías dispararía veinte rasterizaciones
 * simultáneas y dejaría el panel duro. Y una que falla no corta la fila — se
 * cuenta y se sigue, porque el archivado nunca puede trabar la operación que el
 * almacenero vino a hacer.
 */
export async function procesarCola<T extends PapelEnCola>(
  cola: ReadonlyArray<T>,
  deps: DependenciasCola<T>,
): Promise<ResumenArchivado> {
  const resumen: ResumenArchivado = { guardadas: 0, yaEstaban: 0, fallidas: 0, nombres: [] };

  for (const papel of cola) {
    try {
      if (await deps.existe(papel)) {
        resumen.yaEstaban += 1;
        continue;
      }
      await deps.guardar(papel);
      resumen.guardadas += 1;
      resumen.nombres.push(papel.nombre);
    } catch (err) {
      resumen.fallidas += 1;
      logger.error("[ctp-cola] no se pudo archivar", { papel: papel.nombre, error: String(err) });
    }
  }

  return resumen;
}

/** ¿Hay algo que contarle al operador? Un resumen en cero no merece un aviso. */
export function hayNovedades(r: ResumenArchivado): boolean {
  return r.guardadas > 0 || r.yaEstaban > 0 || r.fallidas > 0;
}
