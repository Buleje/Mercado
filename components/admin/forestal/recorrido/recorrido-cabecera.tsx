"use client";

import { CalendarClock, TrendingDown } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { avisoDePlazo, rendimientoBajo, textoAvance, textoRendimiento } from "@/lib/forestal/recorrido-pantalla";
import type { EstadoRecorrido } from "@/lib/forestal/recorrido-permiso";

/**
 * Cabecera del recorrido: dónde vas, el rendimiento sugerido contra el real,
 * el plazo de registro de la guía (si lo hay) y las cifras del bloque en una
 * línea. Todo viene derivado del Libro por el servidor; acá no se suma nada.
 */

export default function RecorridoCabecera({ estado, hoy }: { estado: EstadoRecorrido; hoy: string }) {
  const rendimiento = textoRendimiento(estado.rendimiento);
  const bajo = rendimientoBajo(estado.rendimiento);
  const plazo = avisoDePlazo(estado.plazo, hoy);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span data-recorrido-avance className="text-base font-bold text-[var(--text-primary)]">
          {textoAvance(estado.siguiente)}
        </span>
        {rendimiento && (
          <span
            data-recorrido-rendimiento
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
              bajo
                ? "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-ink)]"
                : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
            }`}
          >
            {bajo && <TrendingDown className="h-3.5 w-3.5" aria-hidden />}
            {rendimiento}
          </span>
        )}
        <InfoTip
          title="Rendimiento"
          what="Sugerido: el porcentaje de aserrada que el bloque debería dar, el mismo con el que se repartió. Real: lo que el Libro registra como producido sobre la rolliza que entró a la sierra."
          affects="Si el real queda más de 5 puntos debajo del sugerido, se marca: revisa trozas sin atribuir o jornadas sin registrar."
          example="Sugerido 52 % · real 48.5 %"
        />
      </div>

      {plazo && (
        <p
          data-recorrido-plazo
          className={`flex items-center gap-1.5 text-sm font-bold ${plazo.vencido ? "text-[var(--data-error-ink)]" : "text-[var(--data-warning-ink)]"}`}
        >
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
          {plazo.texto}
        </p>
      )}

      <p className="text-sm text-[var(--text-secondary)] tabular-nums">
        Rolliza {fmtM3(estado.rollizaM3)} m³ · amparado {fmtM3(estado.amparadoM3)} m³ · producido {fmtM3(estado.producidoM3)} m³
        {estado.producidoPt > 0 ? ` (${formatNumber(estado.producidoPt, 0)} pt)` : ""}
        {estado.sinAtribuirM3 > 0 && (
          <span className="font-bold text-[var(--data-warning-ink)]"> · {fmtM3(estado.sinAtribuirM3)} m³ sin atribuir</span>
        )}
      </p>
    </div>
  );
}
