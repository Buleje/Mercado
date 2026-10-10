"use client";

/**
 * LothMapaRutasAviso — una línea bajo la barra del mapa cuando el plano
 * todavía no tiene rutas guardadas pero sí árboles:
 *
 *   · con la geografía de la zona ya guardada, el mapa muestra solo la
 *     propuesta del planificador, PUNTEADA y sin guardar; la línea lo dice y
 *     ofrece revisarla (abre el planificador) u ocultarla;
 *   · sin geografía guardada no se muestra nada solo —traerla sale a internet
 *     y tarda—: la línea ofrece «Proponer rutas».
 */

import { EyeOff, Route, Wand2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { EstadoPrevia } from "./hooks/use-loth-mapa-rutas";

interface Props {
  estado: EstadoPrevia;
  error: string | null;
  /** Abre el planificador y pide la propuesta. */
  onProponer: () => void;
  onOcultar: () => void;
}

const BTN =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--rule-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40";

export default function LothMapaRutasAviso({ estado, error, onProponer, onOcultar }: Props) {
  if (estado === "nada" || estado === "cargando") return null;
  const lista = estado === "lista";
  return (
    <div role="status" data-aviso-rutas={estado} className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--rule-soft)] bg-[var(--data-info-500)]/10 px-3 py-1.5">
      <Route className="h-4 w-4 flex-none text-[var(--data-info-ink)]" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-primary)] max-sm:basis-[calc(100%-1.5rem)]">
        {lista ? "Sin rutas guardadas: te muestro las que propone el planificador, punteadas" : "Todavía no hay rutas en el plano"}
        {estado === "error" && error && <span className="font-normal text-[var(--text-secondary)]"> · {error}</span>}
        <InfoTip
          title={lista ? "Rutas propuestas, sin guardar" : "Proponer rutas"}
          what={
            lista
              ? "Patio, campamento, trochas y camino de salida según el relieve y los ríos que ya se guardaron de la zona."
              : "El planificador trae los ríos, caminos y el relieve de la zona y propone patio, campamento y trochas."
          }
          affects={lista ? "Nada se guarda hasta que tocas «Agregar al plano» en el planificador." : "La primera vez tarda de 8 a 50 segundos. Nada se guarda hasta «Agregar al plano»."}
          example="Arrastra el patio en el mapa y las trochas se recalculan alrededor."
        />
      </p>
      <button type="button" onClick={onProponer} className={BTN}>
        {lista ? <Wand2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Route className="h-3.5 w-3.5" aria-hidden="true" />}
        {lista ? "Revisar y guardar" : "Proponer rutas"}
      </button>
      {lista && (
        <button type="button" onClick={onOcultar} className={BTN}>
          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> Ocultar
        </button>
      )}
    </div>
  );
}

