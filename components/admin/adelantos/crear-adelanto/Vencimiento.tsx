"use client";

/**
 * Para cuándo se acordó devolverlo.
 *
 * La cobranza medía ANTIGÜEDAD para todo adelanto sin plan de cuotas —o sea,
 * casi todos— y la antigüedad no es un incumplimiento: un adelanto de 45 días
 * que se devuelve el mes que viene salía «vencido». Con una fecha acordada acá,
 * cualquier adelanto tiene contra qué medirse sin obligar a armar cuotas.
 *
 * Los plazos van en botones porque así se habla: «en una semana», «a fin de
 * mes». Nadie dice «el 31 de agosto de 2026».
 */

import { CalendarClock, X } from "@buleje/design-system/icons";
import { inputCls } from "../shared";

const isoDia = (d: Date) => {
  const c = new Date(d);
  c.setMinutes(c.getMinutes() - c.getTimezoneOffset());
  return c.toISOString().slice(0, 10);
};

const enDias = (base: string, dias: number) => {
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return isoDia(d);
};

/** Fin del mes de la fecha del adelanto: el plazo más usado en una bodega. */
const finDeMes = (base: string) => {
  const d = new Date(`${base}T12:00:00`);
  return isoDia(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};

const PLAZOS = [
  { label: "1 semana", dias: 7 },
  { label: "15 días", dias: 15 },
  { label: "1 mes", dias: 30 },
] as const;

export default function Vencimiento({
  fechaAdelanto,
  vencimiento,
  onCambiar,
  /** Los días que esta persona suele tardar en devolver, si hay historial. */
  plazoHabitual,
}: {
  fechaAdelanto: string;
  vencimiento: string;
  onCambiar: (v: string) => void;
  plazoHabitual?: number | null;
}) {
  const chip = (activo: boolean) =>
    `inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-bold transition-colors ${
      activo
        ? "bg-primary/12 text-[var(--accent-ink)] ring-1 ring-primary/40 dark:text-[var(--accent)]"
        : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
    }`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        {PLAZOS.map((p) => {
          const f = enDias(fechaAdelanto, p.dias);
          return (
            <button key={p.dias} type="button" onClick={() => onCambiar(f)} className={chip(vencimiento === f)}>
              {p.label}
            </button>
          );
        })}
        <button type="button" onClick={() => onCambiar(finDeMes(fechaAdelanto))} className={chip(vencimiento === finDeMes(fechaAdelanto))}>
          Fin de mes
        </button>
        {/* Lo que esta persona TARDA de verdad, no lo que promete: sale del
            promedio de sus adelantos ya liquidados. */}
        {plazoHabitual != null && (
          <button
            type="button"
            onClick={() => onCambiar(enDias(fechaAdelanto, plazoHabitual))}
            title={`Suele devolver en ${plazoHabitual} días`}
            className={chip(vencimiento === enDias(fechaAdelanto, plazoHabitual))}
          >
            <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Su ritmo · {plazoHabitual}d
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={vencimiento}
          min={fechaAdelanto}
          onChange={(e) => onCambiar(e.target.value)}
          aria-label="Fecha de devolución acordada"
          className={`${inputCls} h-11 tabular-nums`}
        />
        {vencimiento && (
          <button
            type="button"
            onClick={() => onCambiar("")}
            aria-label="Quitar la fecha de devolución"
            title="Sin fecha acordada"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-[var(--text-tertiary)] transition-colors hover:text-[var(--data-error)]"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
