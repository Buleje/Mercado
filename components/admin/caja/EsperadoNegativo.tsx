"use client";

/**
 * Caja › Hoy: «El esperado da S/ −x: lo bajan estos egresos» (M26, 17-10).
 *
 * Antes sólo había un aviso que decía «revisa los egresos antes de cerrar» sin
 * decir cuáles. Ahora abre los tres egresos en efectivo más grandes de la
 * sesión, con su día, su origen y cómo quedaría el esperado si no hubiera
 * salido del cajón, y lleva a Movimientos con ese egreso buscado: ahí se
 * corrige el medio (la corrección queda en el movimiento). Nunca ofrece un
 * ingreso para compensar.
 */
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useCierreACiegas } from "@/components/admin/turnos/cierre-a-ciegas";
import { fechaCortaLima } from "@/lib/caja/caja-abierta";
import { origenDeMovimiento } from "@/lib/caja/origen-movimiento";
import { formatTime } from "@/lib/format";
import { limaDateKey } from "@/lib/utils";
import { egresosQueBajanElEsperado } from "./esperado-negativo";
import { acortarIds, fmt, type CashRegister } from "./tipos";

interface Props {
  caja: CashRegister;
  esperado: number;
  /** Lleva a Movimientos con el texto ya buscado. */
  onVerMovimiento: (busqueda: string) => void;
}

export function EsperadoNegativo({ caja, esperado, onVerMovimiento }: Props) {
  /* Cierre a ciegas: el cajero no ve el esperado; tampoco este desglose. */
  const { ciego } = useCierreACiegas();
  if (ciego !== false || esperado >= 0) return null;

  const egresos = egresosQueBajanElEsperado(caja.movements, esperado);
  const variosDias = limaDateKey(caja.openedAt) !== limaDateKey();

  return (
    <section aria-labelledby="esperado-negativo" className="rounded-2xl border border-[var(--data-error-500)]/40 bg-[var(--surface-raised)]" data-qa="esperado-negativo">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--rule-soft)] px-4 py-3">
        <CardTitle id="esperado-negativo" className="text-sm font-bold text-[var(--text-primary)]">
          El esperado da <span className="tabular-nums text-[var(--data-error-ink)]">{fmt(esperado)}</span>
          {egresos.length > 0 ? ": lo bajan estos egresos" : ""}
        </CardTitle>
        <InfoTip
          title="Un cajón no puede tener menos de cero"
          what="Casi siempre es un egreso anotado en efectivo que en verdad salió por Yape o transferencia, o una caja abierta hace días que junta varios turnos."
          affects="No lo tapes con un ingreso que no entró: corrige el medio del egreso en Movimientos (queda anotado en ese movimiento) o cuenta lo que hay y cierra la sesión."
          example="Un adelanto de S/ 3.642 pagado por transferencia pero anotado en efectivo baja el esperado en S/ 3.642."
        />
      </div>
      {variosDias && (
        <p className="border-b border-[var(--rule-soft)] px-4 py-2 text-sm text-[var(--text-secondary)]">
          La caja está abierta desde el {fechaCortaLima(caja.openedAt)}: el esperado junta todos esos días.
        </p>
      )}
      {egresos.length === 0 ? (
        <p className="px-4 py-4 text-sm text-[var(--text-secondary)]">No hay egresos en efectivo: revisa la apertura en Movimientos.</p>
      ) : (
        <ul className="divide-y divide-[var(--rule-soft)]">
          {egresos.map(({ mov, monto, esperadoSinEl }) => (
            <li key={mov.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
              <span className="w-28 shrink-0 text-sm text-[var(--text-secondary)]">
                {variosDias && <span className="block font-semibold text-[var(--text-primary)]">{fechaCortaLima(mov.createdAt)}</span>}
                {formatTime(mov.createdAt)}
              </span>
              <span className="min-w-0 flex-1 basis-40">
                <span className="block truncate text-sm font-semibold text-[var(--text-primary)]" title={mov.description}>
                  {origenDeMovimiento(mov).etiqueta} · {acortarIds(mov.description) || "Sin concepto"}
                </span>
                <span className="block text-sm text-[var(--text-secondary)]">
                  Si no salió en efectivo, el esperado queda en <strong className="tabular-nums text-[var(--text-primary)]">{fmt(esperadoSinEl)}</strong>
                </span>
              </span>
              <span className="shrink-0 text-base font-bold tabular-nums text-[var(--data-error-ink)]">−{fmt(monto)}</span>
              <button
                type="button"
                onClick={() => onVerMovimiento(mov.description)}
                className="h-12 shrink-0 rounded-xl px-3 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]"
              >
                Ver en Movimientos
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
