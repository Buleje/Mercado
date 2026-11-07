"use client";

/**
 * «¿Estas trozas ya están en el patio?» del importador (sólo cuando el archivo
 * trae ingresos o el inventario de rolliza).
 *
 * APAGADA por defecto: la fecha de recepción es dato legal —el día que la
 * madera bajó del camión— y nunca se inventa. Sin marcar, las guías entran
 * sin fecha de llegada y quedan en «Sin recepcionar» de Trozas. Marcada, cada
 * guía nueva se recibe con la fecha de la guía en el archivo o con una común;
 * el servidor rechaza la futura y la anterior a la guía.
 */

import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { Casilla } from "@/components/ui-system/Casilla";
import { button } from "@/components/ui-system/button-variants";
import { limaDateKey } from "@/lib/utils";

export interface PatioAlImportar {
  marcada: boolean;
  /** `AAAA-MM-DD` común; "" = la fecha de cada guía en el archivo. */
  fecha: string;
}

export const PATIO_APAGADO: PatioAlImportar = { marcada: false, fecha: "" };

const CLASE_FECHA =
  "h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)] disabled:opacity-60";

const DE_CADA_GUIA = button({ variant: "ghost", className: "rounded-xl" });

export default function RecepcionAlImportar({
  valor,
  onCambiar,
  sinFechaEnElArchivo,
  deshabilitado,
}: {
  valor: PatioAlImportar;
  onCambiar: (v: PatioAlImportar) => void;
  /** El inventario de rolliza no trae fecha por guía: sin una común, no se recibe ninguna. */
  sinFechaEnElArchivo: boolean;
  deshabilitado?: boolean;
}) {
  const faltaFecha = valor.marcada && sinFechaEnElArchivo && !valor.fecha;
  return (
    <div className="space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Casilla
          checked={valor.marcada}
          disabled={deshabilitado}
          onChange={(e) => onCambiar({ ...valor, marcada: e.target.checked })}
          etiqueta={<span className="text-base font-extrabold text-[var(--text-primary)]">¿Estas trozas ya están en el patio?</span>}
        />
        <InfoTip
          title="Llegada al patio"
          what="La fecha en que la madera bajó del camión. Es dato legal: el importador no la inventa."
          affects="Sin marcar, las guías entran sin fecha de llegada y quedan en «Sin recepcionar» de Trozas. Marcada, cada guía nueva se recibe con la fecha que pongas o, vacía, con la suya del archivo. Nunca futura ni antes de la guía; las que ya estaban no se tocan."
          example="Libro con 3 guías del 10/10 que llegaron el 11/10: marcas la casilla y pones 11/10."
        />
        {valor.marcada && (
          <span className="flex flex-wrap items-center gap-2">
            <label htmlFor="import-fecha-patio" className="text-sm font-bold text-[var(--text-secondary)]">
              Llegaron el
            </label>
            <input
              id="import-fecha-patio"
              type="date"
              value={valor.fecha}
              max={limaDateKey()}
              disabled={deshabilitado}
              onChange={(e) => onCambiar({ ...valor, fecha: e.target.value })}
              className={CLASE_FECHA}
            />
            {valor.fecha ? (
              <button type="button" disabled={deshabilitado} onClick={() => onCambiar({ ...valor, fecha: "" })} className={DE_CADA_GUIA}>
                Usar la de cada guía
              </button>
            ) : (
              <span className="text-sm text-[var(--text-tertiary)]">vacía = la de cada guía</span>
            )}
          </span>
        )}
      </div>
      {faltaFecha && (
        <p role="alert" className="text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          El inventario del patio no trae la fecha de cada guía: pon el día que llegaron o quedarán sin recepcionar.
        </p>
      )}
    </div>
  );
}
