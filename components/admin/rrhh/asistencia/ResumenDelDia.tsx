/**
 * La línea de resumen de la hoja del día, junto a la fecha (noche 11-10).
 * Antes era una tarjeta con el número grande, una barra de progreso y la
 * casilla de reemplazar: 100 px para decir lo que entra en una línea.
 *
 * 23-10: vive en la fila del título (`EncabezadoDeVista`, slot `periodo`).
 * Toma el espacio que sobra (`w-0 flex-1`: no empuja a las acciones a otra
 * fila) y lo que no entra se corta con «…»; la frase entera queda en el
 * `title`. Entre 58 y 76rem del encabezado queda «2/6» (la palabra va al
 * lector), los chips van con la letra de la hoja («3 P», la misma de los
 * botones y de la leyenda) y se calla el «sin marcar», que ya dice el «2/6».
 */
import { cn } from "@/lib/utils";
import { CLASE_CHIP } from "../rrhh-form";
import { ESTADO_ASISTENCIA_META, ORDEN_ESTADOS_ASISTENCIA, contarEstado, pluralizar } from "../rrhh-ui";
import type { EstadoAsistencia } from "@/lib/rrhh/tipos";

/** «2 de 6 marcados · 1 falta · 4 sin marcar»: la frase entera (para el `title` y los tests). */
export function fraseDelResumen(marcados: number, total: number, conteo: Record<EstadoAsistencia, number>): string {
  const sinMarcar = total - marcados;
  return [
    `${marcados} de ${total} marcados`,
    ...ORDEN_ESTADOS_ASISTENCIA.filter((e) => conteo[e] > 0).map((e) => contarEstado(conteo[e], e)),
    ...(sinMarcar > 0 ? [pluralizar(sinMarcar, "sin marcar", "sin marcar")] : []),
  ].join(" · ");
}

export default function ResumenDelDia({ marcados, total, conteo }: { marcados: number; total: number; conteo: Record<EstadoAsistencia, number> }) {
  const sinMarcar = total - marcados;
  return (
    <p
      className="text-sm text-[var(--text-secondary)] @min-[58rem]/enc:w-0 @min-[58rem]/enc:min-w-0 @min-[58rem]/enc:flex-1 @min-[58rem]/enc:truncate"
      aria-live="polite"
      title={fraseDelResumen(marcados, total, conteo)}
    >
      <span className="whitespace-nowrap">
        <strong className="text-base font-bold tabular-nums text-[var(--text-primary)]">{marcados}</strong>/{total}
        {/* Entre 58 y 76rem la fila aprieta: «0/6» y la palabra al lector y al tooltip (antes se cortaba en «0/6 …»). */}
        <span className="@min-[58rem]/enc:sr-only @min-[76rem]/enc:not-sr-only"> marcados</span>
      </span>
      {ORDEN_ESTADOS_ASISTENCIA.filter((e) => conteo[e] > 0).map((e) => (
        <span key={e} className={cn(CLASE_CHIP, "ml-2", ESTADO_ASISTENCIA_META[e].claseChip)} title={contarEstado(conteo[e], e)}>
          <span aria-hidden className="hidden @min-[58rem]/enc:inline @min-[76rem]/enc:hidden">
            {conteo[e]} {ESTADO_ASISTENCIA_META[e].letra}
          </span>
          <span className="@min-[58rem]/enc:sr-only @min-[76rem]/enc:not-sr-only">{contarEstado(conteo[e], e)}</span>
        </span>
      ))}
      {sinMarcar > 0 && (
        <span className="ml-2 whitespace-nowrap font-semibold text-[var(--data-warning-ink)] @min-[58rem]/enc:hidden @min-[76rem]/enc:inline">
          {pluralizar(sinMarcar, "sin marcar", "sin marcar")}
        </span>
      )}
    </p>
  );
}
