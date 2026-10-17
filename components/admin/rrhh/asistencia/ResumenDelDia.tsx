/**
 * La línea de resumen de la hoja del día, junto a la fecha (noche 11-10).
 * Antes era una tarjeta con el número grande, una barra de progreso y la
 * casilla de reemplazar: 100 px para decir lo que entra en una línea.
 */
import { cn } from "@/lib/utils";
import { CLASE_CHIP } from "../rrhh-form";
import { ESTADO_ASISTENCIA_META, ORDEN_ESTADOS_ASISTENCIA, contarEstado, pluralizar } from "../rrhh-ui";
import type { EstadoAsistencia } from "@/lib/rrhh/tipos";

/** «2 de 6 marcados · 1 falta · 4 sin marcar» en una línea, junto a la fecha. */
export default function ResumenDelDia({ marcados, total, conteo }: { marcados: number; total: number; conteo: Record<EstadoAsistencia, number> }) {
  const sinMarcar = total - marcados;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--text-secondary)]" aria-live="polite">
      <span>
        <strong className="text-base font-bold tabular-nums text-[var(--text-primary)]">{marcados}</strong> de {total} marcados
      </span>
      {ORDEN_ESTADOS_ASISTENCIA.filter((e) => conteo[e] > 0).map((e) => (
        <span key={e} className={cn(CLASE_CHIP, ESTADO_ASISTENCIA_META[e].claseChip)}>
          {contarEstado(conteo[e], e)}
        </span>
      ))}
      {sinMarcar > 0 && <span className="font-semibold text-[var(--data-warning-ink)]">{pluralizar(sinMarcar, "sin marcar", "sin marcar")}</span>}
    </p>
  );
}
