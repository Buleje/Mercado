"use client";

/**
 * Las especies que el libro o los árboles marcados ya nombran y el registro de
 * la plantación todavía no tiene (ADR-459): se agregan con un clic, sin tipear.
 *
 * Dos usos:
 *   · registro vacío → «Ya aparecen en el libro o en los árboles marcados».
 *   · registro con especies, pero el libro taló otras → aviso ámbar: esa madera
 *     no descuenta de nada y, desde ADR-459, la próxima tala de esa especie se
 *     frena (T7) hasta que esté en el registro.
 */

import { AlertTriangle, Plus } from "@buleje/design-system/icons";
import { formatNumber } from "@/lib/format";

/** Una especie que ya aparece en el libro del plan o en sus árboles marcados y no está registrada. */
export interface EspecieSugerida {
  nombre: string;
  cientifico: string | null;
  /** Árboles marcados de la especie (0 si sólo aparece en el libro). */
  arboles: number;
  /** m³ que el libro ya taló de la especie (ADR-459, `balance.sinRegistrar`). */
  taladoM3?: number;
}

const CHIP =
  "inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]";

function Chips({ sugeridas, onAgregar }: { sugeridas: readonly EspecieSugerida[]; onAgregar: (s: readonly EspecieSugerida[]) => void }) {
  return (
    <>
      {sugeridas.map((s) => (
        <button key={s.nombre} type="button" onClick={() => onAgregar([s])} className={CHIP}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {s.nombre}
          <span className="font-mono text-xs font-normal tabular-nums text-[var(--text-tertiary)]">
            {[
              s.arboles > 0 ? `${formatNumber(s.arboles)} árb.` : null,
              s.taladoM3 && s.taladoM3 > 0 ? `${formatNumber(s.taladoM3, 3)} m³ talados` : null,
            ].filter(Boolean).join(" · ")}
          </span>
        </button>
      ))}
      {sugeridas.length > 1 && (
        <button
          type="button"
          onClick={() => onAgregar(sugeridas)}
          className="inline-flex h-9 items-center rounded-full px-3 text-sm font-semibold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]"
        >
          Agregar las {sugeridas.length}
        </button>
      )}
    </>
  );
}

/** Registro vacío: lo que ya se conoce de la plantación, para no tipearlo. */
export function SugeridasRegistroVacio({ sugeridas, onAgregar }: {
  sugeridas: readonly EspecieSugerida[];
  onAgregar: (s: readonly EspecieSugerida[]) => void;
}) {
  if (sugeridas.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
      <span className="text-sm text-[var(--text-secondary)]">Ya aparecen en el libro o en los árboles marcados:</span>
      <Chips sugeridas={sugeridas} onAgregar={onAgregar} />
    </div>
  );
}

/** Registro con especies, pero el libro taló otras que no están: no descuentan de nada. */
export function AvisoTaladoSinRegistrar({ sugeridas, onAgregar }: {
  sugeridas: readonly EspecieSugerida[];
  onAgregar: (s: readonly EspecieSugerida[]) => void;
}) {
  const taladas = sugeridas.filter((s) => (s.taladoM3 ?? 0) > 0);
  if (taladas.length === 0) return null;
  const total = taladas.reduce((a, s) => a + (s.taladoM3 ?? 0), 0);
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-warning-500)]/60 bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 grow basis-[16rem] font-semibold">
        El libro taló {formatNumber(total, 3)} m³ de {taladas.length === 1 ? "una especie" : `${taladas.length} especies`} que no
        {taladas.length === 1 ? " está" : " están"} en el registro: no descuentan de ningún saldo.
      </span>
      <Chips sugeridas={taladas} onAgregar={onAgregar} />
    </div>
  );
}
