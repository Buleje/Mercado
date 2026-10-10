"use client";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ETIQUETA_METODO, type MetodoCobro } from "@/lib/fiados/cobro-metodo";

/**
 * Cobro de fiado desde el POS: con qué paga el cliente y el aviso si no había
 * caja. El cobro va SIEMPRE a la caja abierta (`aCaja: true`): el efectivo que
 * la cajera recibe en el mostrador tiene que figurar en el esperado del
 * arqueo. Antes el POS no lo mandaba y ese efectivo quedaba fuera del cuadre.
 */
const MEDIOS: MetodoCobro[] = ["efectivo", "yape", "plin", "tarjeta"];

export function MedioCobroCompacto({
  valor,
  onCambiar,
  deshabilitado,
}: {
  valor: MetodoCobro;
  onCambiar: (m: MetodoCobro) => void;
  deshabilitado?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="¿Cómo paga?" className="flex flex-wrap gap-1">
      {MEDIOS.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={valor === id}
          disabled={deshabilitado}
          onClick={() => onCambiar(id)}
          className={cn(
            "min-h-8 rounded-lg border px-2 text-xs font-bold transition-colors disabled:opacity-50",
            valor === id
              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)]"
              : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]",
          )}
        >
          {ETIQUETA_METODO[id]}
        </button>
      ))}
    </div>
  );
}

/** Cuerpo del cobro: siempre a la caja, con el medio elegido. */
export function cuerpoCobroACaja(metodo: MetodoCobro): { metodo: MetodoCobro; aCaja: true } {
  return { metodo, aCaja: true };
}

/** Si el servidor dice que no había caja abierta, la cajera tiene que saberlo. */
export function avisarSiSinCaja(respuesta: unknown): void {
  const caja = (respuesta as { caja?: { sinCaja?: boolean } } | null)?.caja;
  if (caja?.sinCaja) toast.warning("No había caja abierta: el cobro quedó anotado solo en el fiado");
}
