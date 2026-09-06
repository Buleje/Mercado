"use client";

/**
 * Piezas presentacionales de CtpResumenPermisoModal (Brandon, 2026-09-01):
 * la fila seleccionable que comparten lotes y productos disponibles, y el
 * buscador de objetivo (pegás el código de una cubicación guardada y ves su
 * resumen acá). Separado del modal para no pasar los ~300 LOC del componente
 * principal — son piezas sin estado propio, controladas desde afuera.
 */

import type { ReactNode } from "react";
import { Loader2, Lock, Search } from "@buleje/design-system/icons";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import { Btn } from "./ctp-shared";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";

// date-only con timeZone UTC: sin eso, en Lima la fecha se corre un día.
const fmtFecha = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export function SeccionResumenPermiso({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-bold text-[var(--text-primary)]">{titulo}</p>
      {children}
    </div>
  );
}

export function FilaSeleccionable({
  checked,
  onToggle,
  titulo,
  subtitulo,
  valor,
  ariaLabel,
  /** Bloqueada porque su tipo no es de los que pide el objetivo (Brandon,
   *  2026-09-01): un candado, no un checkbox tildable a la fuerza — sumar un
   *  tipo que el objetivo no pidió declararía un producto por otro. */
  disabled,
  disabledHint,
}: {
  checked: boolean;
  onToggle: () => void;
  titulo: string;
  subtitulo?: string;
  valor: string;
  ariaLabel: string;
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <li className={`flex items-center gap-2 border-b border-[var(--rule-soft)] px-2 py-1.5 last:border-0 ${disabled ? "opacity-50" : ""}`}>
      {disabled ? (
        <AdminTooltip content={disabledHint ?? "No es del tipo que pide el objetivo"} className="max-w-[220px] font-normal normal-case tracking-normal">
          <span className="grid h-5 w-5 shrink-0 place-items-center text-[var(--text-tertiary)]">
            <Lock className="h-3.5 w-3.5" aria-hidden />
          </span>
        </AdminTooltip>
      ) : (
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={ariaLabel}
          className="h-5 w-5 shrink-0 accent-[var(--accent)]"
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{titulo}</span>
        {subtitulo && <span className="block text-xs text-[var(--text-tertiary)]">{subtitulo}</span>}
      </span>
      <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{valor}</span>
    </li>
  );
}

export function SeccionObjetivo({
  codigo,
  onCodigo,
  onBuscar,
  buscando,
  error,
  objetivo,
  cubicaciones,
  cargandoCubicaciones,
  onElegir,
}: {
  codigo: string;
  onCodigo: (v: string) => void;
  onBuscar: () => void;
  buscando: boolean;
  error: string | null;
  objetivo: CubicacionRegistro | null;
  /** Todas las cubicaciones guardadas del tenant — `null` mientras carga. */
  cubicaciones: CubicacionRegistro[] | null;
  cargandoCubicaciones: boolean;
  /** Elegida de la lista — mismo resultado que pegar su código a mano. */
  onElegir: (id: string) => void;
}) {
  return (
    <SeccionResumenPermiso titulo="Objetivo (de una cubicación)">
      <p className="text-xs text-[var(--text-tertiary)]">
        Elegí una de tus cubicaciones guardadas, o pegá el código que copiaste en Cubicador de madera → Guardadas.
      </p>

      <label className="block">
        <span className="mb-1 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Elegir de la lista
        </span>
        <div className="relative">
          <select
            value={objetivo?.id ?? ""}
            onChange={(e) => onElegir(e.target.value)}
            disabled={cargandoCubicaciones || (cubicaciones?.length ?? 0) === 0}
            aria-label="Elegir una cubicación guardada como objetivo"
            className="h-10 w-full rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
          >
            <option value="">
              {cargandoCubicaciones
                ? "Buscando tus cubicaciones…"
                : (cubicaciones?.length ?? 0) === 0
                  ? "No tenés cubicaciones guardadas todavía"
                  : "— Elegí una —"}
            </option>
            {cubicaciones?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} · {fmtFecha(c.fecha)} · {c.totales.piezas} pzs · {fmtM3(c.totales.m3)} m³
              </option>
            ))}
          </select>
          {cargandoCubicaciones && (
            <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--text-tertiary)]" aria-hidden />
          )}
        </div>
      </label>

      <div className="flex gap-2">
        <input
          value={codigo}
          onChange={(e) => onCodigo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onBuscar();
          }}
          placeholder="o pegá el código: cub-…"
          aria-label="Código de la cubicación objetivo"
          className="h-10 min-w-0 flex-1 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />
        <Btn variant="secondary" size="sm" onClick={onBuscar} disabled={buscando || !codigo.trim()}>
          <Search className="h-4 w-4" aria-hidden /> Buscar
        </Btn>
      </div>
      {error && (
        <p className="text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>
      )}
      {objetivo && (
        <div className="rounded-lg bg-[var(--surface-sunken)] px-3 py-2">
          <p className="text-sm font-bold text-[var(--text-primary)]">{objetivo.nombre}</p>
          <p className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
            {objetivo.totales.piezas} piezas · {fmtPt(objetivo.totales.pieTablar)} PT · {fmtM3(objetivo.totales.m3)} m³
          </p>
        </div>
      )}
    </SeccionResumenPermiso>
  );
}
