"use client";

/**
 * UbicacionEnVivoCheckout — estado de la ubicación que va con el pedido
 * (`pedidosCliente.pedirUbicacion`). No tiene botón propio: el único GPS a la
 * vista es «Usar mi ubicación GPS» de `AddressInput` (llena la dirección y
 * controla la distancia de entrega); con el interruptor prendido, sus
 * coordenadas (o el punto que el cliente ajusta en el mapa) llenan
 * `state.address.ubicacionEnVivo`, que el pedido manda como renglón de las
 * notas (ver `ubicacion-en-notas.ts`). Aquí sólo «Ubicación compartida · Quitar».
 */

import { CheckCircle2 } from "@buleje/design-system/icons";
import { usePedidosTienda } from "../hooks/usePedidosTienda";

export interface UbicacionEnVivoCheckoutProps {
  /** Enlace guardado en el pedido (`state.address.ubicacionEnVivo`). */
  enlace?: string;
  onQuitar: () => void;
}

export function UbicacionEnVivoCheckout({ enlace, onQuitar }: UbicacionEnVivoCheckoutProps) {
  const { config } = usePedidosTienda();
  if (!config.pedirUbicacion || !enlace) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 rounded-2xl border border-primary/30 bg-primary/5 px-4"
      data-testid="ubicacion-compartida"
    >
      <span className="inline-flex min-h-12 items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden="true" />
        Ubicación compartida con el negocio
      </span>
      <a
        href={enlace}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-12 items-center px-1 text-sm font-semibold underline underline-offset-4 text-[var(--accent-ink)] dark:text-[var(--accent)]"
      >
        Ver en el mapa
      </a>
      <button
        type="button"
        onClick={onQuitar}
        className="inline-flex h-12 items-center px-1 text-sm font-semibold underline underline-offset-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        Quitar
      </button>
    </div>
  );
}
