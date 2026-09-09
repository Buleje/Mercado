/**
 * Del reparto al Anexo 04: qué piezas lleva cada papel.
 *
 * El Anexo 04 se emitía **por bloque**. Pero el Libro de Operaciones se
 * registra día por día —por eso cada bloque declara sus jornadas— y el papel
 * que respalda una jornada no puede traer las piezas de las otras (Brandon,
 * 2026-09-09: «si un bloque tiene 2 o más días, quiero que cada día tenga su
 * propio Anexo 04, y también poder juntarlos»).
 *
 * Acá vive lo común a los dos casos: convertir asignaciones —que guardan
 * MEDIDAS con su conteo (12 piezas de 2×8×10)— en las filas de pieza cubicada
 * que entiende el anexo, **sin recalcular ningún volumen**: el papel declara
 * exactamente lo que la pantalla repartió.
 */

import type { PiezaCubicada } from "./cubicacion";
import type { AsignacionGrupo, BloqueDistribuido } from "./cubicacion-reparto";

/**
 * Las piezas de un conjunto de asignaciones, en el formato del Anexo 04.
 *
 * `idBase` distingue las filas de un papel de las de otro cuando dos anexos
 * comparten medida: el id viaja como identidad de fila, no como dato del
 * formato.
 */
export function piezasDeGrupos(
  grupos: readonly AsignacionGrupo[],
  especie: string,
  idBase: string,
): PiezaCubicada[] {
  const out: PiezaCubicada[] = [];
  for (const g of grupos) {
    for (const m of g.medidas) {
      if (m.piezas <= 0) continue;
      out.push({
        id: `${idBase}-${g.clave}-${m.clave}`,
        cantidad: m.piezas,
        espesor: m.espesor,
        ancho: m.ancho,
        largo: m.largo,
        uEspesor: m.uEspesor as PiezaCubicada["uEspesor"],
        uAncho: m.uAncho as PiezaCubicada["uAncho"],
        uLargo: m.uLargo as PiezaCubicada["uLargo"],
        especie,
        /* El tipo se conserva: el Anexo 04 abre UN bloque por especie + tipo de
           producto, así que perderlo mezclaría paquetería con comercial. */
        tipo: g.label as PiezaCubicada["tipo"],
        pieTablar: m.pieTablar,
        m3: m.m3,
      });
    }
  }
  return out;
}

/** Todas las piezas del bloque (todas sus jornadas juntas). */
export const piezasDelBloque = (b: BloqueDistribuido, especie: string): PiezaCubicada[] =>
  piezasDeGrupos(b.asignado, especie, b.bloque.id);

/** Las piezas de UNA jornada del bloque. */
export function piezasDelDia(
  b: BloqueDistribuido,
  dia: number,
  especie: string,
): PiezaCubicada[] {
  const jornada = b.porDia.find((d) => d.dia === dia);
  return jornada ? piezasDeGrupos(jornada.grupos, especie, `${b.bloque.id}-d${dia}`) : [];
}

/**
 * La clave con la que se elige qué entra al Anexo 04 conjunto.
 *
 * Sin día = el bloque entero, que es como funcionaba antes de las jornadas —
 * por eso las claves viejas guardadas en `localStorage` siguen valiendo.
 */
export const claveAnexo = (bloqueId: string, dia?: number | null): string =>
  dia == null ? bloqueId : `${bloqueId}#${dia}`;

/** Lee una clave de selección. `dia: null` = el bloque entero. */
export function leerClaveAnexo(clave: string): { bloqueId: string; dia: number | null } {
  const i = clave.lastIndexOf("#");
  if (i < 0) return { bloqueId: clave, dia: null };
  const dia = Number(clave.slice(i + 1));
  return Number.isFinite(dia)
    ? { bloqueId: clave.slice(0, i), dia }
    : { bloqueId: clave, dia: null };
}

/**
 * Marcar un día y el bloque entero a la vez duplicaría esas piezas en el papel.
 * Al tildar uno se suelta el otro: elegir «el bloque» o «estos días», nunca los
 * dos.
 */
export function alternarClaveAnexo(seleccion: ReadonlySet<string>, clave: string): Set<string> {
  const next = new Set(seleccion);
  if (next.has(clave)) {
    next.delete(clave);
    return next;
  }
  const { bloqueId, dia } = leerClaveAnexo(clave);
  if (dia == null) {
    // El bloque entero se lleva por delante a sus días.
    for (const k of next) if (leerClaveAnexo(k).bloqueId === bloqueId) next.delete(k);
  } else {
    next.delete(bloqueId);
  }
  next.add(clave);
  return next;
}
