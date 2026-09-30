"use client";

/**
 * Ficha del permiso — la tarjeta que va arriba del tablero «Control del permiso».
 *
 * Reemplaza a la banda de seis códigos que leía sólo la carátula (0 cargadas en
 * el tenant real → seis guiones). Suma lo que ya estaba en el plan: parcela de
 * corta y, sobre todo, **cuántos días le quedan al permiso**, que es lo que se
 * mira primero. El estado va en texto Y color (nunca sólo color).
 *
 * La cuenta vive en `lib/forestal/loth-ficha-permiso.ts` (pura, con tests); acá
 * sólo se pinta. Los «Completar» son callbacks: quien monta la tarjeta decide
 * qué modal abrir (carátula → `LothCaratulaForm`; plan → vista Plan).
 */

import { useMemo } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { AlertTriangle, ArrowRight, CalendarClock } from "@buleje/design-system/icons";
import {
  construirFichaPermiso,
  type CaratulaFicha,
  type DondeCompletar,
  type EstadoFicha,
  type PlanFicha,
} from "@/lib/forestal/loth-ficha-permiso";
import { primerPasoIncompleto, queFalta, type PasoCaratula } from "@/lib/forestal/loth-caratula-pasos";
import { DIAS_AVISO_VENCIMIENTO } from "@/lib/forestal/loth-plan-vigencia";
import { formatNumber } from "@/lib/format";

export interface LothFichaPermisoProps {
  caratula: CaratulaFicha | null | undefined;
  plan: PlanFicha | null | undefined;
  /** Recibe el paso de la carátula que falta (1-3): quien abre el formulario puede caer ahí directo. */
  onCompletarCaratula?: (paso: PasoCaratula) => void;
  onCompletarPlan?: () => void;
}

/** Color por estado — siempre acompañado de la palabra (`ETIQUETA`). */
const TONO: Record<EstadoFicha, { caja: string; cifra: string; barra: string }> = {
  vigente: {
    caja: "border-[var(--data-success-500)]/50 bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/10",
    cifra: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
    barra: "bg-[var(--data-success-500)]",
  },
  por_vencer: {
    caja: "border-[var(--data-warning-500)]/60 bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/15",
    cifra: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
    barra: "bg-[var(--data-warning-500)]",
  },
  vencido: {
    caja: "border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/12",
    cifra: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
    barra: "bg-[var(--data-error-500)]",
  },
  suspendido: {
    caja: "border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/12",
    cifra: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
    barra: "bg-[var(--data-error-500)]",
  },
  sin_vigencia: {
    caja: "border-dashed border-[var(--rule-strong)]/30 bg-[var(--surface-sunken)]",
    cifra: "text-[var(--text-secondary)]",
    barra: "bg-[var(--text-tertiary)]",
  },
  cerrado: {
    caja: "border-[var(--rule-base)] bg-[var(--surface-sunken)]",
    cifra: "text-[var(--text-secondary)]",
    barra: "bg-[var(--text-tertiary)]",
  },
};

const ETIQUETA: Record<EstadoFicha, string> = {
  vigente: "Vigente",
  por_vencer: "Por vencer",
  vencido: "Vencido",
  suspendido: "Suspendido",
  sin_vigencia: "Sin vigencia",
  cerrado: "Cerrado",
};

/** Para la lista compacta de planes vivos: mismo color y misma palabra por estado. */
export { TONO as TONO_FICHA, ETIQUETA as ETIQUETA_FICHA };

const KICKER = "block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";

