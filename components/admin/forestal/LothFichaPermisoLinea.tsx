"use client";

/**
 * La ficha del permiso en UNA línea, arriba del Control (Brandon 17-10:
 * «compactar el Libro TH»): «Vigente · 440 días quedan · hasta el …», el plan
 * que se mide, lo que falta con su «Completar» y «Ver ficha», que despliega en
 * su lugar la ficha entera (`LothFichaPermiso`) y los planes vivos.
 *
 * Misma cuenta y mismos «Completar» que la ficha entera
 * (`construirFichaPermiso` + `useFaltantesFicha`): la línea no inventa nada.
 */

import { useMemo } from "react";
import { AlertTriangle, CalendarClock, ChevronDown } from "@buleje/design-system/icons";
import { construirFichaPermiso, type CaratulaFicha, type PlanFicha } from "@/lib/forestal/loth-ficha-permiso";
import type { PasoCaratula } from "@/lib/forestal/loth-caratula-pasos";
import { formatNumber } from "@/lib/format";
import { ETIQUETA_FICHA, TONO_FICHA } from "./LothFichaPermiso";
import { useFaltantesFicha } from "./loth-ficha-permiso-faltantes";

export const BOTON_LINEA =
  "inline-flex h-12 shrink-0 items-center gap-1 rounded-xl px-2 text-sm font-bold transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40";

export default function LothFichaPermisoLinea({
  caratula,
  plan,
  nombrePlan,
  notaPlan,
  planesVivos,
  abierta,
  panelId,
  onAlternar,
  onCompletarCaratula,
  onCompletarPlan,
}: {
  caratula: CaratulaFicha | null | undefined;
  plan: PlanFicha | null | undefined;
  /** El plan que se mide (con «Todos», el activo del libro). */
  nombrePlan?: string | null;
  /** Por qué se mide ese plan, si no es el elegido arriba. */
  notaPlan?: string | null;
  /** Cuántos planes vivos hay: con 2+ «Ver ficha» los lista. */
  planesVivos: number;
  abierta: boolean;
  panelId: string;
  onAlternar: () => void;
  onCompletarCaratula?: (paso: PasoCaratula) => void;
  onCompletarPlan?: () => void;
}) {
  const f = useMemo(() => construirFichaPermiso(caratula, plan), [caratula, plan]);
  const tono = TONO_FICHA[f.estado];
  const grupos = useFaltantesFicha(f, caratula, onCompletarCaratula, onCompletarPlan);

  const cifra = f.diasQuedan == null ? null : Math.abs(f.diasQuedan);
  const dias =
    f.diasQuedan == null ? null
      : f.diasQuedan < 0 ? `${formatNumber(cifra ?? 0)} ${cifra === 1 ? "día" : "días"} de vencido`
        : f.diasQuedan === 0 ? "vence hoy"
          : `${formatNumber(cifra ?? 0)} ${cifra === 1 ? "día queda" : "días quedan"}`;

  return (
    <div data-ficha-linea="" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <span className="inline-flex min-w-0 items-center gap-1.5 text-sm" aria-live="polite">
        <CalendarClock className={`h-4 w-4 shrink-0 ${tono.cifra}`} aria-hidden="true" />
        <span className={`rounded-full border border-current/40 px-2 py-0.5 text-xs font-bold ${tono.cifra}`}>
          {ETIQUETA_FICHA[f.estado]}
        </span>
        {dias ? (
          <b
            className={`font-semibold tabular-nums ${tono.cifra}`}
            title={f.vigenciaHasta ? `Vigente hasta el ${f.vigenciaHasta}` : undefined}
          >
            {dias}
          </b>
        ) : (
          <span className="text-[var(--text-secondary)]">{f.estadoTexto}</span>
        )}
        {/* La fecha sólo en pantallas anchas: a 1280 partía la línea en dos.
            Queda en el `title` de los días y en «Ver ficha». */}
        {f.vigenciaHasta && (
          <span className="hidden text-xs text-[var(--text-secondary)] 2xl:inline">· hasta el {f.vigenciaHasta}</span>
        )}
      </span>
      {nombrePlan && (
        /* `basis` chico: la fila se parte por la base, no por el nombre entero;
           después crece hasta 16rem si hay lugar. */
        <span className="min-w-0 max-w-[16rem] flex-[1_1_6rem] truncate text-xs text-[var(--text-secondary)]" title={notaPlan ?? nombrePlan}>
          {nombrePlan}
          {notaPlan && <span className="sr-only"> — {notaPlan}</span>}
        </span>
      )}
      {grupos.map((g) =>
        g.completar ? (
          <button
            key={g.donde}
            type="button"
            onClick={g.completar}
            title={g.textos.join(" · ")}
            aria-label={`Completar: ${g.textos.join(", ")}`}
            className={`${BOTON_LINEA} text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]`}
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Completar {g.donde === "caratula" ? "carátula" : "plan"}
          </button>
        ) : (
          <span key={g.donde} className="inline-flex min-w-0 items-center gap-1 text-xs font-semibold text-[var(--text-primary)]">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden="true" />
            <span className="truncate">{g.textos.join(" · ")}</span>
          </span>
        ),
      )}
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierta}
        aria-controls={panelId}
        className={`${BOTON_LINEA} text-[var(--text-secondary)] hover:text-[var(--text-primary)]`}
      >
        {abierta ? "Ocultar ficha" : "Ver ficha"}
        {planesVivos > 1 && <span className="font-normal tabular-nums">{" "}· {planesVivos} planes vivos</span>}
        <ChevronDown className={`h-4 w-4 transition-transform ${abierta ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
    </div>
  );
}
