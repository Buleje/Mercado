"use client";

/**
 * El mes de «Por vencer»: cada día con lo que vence (rojo si ya pasó, ámbar si
 * viene). Tocar un día deja en la lista de al lado sólo lo de ese día.
 *
 * Salió de la pestaña Análisis (`FiadoStats`, 10-10). Los días se arman con el
 * día de Lima (`diaDe`), no con la hora local del navegador.
 */
import { useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight } from "@buleje/design-system/icons";
import { formatCurrencyCompact } from "@/lib/format";
import { cn, limaDateKey } from "@/lib/utils";
import type { VencimientoDelDia } from "./cifras-me-deben";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

type Props = {
  /** Lo que vence por día (`YYYY-MM-DD` de Lima); un día sólo con promesas marca 0. */
  porDia: ReadonlyMap<string, VencimientoDelDia>;
  elegido: string | null;
  onElegir: (dia: string | null) => void;
};

export default function CalendarioVencimientos({ porDia, elegido, onElegir }: Props) {
  const hoy = limaDateKey();
  const [mes, setMes] = useState(() => ({ y: Number(hoy.slice(0, 4)), m: Number(hoy.slice(5, 7)) - 1 }));
  const mover = (delta: number) => setMes((p) => {
    const d = new Date(Date.UTC(p.y, p.m + delta, 1));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  });

  const diasDelMes = new Date(Date.UTC(mes.y, mes.m + 1, 0)).getUTCDate();
  const huecos = (new Date(Date.UTC(mes.y, mes.m, 1)).getUTCDay() + 6) % 7;
  const clave = (d: number) => `${mes.y}-${String(mes.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  let totalMes = 0;
  for (let d = 1; d <= diasDelMes; d++) totalMes += porDia.get(clave(d))?.monto ?? 0;

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button type="button" onClick={() => mover(-1)} aria-label="Mes anterior" className="flex h-12 w-12 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]">
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <p className="text-center text-sm font-bold text-[var(--text-primary)]">
          <span className="capitalize">{MESES[mes.m]}</span> {mes.y}
          {totalMes > 0 && <span className="block font-semibold tabular-nums text-[var(--text-secondary)]">vence {formatCurrencyCompact(totalMes)}</span>}
        </p>
        <button type="button" onClick={() => mover(1)} aria-label="Mes siguiente" className="flex h-12 w-12 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]">
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-1" aria-hidden>
        {SEMANA.map((d) => <span key={d} className="py-1 text-center text-sm font-semibold text-[var(--text-secondary)]">{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: huecos }, (_, i) => <span key={`h${i}`} />)}
        {Array.from({ length: diasDelMes }, (_, i) => {
          const d = i + 1;
          const k = clave(d);
          const v = porDia.get(k);
          const paso = k < hoy;
          const esElegido = elegido === k;
          return (
            <button
              key={k}
              type="button"
              disabled={!v}
              aria-pressed={v ? esElegido : undefined}
              onClick={() => onElegir(esElegido ? null : k)}
              aria-label={v ? `Día ${d}: ${v.cuantos} por cobrar${v.monto > 0 ? `, ${formatCurrencyCompact(v.monto)}` : " (promesa de pago)"}` : `Día ${d}: nada vence`}
              className={cn(
                "flex min-h-12 flex-col items-center justify-start gap-0.5 rounded-xl p-1 text-center transition-colors disabled:cursor-default",
                k === hoy && "ring-2 ring-[var(--accent)]",
                v && paso && "bg-[var(--data-error-500)]/10",
                v && !paso && "bg-[var(--data-warning-500)]/12",
                v && "hover:bg-[var(--surface-sunken)]",
                esElegido && "bg-primary/15 ring-2 ring-[var(--accent)]",
              )}
            >
              <span className={cn("text-sm font-bold leading-tight", k === hoy ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-primary)]")}>{d}</span>
              {v && v.monto > 0 && (
                <span className={cn("text-sm font-bold leading-none tabular-nums", paso ? "text-[var(--data-error-ink)]" : "text-[var(--data-warning-ink)]")}>
                  {formatCurrencyCompact(v.monto).replace("S/ ", "")}
                </span>
              )}
              {v && v.monto === 0 && (
                <CalendarClock className={cn("h-4 w-4", paso ? "text-[var(--data-error-ink)]" : "text-[var(--data-warning-ink)]")} aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