export default function LothFichaPermiso({ caratula, plan, onCompletarCaratula, onCompletarPlan }: LothFichaPermisoProps) {
  const f = useMemo(() => construirFichaPermiso(caratula, plan), [caratula, plan]);
  const tono = TONO[f.estado];

  /* Un «Completar» por pantalla que lo arregla, no uno por dato: la vigencia y
     la parcela se cargan en el mismo formulario del plan. */
  const faltasCaratula = useMemo(() => (caratula ? queFalta(caratula) : []), [caratula]);
  const grupos = useMemo(() => {
    const orden: DondeCompletar[] = ["caratula", "plan"];
    return orden
      .map((donde) => {
        const textos = f.faltantes.filter((x) => x.completar === donde).map((x) => x.texto);
        // Carátula cargada pero incompleta (registro, tomo, RUC…): lo dice y ofrece el paso que falta.
        if (donde === "caratula" && textos.length === 0 && faltasCaratula.length > 0) {
          const nombres = faltasCaratula.map((x) => x.texto.replace(/^(el|la) /, ""));
          const resto = nombres.length - 2;
          textos.push(`Falta en la carátula: ${nombres.slice(0, 2).join(", ")}${resto > 0 ? ` y ${resto} más` : ""}`);
        }
        return { donde, textos };
      })
      .filter((g) => g.textos.length > 0);
  }, [f.faltantes, faltasCaratula]);
  /* «Completar carátula» cae en el primer paso que falta (título → titular → libro). */
  const pasoQueFalta = useMemo(() => primerPasoIncompleto(caratula), [caratula]);
  const accion: Record<DondeCompletar, (() => void) | undefined> = {
    caratula: onCompletarCaratula ? () => onCompletarCaratula(pasoQueFalta) : undefined,
    plan: onCompletarPlan,
  };

  const cifra = f.diasQuedan == null ? null : Math.abs(f.diasQuedan);
  const bajoCifra =
    f.diasQuedan == null ? f.estadoTexto
      : f.diasQuedan < 0 ? `${cifra === 1 ? "día" : "días"} de vencido`
        : f.diasQuedan === 0 ? "vence hoy"
          : `${cifra === 1 ? "día queda" : "días quedan"}`;

  return (
    <section
      aria-label="Ficha del permiso"
      className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]"
    >
      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        {/* Vigencia: lo primero que se mira */}
        <div className={`rounded-xl border-2 px-4 py-3 ${tono.caja}`}>
          <div className="flex items-center gap-1.5">
            <CalendarClock className={`h-4 w-4 ${tono.cifra}`} aria-hidden="true" />
            <span className={KICKER}>Vigencia del plan</span>
            <InfoTip
              title="Vigencia del plan"
              what="Días que le quedan al plan de manejo, contados en días de Lima."
              affects={`A ${DIAS_AVISO_VENCIMIENTO} días o menos pasa a «Por vencer»: la renovación ante la ARFFS toma meses.`}
              example="Vigente del viernes 20/03/2026 al lunes 20/03/2028."
            />
            <span className={`ml-auto rounded-full border px-2 py-0.5 text-xs font-bold ${tono.cifra} border-current/40`}>
              {ETIQUETA[f.estado]}
            </span>
          </div>

          <p className="mt-1 flex items-baseline gap-2" aria-live="polite">
            {cifra != null && (
              <span className={`text-3xl font-bold tabular-nums leading-none ${tono.cifra}`}>
                {formatNumber(cifra)}
              </span>
            )}
            <span className={`text-sm font-semibold ${cifra != null ? "text-[var(--text-secondary)]" : tono.cifra}`}>
              {bajoCifra}
            </span>
          </p>

          {f.avancePct != null && (
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
              role="progressbar"
              aria-label="Período del plan ya corrido"
              aria-valuenow={f.avancePct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className={`h-full rounded-full ${tono.barra}`} style={{ width: `${f.avancePct}%` }} />
            </div>
          )}

          {(f.vigenciaDesde || f.vigenciaHasta) && (
            <p className="mt-2 text-xs font-medium text-[var(--text-secondary)]">
              {f.vigenciaDesde ?? "—"} <span aria-hidden="true">→</span>
              <span className="sr-only">hasta</span> {f.vigenciaHasta ?? "—"}
            </p>
          )}
        </div>

        {/* Los códigos que amparan todo lo de abajo */}
        <dl className="grid grid-cols-1 content-start gap-x-6 gap-y-3 min-[400px]:grid-cols-2 lg:grid-cols-3">
          <Dato label="Título habilitante" valor={f.titulo} mono />
          <Dato label="Resolución" valor={f.resolucion} extra={f.resolucionFecha} mono />
          <Dato label="Titular" valor={f.titular} extra={f.ruc ? `RUC ${f.ruc}` : f.representante} />
          <Dato label="Doc. de gestión" valor={f.documentoGestion} />
          <Dato label="Parcela de corta" valor={f.parcelaCorta} mono />
          <Dato
            label="Registro · tomo"
            valor={f.registro || f.tomo ? [f.registro, f.tomo ? `tomo ${f.tomo}` : null].filter(Boolean).join(" · ") : null}
            mono
          />
        </dl>
      </div>

      {grupos.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
          {grupos.map((g) => {
            const completar = accion[g.donde];
            return (
              <li key={g.donde} className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden="true" />
                <span className="font-semibold text-[var(--text-primary)]">{g.textos.join(" · ")}</span>
                {completar && (
                  <button
                    type="button"
                    onClick={completar}
                    className="inline-flex h-11 items-center gap-1 rounded-lg px-2 font-bold text-[var(--accent-dark)] underline-offset-2 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:h-8 dark:text-[var(--accent)]"
                    aria-label={`Completar: ${g.textos.join(", ")}`}
                  >
                    Completar <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Dato({ label, valor, extra, mono }: { label: string; valor: string | null; extra?: string | null; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className={KICKER}>{label}</dt>
      <dd className="min-w-0">
        <span
          className={`block truncate text-sm font-semibold ${valor ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"} ${mono && valor ? "font-mono" : ""}`}
          title={valor ?? undefined}
        >
          {valor ?? "—"}
        </span>
        {extra && <span className="block truncate text-xs text-[var(--text-secondary)]" title={extra}>{extra}</span>}
      </dd>
    </div>
  );
}
