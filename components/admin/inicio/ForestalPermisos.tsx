"use client";

import { CardTitle } from "@buleje/design-system";
import { ArrowRight, TriangleAlert } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { CHART_PALETTE } from "@/components/ui-system/charts/palette";
import { formatNumber } from "@/lib/format";
import type { PermisoInicio } from "@/lib/forestal/inicio-forestal";

const m3 = (n: number) => `${formatNumber(n, 2)} m³`;
const pct = (parte: number, base: number) => (base > 0 ? Math.min(100, Math.max(0, (parte / base) * 100)) : 0);

/**
 * Los permisos vigentes del LO-TH: lo autorizado (o registrado, en una
 * plantación) contra lo talado y lo despachado.
 *
 * Cada fila es el TOTAL de la cascada de Control del permiso (`cascadaDelPlan`
 * sobre el balance del plan): las mismas cifras que esa pantalla, desde que el
 * permiso empezó — no se recortan al período del Inicio, porque un saldo de
 * permiso a medias no dice cuánto queda.
 */
export function ForestalPermisos({ permisos, onIr }: { permisos: PermisoInicio[]; onIr: () => void }) {
  return (
    <section className="border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1.5 text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Libro TH · desde el inicio de cada permiso
          </p>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg font-extrabold leading-tight tracking-tight text-[var(--text-primary)] sm:text-xl">
              Permisos vigentes
            </CardTitle>
            <InfoTip
              title="Autorizado contra talado y despachado"
              what="Cada barra es el total de «Control del permiso» del Libro TH: lo autorizado (o lo registrado, si es plantación) y cuánto se taló y se despachó de eso."
              affects="Talado y despachado se cuentan desde que el permiso empezó, no sólo en el período elegido arriba."
              example="Autorizado 320 m³ · talado 80 m³ = 25 % · en pie 240 m³."
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onIr}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 px-3 text-sm font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]"
        >
          Ver control <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </header>
      {permisos.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">No hay permisos vigentes en el Libro TH.</p>
      ) : (
        <ul className="divide-y divide-[var(--rule-soft)] dark:divide-[var(--rule-base)]">
          {permisos.map((p) => (
            <FilaPermiso key={p.id} p={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FilaPermiso({ p }: { p: PermisoInicio }) {
  const base = p.tipo === "PLANTACION" ? "registrado" : "autorizado";
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 truncate text-sm font-bold text-[var(--text-primary)]">
          {p.numero}
          <span className="ml-2 text-xs font-semibold text-[var(--text-tertiary)]">{p.tipo === "PLANTACION" ? "Plantación" : p.tipo}</span>
        </p>
        <p className="text-sm tabular-nums text-[var(--text-secondary)]">
          {p.baseM3 > 0 ? (
            <>
              <strong className="text-[var(--text-primary)]">{p.pctTalado != null ? `${formatNumber(p.pctTalado, 1)} %` : "—"}</strong> talado de {m3(p.baseM3)} {base}
            </>
          ) : (
            <>Sin volumen {base}</>
          )}
        </p>
      </div>
      <div className="mt-2 space-y-1" aria-hidden>
        <div className="h-2.5 overflow-hidden rounded-[var(--radius-xs)] bg-[var(--surface-sunken)]">
          <div className="h-full" style={{ width: `${pct(p.taladoM3, p.baseM3)}%`, background: CHART_PALETTE.accent }} />
        </div>
        <div className="h-1.5 overflow-hidden rounded-[var(--radius-xs)] bg-[var(--surface-sunken)]">
          <div className="h-full" style={{ width: `${pct(p.despachadoM3, p.baseM3)}%`, background: CHART_PALETTE.amber }} />
        </div>
      </div>
      <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs tabular-nums text-[var(--text-secondary)]">
        <span>Talado {m3(p.taladoM3)}</span>
        <span>Despachado {m3(p.despachadoM3)}</span>
        <span>En pie {m3(p.enPieM3)}</span>
      </p>
      {(p.excedido || p.taladoSinRegistrarM3 > 0) && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {p.excedido
            ? `Se taló o despachó más de lo ${base}.`
            : `${m3(p.taladoSinRegistrarM3)} talados de especies que el permiso no tiene cargadas.`}
        </p>
      )}
    </li>
  );
}
