"use client";

/**
 * «Caja de hoy» con la caja cerrada: lo que sirve para empezar el día, sin
 * inventar nada. El último cierre (cuánto se contó, cuánto se esperaba y la
 * diferencia, o «sin conteo» si se cerró sola) con su parte, y los cierres
 * anteriores para ver de un vistazo si vienen cuadrando. «Abrir caja» está en
 * la cabecera, en la misma fila del título.
 *
 * Antes era una tarjeta de una línea y el resto de la pantalla, vacío.
 */
import { CardTitle } from "@buleje/design-system";
import { ChevronRight, Lock } from "@buleje/design-system/icons";
import DesdeTurno from "@/components/admin/arqueo/DesdeTurno";
import { esCierreAutomatico } from "@/lib/caja/arqueo-veredicto";
import { formatTime } from "@/lib/format";
import { diaConNombre } from "@/lib/gastos/lista-gastos";
import { cn, limaDateKey } from "@/lib/utils";
import { fmt, type CashRegister } from "./tipos";

interface Props {
  cerradas: CashRegister[];
  tolerancia: number;
  onVerCaja: (r: CashRegister) => void;
  onVerHistorial: () => void;
}

const ANTERIORES = 4;

/** «jueves 09/10, 18:10»: el día con su nombre, como se dice en la bodega. */
const cuando = (r: CashRegister) => {
  const iso = r.closedAt ?? r.openedAt;
  return `${diaConNombre(limaDateKey(iso))}, ${formatTime(iso)}`;
};

function Diferencia({ caja, tolerancia }: { caja: CashRegister; tolerancia: number }) {
  /* Cierre automático = nadie contó: la diferencia 0 no es un cuadre. */
  if (esCierreAutomatico(caja.notes)) return <span className="font-semibold text-[var(--text-secondary)]">sin conteo</span>;
  const d = caja.difference ?? 0;
  const ok = Math.abs(d) <= tolerancia;
  return (
    <span className={cn("font-bold tabular-nums", ok ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]")}>
      {d > 0 ? "+" : d < 0 ? "−" : ""}
      {fmt(Math.abs(d))}
    </span>
  );
}

export function CajaCerrada({ cerradas, tolerancia, onVerCaja, onVerHistorial }: Props) {
  const [ultima, ...resto] = cerradas;
  const anteriores = resto.slice(0, ANTERIORES);

  return (
    <div className="space-y-3">
      <DesdeTurno />
      <section className="grid overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] sm:divide-x sm:divide-[var(--rule-soft)]">
        <div className="flex items-start gap-3 p-4 sm:p-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-sunken)]" aria-hidden>
            <Lock className="h-6 w-6 text-[var(--text-secondary)]" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="text-base font-bold text-[var(--text-primary)]">{ultima ? "Último cierre" : "Todavía no cerraste una caja"}</CardTitle>
            {ultima ? (
              <>
                <p className="text-sm text-[var(--text-secondary)]">{cuando(ultima)}</p>
                <dl className="grid grid-cols-3 gap-2 pt-1 text-sm">
                  <div>
                    <dt className="text-[var(--text-secondary)]">Esperado</dt>
                    <dd className="font-bold tabular-nums text-[var(--text-primary)]">{fmt(ultima.expectedAmount ?? 0)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-secondary)]">Contado</dt>
                    <dd className="font-bold tabular-nums text-[var(--text-primary)]">{esCierreAutomatico(ultima.notes) ? "—" : fmt(ultima.closingAmount ?? 0)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-secondary)]">Diferencia</dt>
                    <dd>
                      <Diferencia caja={ultima} tolerancia={tolerancia} />
                    </dd>
                  </div>
                </dl>
                <button type="button" onClick={() => onVerCaja(ultima)} className="-ml-3 inline-flex min-h-12 items-center gap-1 rounded-xl px-3 text-sm font-bold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]">
                  Ver el parte de ese día <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">Abre una caja para registrar las ventas en efectivo del día.</p>
            )}
          </div>
        </div>

        {anteriores.length > 0 && (
          <div className="border-t border-[var(--rule-soft)] p-4 sm:border-t-0 sm:p-5">
            <div className="mb-1 flex items-center gap-2">
              <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Cierres anteriores</CardTitle>
              <button type="button" onClick={onVerHistorial} className="ml-auto inline-flex min-h-12 items-center gap-1 rounded-xl px-3 text-sm font-bold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]">
                Ver el historial <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="flex gap-3 px-2 pb-1 text-sm text-[var(--text-secondary)]" aria-hidden>
              <span className="flex-1">Cierre</span>
              <span>Contado</span>
              <span className="w-24 text-right">Diferencia</span>
            </div>
            <ul className="divide-y divide-[var(--rule-soft)]" aria-label="Cierres anteriores: contado y diferencia">
              {anteriores.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => onVerCaja(r)} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left text-sm hover:bg-[var(--surface-sunken)]">
                    <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{cuando(r)}</span>
                    <span className="tabular-nums text-[var(--text-secondary)]">{esCierreAutomatico(r.notes) ? "—" : fmt(r.closingAmount ?? 0)}</span>
                    <span className="w-24 text-right">
                      <Diferencia caja={r} tolerancia={tolerancia} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
