"use client";

/**
 * LothMapaAvisoParcela — una línea bajo la barra del mapa cuando la mayoría de
 * los árboles del censo cae FUERA del área dibujada (Blas, 29-09: los 65, a
 * 31 km). O el polígono se dibujó en otro lugar o el censo está en otra zona
 * UTM; sin verlo, el mapa encuadra el área y los árboles quedan fuera de la
 * pantalla. «Ver dónde están los árboles» los encuadra para poder corregir.
 */

import { Locate, TriangleAlert } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";

interface Props {
  fuera: number;
  total: number;
  km: number;
  onVer: () => void;
}

export default function LothMapaAvisoParcela({ fuera, total, km, onVer }: Props) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--rule-soft)] bg-[var(--data-warning-500)]/10 px-3 py-1.5">
      <TriangleAlert className="h-4 w-4 flex-none text-[var(--data-warning-ink)]" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-primary)] max-sm:basis-[calc(100%-1.5rem)]">
        {fuera === total ? `Los ${formatNumber(total)}` : `${formatNumber(fuera)} de ${formatNumber(total)}`} árboles del censo caen fuera del área dibujada
        {km >= 1 && <span className="font-normal text-[var(--text-secondary)]">, a {formatNumber(Math.round(km))} km</span>}
        <InfoTip
          title="Árboles fuera del área"
          what="O el polígono del área se dibujó en otro lugar, o las coordenadas del censo están en otra zona UTM."
          affects="El chequeo EUDR marca cada operación fuera del área, y el planificador busca el patio junto a los árboles, no dentro del área."
          example="Toca «Ver dónde están los árboles», compara con el polígono y corrígelo desde Dibujar → Corregir el área."
        />
      </p>
      <button
        type="button"
        onClick={onVer}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--rule-strong)]"
      >
        <Locate className="h-3.5 w-3.5" aria-hidden="true" /> Ver dónde están los árboles
      </button>
    </div>
  );
}
