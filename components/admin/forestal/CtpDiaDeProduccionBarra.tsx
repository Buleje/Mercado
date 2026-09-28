"use client";

/**
 * La barra del modal del día (`CtpDiaDeProduccionModal`): qué mirar (pieza por
 * pieza / por especie y tipo / por especie) y las acciones del día — Excel,
 * vincular con un lote mixto (ADR-441), agregar la cubicación a lo declarado
 * por tipo (ADR-445) y traer todo al cubicado.
 *
 * Vive aparte para que el modal quede en lo que decide (qué se abre encima de
 * qué y qué se relee después de escribir).
 */

import { Copy, Download, Link2, Loader2, Ruler } from "@buleje/design-system/icons";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { Btn } from "./ctp-shared";

export type VistaDelDia = "piezas" | "especieTipo" | "especie";
const VISTAS: { value: VistaDelDia; label: string }[] = [
  { value: "piezas", label: "Pieza por pieza" },
  { value: "especieTipo", label: "Por especie y tipo" },
  { value: "especie", label: "Por especie" },
];

const SECUNDARIO =
  "inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)] disabled:opacity-50 dark:hover:text-[var(--accent)]";

export default function CtpDiaDeProduccionBarra({
  vista,
  onVista,
  releyendo,
  bajando,
  onExcel,
  onVincularMixto,
  onAgregarCubicacion,
  traer,
}: {
  vista: VistaDelDia;
  onVista: (v: VistaDelDia) => void;
  releyendo: boolean;
  bajando: boolean;
  onExcel: () => void;
  /** Sólo dueño o administrador (ADR-441). */
  onVincularMixto?: () => void;
  /** Sólo si alguna corrida del día está por tipo o cubicada en parte (ADR-445). */
  onAgregarCubicacion?: () => void;
  /** Sólo quien tiene un cubicador montado. */
  traer?: { onTraer: () => void; traido: boolean; deshabilitado: boolean };
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <SegmentedControl
        value={vista}
        onChange={onVista}
        size="sm"
        label="Qué mirar del día"
        options={VISTAS}
      />
      <div className="flex flex-wrap items-center gap-2">
        {releyendo && (
          <Loader2
            className="h-4 w-4 animate-spin text-[var(--text-tertiary)]"
            aria-label="Releyendo"
          />
        )}
        <button
          type="button"
          disabled={bajando}
          onClick={onExcel}
          title="Un archivo con la hoja pieza por pieza y el resumen del día"
          className={`${SECUNDARIO} h-9 px-2.5 text-xs`}
        >
          {bajando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Download className="h-3.5 w-3.5" aria-hidden />
          )}
          Excel
        </button>
        {onAgregarCubicacion && (
          <button
            type="button"
            onClick={onAgregarCubicacion}
            title="Vincular la pieza por pieza a lo declarado por tipo, sin cambiar los m³"
            className={`${SECUNDARIO} h-11 px-3 text-sm`}
          >
            <Ruler className="h-4 w-4" aria-hidden />
            Agregar cubicación
          </button>
        )}
        {onVincularMixto && (
          <button
            type="button"
            onClick={onVincularMixto}
            title="Atar las corridas de este día a las trozas del lote mixto de donde salieron"
            className={`${SECUNDARIO} h-11 px-3 text-sm`}
          >
            <Link2 className="h-4 w-4" aria-hidden />
            Vincular con lote mixto
          </button>
        )}
        {traer && (
          <Btn
            variant="primary"
            size="sm"
            onClick={traer.onTraer}
            disabled={traer.traido || traer.deshabilitado}
            title="Trae todas las piezas del día al lote cubicado para trabajarlas. No toca las corridas del libro."
          >
            <Copy className="h-4 w-4" aria-hidden />
            {traer.traido ? "Ya está en el cubicado" : "Traer todo el día al cubicado"}
          </Btn>
        )}
      </div>
    </div>
  );
}
