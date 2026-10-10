"use client";

/** Calendario de la semana en curso (lunes a domingo), con el turno abierto incluido. */
import { formatCurrency, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { cajeroColor, cajeroColorText, DIAS_SEMANA, type Turno } from "./tipos";

export function turnosDeLaSemana(turnos: Turno[], ahora = new Date()): Map<number, Turno[]> {
  const inicio = new Date(ahora);
  inicio.setDate(inicio.getDate() - inicio.getDay() + (inicio.getDay() === 0 ? -6 : 1));
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 7);
  const mapa = new Map<number, Turno[]>();
  for (const t of turnos) {
    const d = new Date(t.abrioEn);
    if (d < inicio || d >= fin) continue;
    const dia = (d.getDay() + 6) % 7; // Lun=0..Dom=6
    mapa.set(dia, [...(mapa.get(dia) ?? []), t]);
  }
  return mapa;
}

export function TurnosSemana({ turnos, nombreDe }: { turnos: Turno[]; nombreDe: (t: Turno) => string }) {
  const semana = turnosDeLaSemana(turnos);
  if (semana.size === 0) {
    return <p className="p-6 text-center text-sm text-[var(--text-tertiary)]">Esta semana todavía no hay turnos.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-7 min-w-[700px]">
        {DIAS_SEMANA.map((dia, idx) => {
          const delDia = semana.get(idx) ?? [];
          return (
            <div key={dia} className={cn("border-r border-[var(--rule-soft)] last:border-r-0", idx >= 5 && "bg-[var(--surface-sunken)]")}>
              <p className="px-2 py-2 border-b border-[var(--rule-soft)] text-center text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">{dia}</p>
              <div className="p-2 min-h-[96px] space-y-1.5">
                {delDia.length === 0 ? (
                  <p className="text-sm text-[var(--text-tertiary)] text-center py-3">—</p>
                ) : delDia.map((t) => (
                  <div key={t.id} className="rounded-lg p-2 text-xs leading-tight" style={{ backgroundColor: cajeroColor(t.adminUserId), color: cajeroColorText(t.adminUserId) }}>
                    <p className="font-semibold truncate">{nombreDe(t)}</p>
                    <p className="opacity-80">{formatTime(t.abrioEn)}{t.cerroEn ? ` - ${formatTime(t.cerroEn)}` : " - abierto"}</p>
                    <p className="font-bold tabular-nums">{formatCurrency(t.ventasTotal)}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
