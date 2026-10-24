"use client";

/**
 * Los avisos de «subir el lote a la cuenta de una persona», iguales en las dos
 * ventanas que lo hacen («Cuenta ▾ › Guardar en la cuenta» y «Guardar
 * cubicación», 24-10): lo que impide cobrar (ya descontada, está en el
 * despacho, la lista no cargó) se dice igual en los dos lados.
 */
import { AlertTriangle, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/currency";
import { BOTON_SECUNDARIO } from "./ctp-lotes-modal-marco";
import type { CubicacionTrozas } from "./hooks/use-cubicaciones-trozas";
import type { SubidaACuenta } from "./hooks/use-subir-madera-a-cuenta";

export const AVISO_CUENTA = "inline-flex items-center gap-1 font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";
export const ERROR_CUENTA = "flex items-start gap-1.5 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";
const CAJA_AVISO =
  "flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]";

/** Lo del lote mismo: piezas que no se pueden cobrar o de varios dueños. */
export function AvisosDelLote({ subida }: { subida: Pick<SubidaACuenta, "vista" | "duenos"> }) {
  const { vista, duenos } = subida;
  if (vista.ok && duenos.length <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {!vista.ok && (
        <span role="alert" className={ERROR_CUENTA}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {vista.mensaje}</span>
      )}
      {duenos.length > 1 && (
        <span className={AVISO_CUENTA}>
          <AlertTriangle className="h-4 w-4" /> Piezas de {duenos.length} dueños: todo va a UNA cuenta
          <InfoTip
            what={`Este lote tiene piezas de ${duenos.join(", ")}.`}
            affects="Se guarda entero a la cuenta de la persona que elijas. Si son cuentas distintas, separa las piezas en lotes y guarda cada uno."
          />
        </span>
      )}
    </div>
  );
}

/** Qué pasa con lo que el lote ya tiene en una cuenta: cargando, se actualiza, ya cobrada o en el despacho. */
export function EstadoDelLoteEnLaCuenta({
  subida, delLote, errorDelLote, reintentar, onAbrir,
}: {
  subida: Pick<SubidaACuenta, "verificando" | "actualiza" | "cobrada" | "enDespacho">;
  delLote: CubicacionTrozas[] | null;
  errorDelLote: string | null;
  reintentar: () => void;
  onAbrir: (id: string) => void;
}) {
  const { verificando, actualiza, cobrada, enDespacho } = subida;
  return (
    <>
      {errorDelLote ? (
        <div role="alert" className="flex flex-wrap items-center gap-2">
          <span className={`${ERROR_CUENTA} min-w-0 flex-1`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> No se pudo ver si este lote ya está en una cuenta: {errorDelLote}</span>
          <button type="button" className={BOTON_SECUNDARIO} onClick={reintentar}>Reintentar</button>
        </div>
      ) : (delLote === null || verificando) && (
        <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Viendo si este lote ya está en una cuenta…</p>
      )}
      {actualiza && (
        <p className="text-sm text-[var(--text-secondary)]">
          Este lote ya está guardado como <b className="font-mono text-[var(--text-primary)]">{actualiza.codigo}</b> (sin descontar): se actualiza esa misma.
        </p>
      )}
      {enDespacho && (
        <div className={CAJA_AVISO}>
          <span className="min-w-0 flex-1">
            Este lote está en el despacho como <b className="font-mono">{enDespacho.codigo}</b>
            {enDespacho.personaNombre ? ` (${enDespacho.personaNombre})` : ""}: se valoriza desde ahí, no se guarda otra.
          </span>
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => onAbrir(enDespacho.id)}>Abrir {enDespacho.codigo}</button>
        </div>
      )}
      {cobrada && (
        <div className={CAJA_AVISO}>
          <span className="min-w-0 flex-1">
            Este lote ya se descontó como <b className="font-mono">{cobrada.codigo}</b>{cobrada.monto != null ? ` (${formatCurrency(cobrada.monto)})` : ""}
            {cobrada.personaNombre ? ` a ${cobrada.personaNombre}` : ""}. Guardarlo otra vez lo cobraría dos veces: anúlala primero, o empieza un lote nuevo si son otras piezas.
          </span>
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => onAbrir(cobrada.id)}>Abrir {cobrada.codigo}</button>
        </div>
      )}
    </>
  );
}
