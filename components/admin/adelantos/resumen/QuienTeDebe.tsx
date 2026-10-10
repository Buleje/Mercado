import { CardTitle } from "@buleje/design-system";
import { ChevronRight, MessageCircle } from "@buleje/design-system/icons";
import { enlaceWhatsApp } from "@/lib/adelantos/contacto";
import { TRAMOS, tramoDe } from "@/lib/adelantos/gestion-cobranza";
import { explicarAtraso, type DeudorCobranza } from "@/lib/adelantos/urgencia-cobranza";
import { fmtMon, fmtMonedas } from "../shared";
import type { PorMoneda } from "./tipos";

/**
 * Quién te debe — deudores (no adelantos sueltos) ordenados por urgencia real.
 *
 * Antes era la lista de ADELANTOS abiertos (una fila por cada uno, aunque sean
 * tres de la misma persona) ordenada sólo por monto. `deudoresDeCobranza`
 * agrupa por PERSONA y `ordenarPorUrgencia` prioriza el compromiso roto (una
 * pactada o un vencimiento incumplido) sobre la mera antigüedad — es la misma
 * regla que usa la pestaña Cobranza, no una nueva.
 */
export default function QuienTeDebe({
  deudores,
  saldoMap,
  onGoTab,
}: {
  /** Ya ordenados por urgencia. */
  deudores: DeudorCobranza[];
  /** El saldo de los abiertos, por moneda: el mismo número del encabezado. */
  saldoMap: PorMoneda;
  onGoTab: (tab: string) => void;
}) {
  if (deudores.length === 0) return null;
  const porTramo = TRAMOS.map((t) => ({ ...t, n: deudores.filter((d) => tramoDe(d.dias) === t.id).length })).filter(
    (t) => t.n > 0,
  );

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Quién te debe ({deudores.length})</CardTitle>
        <button onClick={() => onGoTab("cobranza")} className="inline-flex items-center gap-1 text-base font-bold text-primary hover:underline">
          Ver todos <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Distribución por antigüedad — mismos tramos y colores que Cobranza */}
      {porTramo.length > 1 && (
        <div className="mb-3">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            {porTramo.map((t) => (
              <div
                key={t.id}
                style={{ width: `${(t.n / deudores.length) * 100}%`, backgroundColor: t.tono }}
                title={`${t.label}: ${t.n}`}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {porTramo.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: t.tono }} />
                {t.label}: <strong className="text-[var(--text-secondary)]">{t.n}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      <ul className="divide-y divide-[var(--rule-soft)]">
        {deudores.slice(0, 5).map((d) => {
          const tramo = TRAMOS.find((t) => t.id === tramoDe(d.dias)) ?? TRAMOS[0];
          const wa = enlaceWhatsApp(d.telefono, d.nombre, d.saldo, d.moneda);
          return (
            <li key={d.id} className="flex items-center gap-3 py-2.5">
              {/* Fila informativa: las cinco llevaban a Cobranza, igual que
                  «Ver todos» — un solo camino, no cinco botones iguales. */}
              <div className="-mx-1 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left">
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-extrabold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                  {d.nombre.charAt(0).toUpperCase()}
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-[var(--surface-raised)]"
                    style={{ backgroundColor: tramo.tono }}
                    title={tramo.label}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold text-[var(--text-primary)]">{d.nombre}</span>
                  <span className="block truncate text-sm text-[var(--text-tertiary)]">{explicarAtraso(d)}</span>
                </span>
              </div>
              <span className="shrink-0 tabular-nums text-base font-extrabold text-[var(--data-warning)]">{fmtMon(d.saldo, d.moneda)}</span>
              {wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Recordarle a ${d.nombre} por WhatsApp`}
                  aria-label={`Recordarle a ${d.nombre} por WhatsApp`}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-[var(--text-secondary)] transition-colors hover:bg-primary/12 hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
                >
                  <MessageCircle className="h-4 w-4" />
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex items-center justify-between border-t-2 border-[var(--rule-base)] pt-3">
        <span className="text-base font-bold text-[var(--text-secondary)]">Total por recuperar</span>
        <span className="tabular-nums text-lg font-extrabold text-[var(--data-warning)]">{fmtMonedas(saldoMap)}</span>
      </div>
    </div>
  );
}
