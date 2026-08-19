"use client";

/**
 * El plan pactado, del lado de la liquidación.
 *
 * Crear el plan ya se podía; CUMPLIRLO no: había que mirar la cuota, acordarse
 * del texto y del monto, y retipearlos abajo en el formulario de entrega. Peor,
 * la entrega quedaba suelta —sin `pactadaId`— así que la cuota seguía figurando
 * como pendiente para siempre y la cobranza la contaba como incumplida aunque
 * la persona hubiera entregado.
 *
 * `AdelantoEntregaPactada.cumplidaEn` y el `pactadaId` del endpoint existían
 * desde el principio: lo que faltaba era el botón.
 */

import { CalendarDays, CheckCircle, Clock } from "@buleje/design-system/icons";
import type { DbEntregaPactada } from "@/lib/db/adelantos.db";
import { fmtMon } from "../shared";

const dia = (iso: string) => new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" });

export default function PlanPactado({
  pactadas,
  moneda,
  bloqueado,
  onCumplir,
}: {
  pactadas: DbEntregaPactada[];
  moneda: string;
  /** El adelanto está cancelado o liquidado: se muestra, no se opera. */
  bloqueado: boolean;
  /** Prellena el formulario de entrega con esta cuota y la marca al guardar. */
  onCumplir: (p: DbEntregaPactada) => void;
}) {
  if (pactadas.length === 0) return null;

  const cumplidas = pactadas.filter((p) => p.cumplidaEn).length;
  const hoy = Date.now();

  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-2.5">
        <span className="text-sm font-extrabold uppercase tracking-wide text-[var(--text-secondary)]">
          Plan pactado · {cumplidas} de {pactadas.length} cumplidas
        </span>
        <span className="text-sm font-bold tabular-nums text-[var(--text-tertiary)]">
          {fmtMon(
            pactadas.filter((p) => !p.cumplidaEn).reduce((s, p) => s + p.valorEsperado, 0),
            moneda,
          )}{" "}
          por cumplir
        </span>
      </div>
      <ul className="divide-y divide-[var(--rule-soft)]">
        {pactadas.map((p) => {
          const cumplida = !!p.cumplidaEn;
          /* Vencida = tenía fecha, ya pasó, y nadie entregó. Sin fecha no hay
             incumplimiento que declarar: sólo una cuota abierta. */
          const vencida = !cumplida && !!p.fechaEsperada && new Date(p.fechaEsperada).getTime() < hoy;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold tabular-nums ${
                  cumplida
                    ? "bg-[var(--data-success)]/15 text-[var(--data-success)]"
                    : vencida
                      ? "bg-[var(--data-error)]/15 text-[var(--data-error)]"
                      : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                }`}
              >
                {cumplida ? <CheckCircle className="h-4 w-4" /> : p.numero}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-base font-bold ${
                    cumplida ? "text-[var(--text-tertiary)] line-through" : "text-[var(--text-primary)]"
                  }`}
                >
                  {p.descripcionEsperada}
                </span>
                <span className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)]">
                  {cumplida ? (
                    <>
                      <CheckCircle className="h-3.5 w-3.5 shrink-0 text-[var(--data-success)]" aria-hidden />
                      cumplida el {dia(p.cumplidaEn!)}
                    </>
                  ) : p.fechaEsperada ? (
                    <>
                      {vencida ? (
                        <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--data-error)]" aria-hidden />
                      ) : (
                        <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      )}
                      <span className={vencida ? "font-bold text-[var(--data-error)]" : ""}>
                        {vencida ? "vencida el" : "para el"} {dia(p.fechaEsperada)}
                      </span>
                    </>
                  ) : (
                    "sin fecha pactada"
                  )}
                </span>
              </span>
              <span className="shrink-0 text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                {fmtMon(p.valorEsperado, moneda)}
              </span>
              {!cumplida && !bloqueado && (
                <button
                  type="button"
                  onClick={() => onCumplir(p)}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border-2 border-primary px-3 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:bg-primary/10 dark:text-[var(--accent)]"
                >
                  <CheckCircle className="h-4 w-4" /> Cumplir
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
