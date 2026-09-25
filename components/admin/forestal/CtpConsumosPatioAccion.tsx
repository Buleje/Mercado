"use client";

/**
 * La acción de la tabla del patio: «Consumir en un lote…» y el día (ADR-347/431).
 *
 * Va en el encabezado de la tarjeta «Trozas en el patio», a la derecha del
 * título (2026-09-24). Antes era la primera columna de una banda suelta con el
 * rótulo «Cargar la sierra» encima, separada de la tabla sobre la que actúa, y
 * la pista de cómo usarla quedaba sola debajo de la paginación. El lote sigue
 * siendo el filtro que más manda —acota la pila a la especie del lote—: por eso
 * es lo primero que se ve de la tarjeta.
 *
 * Menú y no `<select>` nativo (Brandon, 2026-09-02): un `<option>` no lleva
 * ícono ni cifras alineadas, y el lote se elige mirando sus piezas y sus m³.
 * El botón no parte su texto (medido: «Consumir en un lote…» ocupaba 3
 * renglones en 124 px).
 */

import { useId } from "react";
import { Boxes } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import type { EstadoPatioConsumos } from "./hooks/use-patio-consumos";

const CLASE_FECHA =
  "h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

export default function CtpConsumosPatioAccion({
  estado,
  onIrALotes,
}: {
  estado: EstadoPatioConsumos;
  onIrALotes?: () => void;
}) {
  const { loteElegido, loteCarga, lotesParaElegir, opcionesLote, fechaConsumo, setFechaConsumo } = estado.carga;
  const idFecha = useId();

  /* Sin ningún lote, un selector vacío no es una acción: va el camino. */
  if (lotesParaElegir.length === 0) {
    return onIrALotes ? (
      <button
        type="button"
        onClick={onIrALotes}
        className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]"
      >
        <Boxes className="h-4 w-4" aria-hidden />
        Programar un lote para cargar la sierra
      </button>
    ) : null;
  }

  return (
    <>
      {loteCarga && (
        <div className="flex items-center gap-2">
          <label htmlFor={idFecha} className="whitespace-nowrap text-sm font-bold text-[var(--text-secondary)]">
            Fecha del consumo
          </label>
          <input
            id={idFecha}
            type="date"
            value={fechaConsumo}
            onChange={(e) => setFechaConsumo(e.target.value)}
            className={CLASE_FECHA}
          />
        </div>
      )}
      <ActionMenu
        label={loteElegido ? `Lote ${loteElegido.code}` : "Consumir en un lote…"}
        title="Cargar la sierra: elige el lote que entra, o revisa uno ya cerrado"
        icon={Boxes}
        variant={loteCarga ? "accent" : "primary"}
        size="sm"
        className="whitespace-nowrap"
        actions={opcionesLote}
      />
    </>
  );
}
