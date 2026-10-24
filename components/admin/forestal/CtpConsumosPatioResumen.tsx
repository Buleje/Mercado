"use client";

/**
 * «Qué queda en el patio» — la primera tarjeta de Consumos › Patio.
 *
 * Brandon (2026-09-27): «en Consumos va a ocupar mucho, así que quiero otra
 * página». La tabla por permiso, los indicadores del patio y el Excel por
 * permiso se MUDARON a la pestaña «Trozas disponibles» (nada se borró: allá
 * están con sus especies, gráficos y la tabla por troza). Acá queda lo del
 * trabajo de la sierra:
 *   1. una línea con cuánto hay y el camino a «Trozas disponibles»;
 *   2. los lotes que esperan la sierra;
 *   3. el lote mixto que espera repartirse.
 * La tabla de trozas para cargar lotes vive debajo, en su propia tarjeta.
 */

import { useId, type ReactNode } from "react";
import { ArrowRight } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import CtpLotesTira from "./CtpLotesTira";
import type { EstadoPatioConsumos } from "./hooks/use-patio-consumos";

const nf = (n: number) => formatNumber(n);

/**
 * La línea del patio, con el criterio de «Trozas disponibles» y de la pestaña
 * «Patio · N» de arriba: lo EN EL PATIO primero, lo sin recepcionar aparte
 * (revisión 2026-09-27: decía «84 trozas» con la pestaña en 46).
 */
export function lineaDelPatio(estado: Pick<EstadoPatioConsumos, "porPermiso" | "lotes">): string {
  const { lotes, porPermiso } = estado;
  if (lotes.cargando && lotes.trozas.length === 0) return "Leyendo el patio…";
  if (lotes.error && lotes.trozas.length === 0) return "No se pudo leer el patio";
  const { enPatio, porRecepcionar } = porPermiso.totales;
  if (enPatio.trozas === 0 && porRecepcionar.trozas === 0) return "Sin trozas en el patio";
  return (
    `${nf(enPatio.trozas)} en el patio (${fmtM3(enPatio.m3)} m³)` +
    (porRecepcionar.trozas > 0 ? ` · ${nf(porRecepcionar.trozas)} sin recepcionar` : "")
  );
}

export default function CtpConsumosPatioResumen({
  estado,
  trabajando,
  onIr,
  mixto,
}: {
  estado: EstadoPatioConsumos;
  /** Hay un lote elegido: la tira de lotes y el lote mixto ceden la pantalla. */
  trabajando: boolean;
  onIr?: (vista: string) => void;
  /** La línea del lote mixto (ADR-441): lo que espera repartirse, junto a los lotes que esperan la sierra. */
  mixto?: ReactNode;
}) {
  const { lotes, carga } = estado;
  const idTitulo = useId();

  return (
    <section
      aria-labelledby={idTitulo}
      className="space-y-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <CardTitle as="h3" id={idTitulo} className="text-sm font-bold text-[var(--text-primary)]">
            Qué queda en el patio
          </CardTitle>
          <InfoTip
            title="Qué queda en el patio"
            what="Las trozas recibidas: libres o en lote. Lo que espera su guía va aparte."
            affects="El detalle por permiso, especie y troza está en «Trozas disponibles»."
            example="46 en el patio. Otras 38 esperan su guía."
          />
        </div>
        <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">{lineaDelPatio(estado)}</span>
        {onIr && (
          <button
            type="button"
            onClick={() => onIr("trozas-disponibles")}
            className="ml-auto inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border-[1.5px] border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]"
          >
            Ver trozas disponibles
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {/* Lo que TODAVÍA no entró a la sierra: el semáforo y el camino (ADR-334). */}
      {onIr && !trabajando && (
        <CtpLotesTira enLinea lotes={carga.lotesAbiertos} cargando={lotes.cargando} error={lotes.error} onIr={() => onIr("lotes")} />
      )}
      {!trabajando && mixto}
    </section>
  );
}
