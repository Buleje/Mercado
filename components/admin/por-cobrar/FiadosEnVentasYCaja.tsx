"use client";

/**
 * La tarjeta-enlace de los fiados en Mi Plata.
 *
 * Plan «panel unificado», ola 3 (2026-10-10), decisión de Brandon: los fiados
 * tienen UNA casa, Ventas y caja › Me deben (el cajero cobra el fiado a la caja
 * abierta, y la plantilla del panel escondía Mi Plata en 11 de 14 negocios).
 * Mi Plata ya no los monta: muestra la cifra —la del backend, la misma que
 * suma «Todo lo que me deben»— y lleva allá.
 */

import { HandCoins } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { button } from "@/components/ui-system/button-variants";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import type { TipoPorCobrarResumen } from "@/lib/db/por-cobrar.db";
import { enMonedas } from "./estilo";

/** Dónde se cobran los fiados. */
export const ME_DEBEN = { tab: "ventas-caja", params: { vista: "cuentas-cobrar" } } as const;

export default function FiadosEnVentasYCaja({ fiados }: { fiados: readonly TipoPorCobrarResumen[] }) {
  const cuentas = fiados.reduce((s, x) => s + x.count, 0);
  const cifra = enMonedas(fiados.map((x) => ({ moneda: x.moneda, monto: x.total })));
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
      <HandCoins className="h-5 w-5 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
        {cuentas > 0 ? (
          <>
            <span className="font-bold tabular-nums text-[var(--text-primary)]">Fiados: {cifra}</span>
            {` en ${cuentas} cuenta${cuentas === 1 ? "" : "s"}. `}
          </>
        ) : (
          <span className="font-bold text-[var(--text-primary)]">Sin fiados pendientes. </span>
        )}
        Los fiados se cobran en Ventas y caja › Me deben.
      </p>
      <EnlacePanel
        href={hrefDeDestino({ tab: ME_DEBEN.tab, params: { ...ME_DEBEN.params } })}
        apariencia="heredada"
        className={button({ variant: "secondary" })}
      >
        Ir a Me deben
      </EnlacePanel>
    </div>
  );
}
