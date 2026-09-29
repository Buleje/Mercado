"use client";

/**
 * LothMapaElegirVariosBar — la barra flotante de «Elegir varios»: cuántos
 * árboles se marcaron, cuántos m³, el aviso del último tocado (semillero,
 * bajo DMC…) y «Talar los N elegidos». Va en el mismo lugar que las barras
 * de dibujo (`LothMapaDrawBar`), porque es ahí donde está mirando quien
 * está marcando árboles.
 *
 * `role="status"` anuncia el modo y el conteo; el aviso de la guarda es
 * `role="alert"` (se lee aunque el foco esté en el mapa, no en la barra).
 */

import { Axe, Info, X } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";

const BTN =
  "inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:cursor-not-allowed disabled:opacity-40";

interface Props {
  n: number;
  m3: number;
  etiqueta: string;
  aviso: { texto: string; rechazo: boolean } | null;
  onLimpiar: () => void;
  onTalar: () => void;
  onSalir: () => void;
}

export default function LothMapaElegirVariosBar({ n, m3, etiqueta, aviso, onLimpiar, onTalar, onSalir }: Props) {
  return (
    <div
      role="status"
      className="absolute inset-x-3 top-3 z-30 space-y-1.5 rounded-2xl border border-[var(--brand-ink)] bg-[var(--surface-raised)]/95 px-3 py-2 shadow-lg backdrop-blur"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Axe className="h-4 w-4 shrink-0 text-[var(--brand-ink)] dark:text-[var(--text-primary)]" aria-hidden="true" />
        <span className="text-xs font-bold text-[var(--text-primary)] sm:text-sm">
          Toca los árboles que tumbaste ·{" "}
          <b className="font-mono tabular-nums">{formatNumber(n)}</b> {n === 1 ? "elegido" : "elegidos"}
          {n > 0 && <span className="text-[var(--text-tertiary)]"> · {fmtM3(m3)} m³</span>}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={onLimpiar} disabled={n === 0} className={BTN}>
            Limpiar
          </button>
          <button
            type="button"
            onClick={onTalar}
            disabled={n === 0}
            className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl bg-[var(--brand-ink)] px-3.5 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Axe className="h-4 w-4" aria-hidden="true" /> {etiqueta}
          </button>
          <button type="button" onClick={onSalir} aria-label="Salir de elegir varios" title="Salir de elegir varios (Escape)" className={BTN}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {aviso && (
        <p
          role="alert"
          className={`flex items-start gap-1.5 text-xs font-semibold ${
            aviso.rechazo
              ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
              : "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]"
          }`}
        >
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
