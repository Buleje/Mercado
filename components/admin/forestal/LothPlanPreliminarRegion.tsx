"use client";

/**
 * La región de la guía preliminar (Brandon 25-10): con Pasco elegida, «15» se
 * guarda como «19-000015» (GTF y LT). Se puede FIJAR para que el modal la traiga
 * siempre elegida en este equipo, y desfijar con el mismo botón.
 */

import { Pin } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { prefijoDeRegion } from "@/lib/forestal/loth-plan-preliminares";
import { listDepartamentos } from "@/lib/peru-ubigeo";
import { cn } from "@/lib/utils";
import { I } from "./ctp-shared";

const DEPARTAMENTOS = listDepartamentos();

export default function LothPlanPreliminarRegion({
  region,
  fija,
  onRegion,
  onFijar,
}: {
  /** Código INEI del departamento (`19`) o `""` = sin región. */
  region: string;
  /** La región elegida es la fijada. */
  fija: boolean;
  onRegion: (codigo: string) => void;
  /** Fija la elegida o, si ya está fijada, la desfija. */
  onFijar: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <select
        className={cn(I, "min-w-0 flex-1")}
        value={region}
        onChange={(e) => onRegion(e.target.value)}
        aria-label="Región de la guía"
        data-testid="preliminar-region"
      >
        <option value="">Sin región (escribo el N.º completo)</option>
        {DEPARTAMENTOS.map((d) => (
          <option key={d.code} value={d.code}>
            {d.nombre} · {prefijoDeRegion(d.code)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onFijar}
        disabled={!region && !fija}
        aria-pressed={fija}
        title={fija ? "Desfijar: el modal ya no la traerá elegida" : "Fijar: el modal la traerá siempre elegida"}
        aria-label={fija ? "Desfijar la región" : "Fijar la región"}
        data-testid="preliminar-region-fijar"
        className={button({ variant: fija ? "secondary" : "ghost", size: "icon", className: "shrink-0 rounded-xl" })}
      >
        {/* Fijada = el alfiler relleno en turquesa (un alfiler tachado se leía como «no está fijada»). */}
        <Pin className={cn("h-5 w-5", fija && "fill-current text-[var(--accent-dark)] dark:text-[var(--accent)]")} aria-hidden />
      </button>
      {fija && <span className="shrink-0 text-xs font-bold text-[var(--accent-dark)] dark:text-[var(--accent)]">Fijada</span>}
    </div>
  );
}
