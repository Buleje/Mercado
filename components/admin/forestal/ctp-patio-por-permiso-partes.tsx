/**
 * Las celdas que comparten «Por permiso» y las tablas de «Trozas disponibles»:
 * los días con su severidad en texto, la fecha de la más vieja y lo que espera
 * recepcionar. Salieron de `CtpPatioPorPermiso` (2026-09-27) cuando la tabla
 * de especies necesitó la misma pastilla de días.
 */

import type { FechaConDias, FilaPermisoPatio } from "@/lib/forestal/patio-resumen";
import { SEVERIDAD_TRAMO_DIAS, TONO_TRAMO_DIAS, tramoDeDias } from "@/lib/forestal/patio-dias";
import { diaConNombre, fechaCorta } from "@/lib/forestal/plazo-de-apartado";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";

const nf = (n: number) => formatNumber(n);
const trozas = (n: number) => `${nf(n)} troza${n === 1 ? "" : "s"}`;

const TONO_PASTILLA = {
  ok: "bg-[var(--data-success-500)]/15",
  warn: "bg-[var(--data-warning-500)]/20",
  danger: "bg-[var(--data-error-500)]/15",
} as const;

/** Días con su severidad EN TEXTO: el tramo nunca va sólo en color (WCAG 1.4.1). */
export function Dias({ dias }: { dias: number }) {
  const tramo = tramoDeDias(dias);
  if (!tramo) return null;
  const severidad = SEVERIDAD_TRAMO_DIAS[tramo];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-1.5 py-0.5 text-sm font-semibold text-[var(--text-primary)] ${TONO_PASTILLA[TONO_TRAMO_DIAS[tramo]]}`}
    >
      {nf(dias)} {dias === 1 ? "día" : "días"}{severidad !== "fresca" ? ` · ${severidad}` : ""}
    </span>
  );
}

/**
 * Fecha y días en UN renglón (2026-09-24): en dos, cada fila de la tabla medía
 * ~52 px y «Por permiso» empujaba la tabla de trozas media pantalla abajo. El
 * día de la semana va en el `title` — la pastilla ya dice la edad.
 */
export function MasVieja({ fila }: { fila: { masVieja: FechaConDias | null } }) {
  if (!fila.masVieja) return <span className="text-[var(--text-secondary)]">—</span>;
  return (
    <span
      className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
      title={`Recibida el ${diaConNombre(fila.masVieja.fecha)}`}
    >
      <span className="whitespace-nowrap tabular-nums text-[var(--text-primary)]">
        {fechaCorta(fila.masVieja.fecha)}
      </span>
      <Dias dias={fila.masVieja.dias} />
    </span>
  );
}

export function PorRecepcionar({ p }: { p: FilaPermisoPatio["porRecepcionar"] }) {
  if (p.trozas === 0) return <span className="text-[var(--text-secondary)]">—</span>;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="whitespace-nowrap tabular-nums text-[var(--text-primary)]">
        {trozas(p.trozas)} · {fmtM3(p.m3)} m³
      </span>
      <span className="text-sm text-[var(--text-secondary)]">
        {p.guias === 1 ? "1 guía" : `${nf(p.guias)} guías`}
        {p.asientoMasViejo
          ? ` · asentada hace ${nf(p.asientoMasViejo.dias)} días (sin recepcionar)`
          : " sin recepcionar"}
      </span>
    </span>
  );
}
