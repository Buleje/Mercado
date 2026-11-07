/**
 * dias-abiertos.ts — qué DÍAS del período quedaron sin NINGUNA marca (ADR-417).
 *
 * Medido el 2026-09-15 contra la base real de Blas: del 1 al 15 de setiembre
 * hay **8 días sin una sola marca de nadie** (del 01 al 07 y el 13; el 06 y el
 * 13 cayeron domingo). Nadie avisa: la hoja del día sólo muestra el día que
 * estás mirando, así que quien vuelve después de una semana no tiene dónde ver
 * cuáles quedaron abiertos.
 *
 * Ojo con el nombre: el `sinMarcar` que ya existe (`lib/rrhh/ganado.ts` y
 * `conteo-mes.ts`) es **por persona** — «a Ana le faltan 3 días». Acá la
 * pregunta es la otra: **qué días no abrió nadie**.
 *
 * ## Qué cuenta como «abierto» (decidido acá, a propósito)
 *
 * | Caso | ¿Abierto? | Por qué |
 * |---|---|---|
 * | Día futuro | No | Todavía no pasó: no puede tener marcas |
 * | Hoy | No | La jornada recién empieza y se marca a la salida. Avisarlo a las 8 a. m. sería un rojo falso TODOS los días, y un aviso siempre encendido se deja de mirar |
 * | Día con 1 sola marca de 1 sola persona | No | Alguien ya abrió ese día; lo que falte ahí es por persona, y eso ya lo cuenta `conteo-mes.ts` |
 * | Día sin nadie vigente (antes del ingreso, tras el cese, no ACTIVO) | No | No había a quién marcar. Mismo criterio que `estaIncluidoEseDia` |
 * | Día fuera de la ventana de corrección del rol | No | Al almacenero (ventana hoy−2…hoy) el servidor le va a rechazar la marca: sería un aviso sin acción posible |
 * | Domingo | **Sí** | No hay calendario de feriados ni de descansos en el sistema. Inventar uno sería peor que no avisar: cada día viaja con el nombre de su día de la semana para que quien mira juzgue («ah, el 13 fue domingo») |
 *
 * `hoy` llega del servidor (`HojaAsistenciaDTO.hoy`, zona Lima), nunca del
 * reloj del navegador: un equipo con la zona mal configurada correría el
 * criterio un día entero.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import { NOMBRES_MES, dateDeFechaKey, etiquetaDia } from "@/lib/rrhh/fechas";
import { dentroDeVentana, estaIncluidoEseDia, type VentanaMarcado } from "../rrhh-ui";
import type { ColaboradorMinDTO, FechaKey } from "@/lib/rrhh/tipos";

export interface DiaAbierto {
  fecha: FechaKey;
  /** `"domingo"`, `"lunes"`… — el usuario juzga si ese día se trabajaba. */
  diaSemana: string;
  /** El domingo no es feriado por sistema, pero es el candidato obvio a «no se trabajó». */
  esDomingo: boolean;
  /** `"domingo 13/09"` — el nombre completo, para el `aria-label` del chip. */
  etiqueta: string;
}

export interface EntradaDiasAbiertos {
  /** Los días del período en orden (`rangoDeDias(desde, hasta)`). */
  dias: readonly FechaKey[];
  /** Las marcas vivas del período, de cualquier persona: alcanza UNA para cerrar el día. */
  marcas: readonly { fecha: FechaKey }[];
  /** El «hoy» del servidor (`hoja.hoy`), no el reloj del navegador. */
  hoy: FechaKey;
  /** Quiénes podían trabajar. Si se omite, no se filtra por vigencia. */
  colaboradores?: readonly ColaboradorMinDTO[];
  /** La ventana de corrección del rol (`hoja.ventana`). Si se omite, no se filtra. */
  ventana?: VentanaMarcado | null;
}

/**
 * El nombre largo del día vive en `fechas.ts` (`DIAS_LARGOS`, privado) y sale
 * como primera palabra de `etiquetaDia` («domingo 13/09»). Se toma de ahí en
 * vez de re-escribir la lista: una segunda copia es justo donde se cuela el
 * desfase de un día.
 */
function describir(fecha: FechaKey): DiaAbierto {
  const etiqueta = etiquetaDia(fecha);
  return {
    fecha,
    diaSemana: etiqueta.split(" ")[0],
    esDomingo: dateDeFechaKey(fecha).getUTCDay() === 0,
    etiqueta,
  };
}

/** Los días del período que nadie marcó, en orden, del más viejo al más nuevo. */
export function diasAbiertos({ dias, marcas, hoy, colaboradores, ventana }: EntradaDiasAbiertos): DiaAbierto[] {
  const conMarca = new Set(marcas.map((m) => m.fecha));
  const abiertos: DiaAbierto[] = [];
  for (const fecha of dias) {
    // Fechas `YYYY-MM-DD`: el orden alfabético ES el cronológico, así que
    // `>= hoy` deja fuera el futuro y el día de hoy de una sola pasada.
    if (fecha >= hoy) continue;
    if (conMarca.has(fecha)) continue;
    if (ventana && !dentroDeVentana(fecha, ventana)) continue;
    if (colaboradores && !colaboradores.some((c) => estaIncluidoEseDia(c, fecha))) continue;
    abiertos.push(describir(fecha));
  }
  return abiertos;
}

/** «Quedaron 8 días sin marcar en setiembre» — en singular cuando es uno solo. */
export function tituloDiasAbiertos(abiertos: readonly DiaAbierto[], mes: string): string {
  const n = abiertos.length;
  const nombreMes = NOMBRES_MES[Number(mes.slice(5, 7)) - 1] ?? "";
  const cuerpo = n === 1 ? "Quedó 1 día sin marcar" : `Quedaron ${n} días sin marcar`;
  return nombreMes ? `${cuerpo} en ${nombreMes}` : cuerpo;
}

/**
 * «2 son domingos» — el matiz que evita el susto. `null` si no hay ninguno:
 * no se escribe «0 son domingos», que no le dice nada a nadie.
 */
export function notaDomingos(abiertos: readonly DiaAbierto[]): string | null {
  const n = abiertos.filter((d) => d.esDomingo).length;
  if (n === 0) return null;
  return n === 1 ? "1 es domingo" : `${n} son domingos`;
}
