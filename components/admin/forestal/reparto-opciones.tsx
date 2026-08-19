"use client";

/**
 * reparto-opciones — la alerta de descuadre y el panel de "Opciones" (firma
 * del PDF + filtro de especies) de ResumenReparto.
 *
 * Salió de ahí por la misma razón que `reparto-vistas`: el componente volvió a
 * pasar las ~300 líneas al sumar estos dos bloques, que además son puro render
 * sobre estado que ya vive en el padre (nada de lógica propia acá).
 */

import type { Dispatch, SetStateAction } from "react";
import { AlertTriangle } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

/**
 * Rolliza libre por debajo de esto es normal (redondeo del % aprovechable, no
 * madera real sin usar) — un aserradero mide con cinta, así que la alerta
 * arranca donde ya se nota: 50 litros.
 */
export const LIBRE_ALERTA_M3 = 0.05;

/** Lo que conviene revisar ANTES de exportar: rolliza libre y aserrada sin respaldo. */
export function AlertaDescuadre({ libreM3, faltanteM3 }: { libreM3: number; faltanteM3: number }) {
  if (libreM3 <= LIBRE_ALERTA_M3 && faltanteM3 <= 0) return null;
  return (
    <div className="mb-4 flex flex-wrap items-start gap-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] p-3 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10 dark:text-[var(--data-warning-500)]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        <b>Antes de exportar, revisá:</b>{" "}
        {libreM3 > LIBRE_ALERTA_M3 && <>{fmtM3(libreM3)} m³ de rolliza quedaron libres (sin usar) en los bloques cargados.</>}
        {libreM3 > LIBRE_ALERTA_M3 && faltanteM3 > 0 && " · "}
        {faltanteM3 > 0 && <>{fmtM3(faltanteM3)} m³ de lo aserrado no tienen bloque que los ampare (abajo, en «Falta por distribuir»).</>}
      </span>
    </div>
  );
}

/** Firma del PDF + filtro de especies para los tres exports (PDF/Excel/CSV). */
export function OpcionesExportacion({
  firmaNombre, onFirmaNombre, firmaCargo, onFirmaCargo, especies, soloEspecies, setSoloEspecies,
}: {
  firmaNombre: string;
  onFirmaNombre: (v: string) => void;
  firmaCargo: string;
  onFirmaCargo: (v: string) => void;
  /** Especies presentes en la distribución actual, para armar los chips. */
  especies: readonly string[];
  soloEspecies: Set<string>;
  setSoloEspecies: Dispatch<SetStateAction<Set<string>>>;
}) {
  return (
    <div className="mb-4 grid gap-3 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3 sm:grid-cols-2 print:hidden">
      <div>
        <span className="mb-1.5 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
          Responsable de la distribución (firma del PDF)
        </span>
        <div className="flex flex-wrap gap-2">
          <input
            value={firmaNombre}
            onChange={(e) => onFirmaNombre(e.target.value)}
            placeholder="Nombre y apellido"
            aria-label="Nombre del responsable, va impreso sobre la línea de firma del PDF"
            className="h-9 flex-1 min-w-[140px] rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          <input
            value={firmaCargo}
            onChange={(e) => onFirmaCargo(e.target.value)}
            placeholder="Cargo (opcional)"
            aria-label="Cargo del responsable"
            className="h-9 w-40 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>
      {especies.length > 0 && (
        <div>
          <span className="mb-1.5 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            Especies a exportar {soloEspecies.size === 0 ? "(todas)" : `(${soloEspecies.size})`}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {especies.map((esp) => {
              const activa = soloEspecies.size === 0 || soloEspecies.has(esp);
              return (
                <button
                  key={esp}
                  type="button"
                  onClick={() => setSoloEspecies((prev) => {
                    // Con "todas" activo (set vacío) TODOS los chips se ven
                    // prendidos: el primer click tiene que AISLAR a ese chip
                    // (dejar sólo ése), no excluirlo — armar el set con el
                    // resto hacía justo lo contrario de lo que el chip mostraba
                    // (auditoría 2026-08-17, verificado con Playwright).
                    if (prev.size === 0) return new Set([esp]);
                    const next = new Set(prev);
                    if (next.has(esp)) next.delete(esp); else next.add(esp);
                    // Volver a marcar TODAS una por una colapsa al sentinel
                    // vacío: mismo estado que "todas", pero la etiqueta lo dice.
                    return next.size === especies.length ? new Set() : next;
                  })}
                  aria-pressed={activa}
                  className={`rounded-full border-2 px-2.5 py-1 text-xs font-bold transition-colors ${activa
                    ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "border-[var(--rule-base)] text-[var(--text-tertiary)]"}`}
                >
                  {esp}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
