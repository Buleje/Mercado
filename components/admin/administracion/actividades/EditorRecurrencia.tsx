"use client";

/**
 * EditorRecurrencia — cuándo se repite una actividad, dicho en una frase que
 * se arma mientras eliges («Cada lunes y jueves a las 09:00», «El día 5 de
 * cada mes»). Los días van de lunes a domingo, como el calendario.
 */
import { useId } from "react";
import { CAMPO_ALTO, claseChip } from "@/components/admin/planificacion/piezas/clases";
import { Field } from "@/components/admin/shared/Field";
import { cn } from "@/lib/utils";
import type { FrecuenciaAgenda, Recurrencia } from "@/lib/agenda/tipos";
import { DIAS_INICIAL, DIAS_LARGOS, ORDEN_SEMANA } from "../comun/fechas";
import { textoRecurrencia } from "../comun/recurrencia-texto";
import { cambiarFrecuencia } from "./use-actividad-form";

/** «Días de la semana» cubre diaria y semanal: con los 7 días es diaria. */
type Modo = "dias" | "quincenal" | "mensual" | "cada_n_dias" | "una_vez";

const MODOS: readonly { clave: Modo; rotulo: string }[] = [
  { clave: "dias", rotulo: "Días de la semana" },
  { clave: "quincenal", rotulo: "Semana por medio" },
  { clave: "mensual", rotulo: "Un día del mes" },
  { clave: "cada_n_dias", rotulo: "Cada tantos días" },
  { clave: "una_vez", rotulo: "Una sola vez" },
];

const ATAJOS_DIAS: readonly { rotulo: string; dias: number[] }[] = [
  { rotulo: "Todos", dias: [0, 1, 2, 3, 4, 5, 6] },
  { rotulo: "Lun a sáb", dias: [1, 2, 3, 4, 5, 6] },
  { rotulo: "Lun a vie", dias: [1, 2, 3, 4, 5] },
];

const modoDe = (f: FrecuenciaAgenda): Modo => (f === "diaria" || f === "semanal" ? "dias" : f);
const iguales = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x) => b.includes(x));

interface Props {
  valor: Recurrencia;
  hora: string;
  onCambiar: (r: Recurrencia) => void;
}

export function EditorRecurrencia({ valor: r, hora, onCambiar }: Props) {
  const id = useId();
  const modo = modoDe(r.frecuencia);
  const conDias = modo === "dias" || modo === "quincenal";

  const elegirModo = (m: Modo) => onCambiar(cambiarFrecuencia(r, m === "dias" ? "semanal" : m));
  const ponerDias = (dias: number[]) => {
    const orden = [...new Set(dias)].sort((a, b) => a - b);
    const frecuencia: FrecuenciaAgenda = modo === "quincenal" ? "quincenal" : orden.length === 7 ? "diaria" : "semanal";
    onCambiar({ ...r, frecuencia, diasSemana: orden });
  };
  const alternarDia = (d: number) => ponerDias(r.diasSemana.includes(d) ? r.diasSemana.filter((x) => x !== d) : [...r.diasSemana, d]);

  return (
    <fieldset className="space-y-4">
      <legend className="sr-only">Cuándo se repite</legend>

      <div role="radiogroup" aria-label="Se repite" className="flex flex-wrap gap-2">
        {MODOS.map((m) => (
          <button key={m.clave} type="button" role="radio" aria-checked={modo === m.clave} className={claseChip(modo === m.clave)} onClick={() => elegirModo(m.clave)}>
            {m.rotulo}
          </button>
        ))}
      </div>

      {conDias && (
        <div className="space-y-2">
          <span id={`${id}-dias`} className="block text-sm font-semibold text-[var(--text-secondary)]">
            Qué días
          </span>
          <div role="group" aria-labelledby={`${id}-dias`} className="flex flex-wrap gap-1.5">
            {ORDEN_SEMANA.map((d) => {
              const activo = r.diasSemana.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={activo}
                  aria-label={DIAS_LARGOS[d]}
                  title={DIAS_LARGOS[d]}
                  onClick={() => alternarDia(d)}
                  className={cn(
                    "inline-flex size-12 items-center justify-center rounded-full border text-sm font-bold transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40",
                    activo
                      ? "border-[var(--accent)] bg-[var(--accent-ink)] text-white dark:bg-[var(--accent)] dark:text-[var(--surface-canvas)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]",
                  )}
                >
                  {DIAS_INICIAL[d]}
                </button>
              );
            })}
          </div>
          {modo === "dias" && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {ATAJOS_DIAS.map((a) => (
                <button
                  key={a.rotulo}
                  type="button"
                  className={cn("min-h-12 text-sm font-semibold underline-offset-4 hover:underline", iguales(a.dias, r.diasSemana) ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)]")}
                  onClick={() => ponerDias(a.dias)}
                >
                  {a.rotulo}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {modo === "mensual" && (
          <Field label="Qué día del mes" hint="Si el mes es más corto, toca el último día">
            <select className={CAMPO_ALTO} value={r.diaMes ?? 1} onChange={(e) => onCambiar({ ...r, diaMes: Number(e.target.value) })}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n === 31 ? "El último" : `El ${n}`}
                </option>
              ))}
            </select>
          </Field>
        )}
        {modo === "cada_n_dias" && (
          <Field label="Cada cuántos días">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={366}
              className={CAMPO_ALTO}
              value={r.cadaN ?? ""}
              onChange={(e) => onCambiar({ ...r, cadaN: e.target.value === "" ? null : Math.max(1, Math.min(366, Math.round(Number(e.target.value)))) })}
            />
          </Field>
        )}
        <Field label={modo === "una_vez" ? "Qué día" : "Desde"}>
          <input type="date" className={CAMPO_ALTO} value={r.desde} onChange={(e) => e.target.value && onCambiar({ ...r, desde: e.target.value })} required />
        </Field>
        {modo !== "una_vez" && (
          <Field label="Hasta (opcional)" hint="Vacío = sin fin">
            <input type="date" className={CAMPO_ALTO} value={r.hasta ?? ""} min={r.desde} onChange={(e) => onCambiar({ ...r, hasta: e.target.value || null })} />
          </Field>
        )}
      </div>

      <p className="rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]" aria-live="polite">
        {r.frecuencia !== "una_vez" && conDias && r.diasSemana.length === 0 ? "Elige al menos un día" : textoRecurrencia(r, hora || null)}
      </p>
    </fieldset>
  );
}
