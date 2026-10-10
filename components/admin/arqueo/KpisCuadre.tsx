"use client";

import { AlertTriangle, BarChart3, Calculator, CheckCircle2, ChevronDown, TrendingDown, TrendingUp } from "@buleje/design-system/icons";
import type { ResumenArqueos } from "@/lib/caja/arqueo-veredicto";
import { cn } from "@/lib/utils";
import { fmt } from "./arqueo-shared";

type Tono = "neutral" | "success" | "error";

const TONOS: Record<Tono, { caja: string; cifra: string }> = {
  neutral: { caja: "border-[var(--rule-base)] bg-[var(--surface-raised)]", cifra: "text-[var(--text-primary)]" },
  success: { caja: "border-[var(--data-success-500)]/20 bg-primary/10 dark:bg-primary/15", cifra: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" },
  error: { caja: "border-[var(--data-error-500)]/20 bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15", cifra: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" },
};

/** Botón «Indicadores» de la cabecera: el patrón de `LothSeccionKpis` (plegado y recordado). */
export function BotonIndicadores({ abierto, onAlternar, controla }: { abierto: boolean; onAlternar: () => void; controla: string }) {
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-expanded={abierto}
      aria-controls={controla}
      title={abierto ? "Plegar los indicadores" : "Ver los indicadores"}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40",
        abierto
          ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]",
      )}
    >
      <BarChart3 className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">Indicadores</span>
      <ChevronDown className={cn("h-4 w-4 transition-transform", abierto && "rotate-180")} aria-hidden />
    </button>
  );
}

/**
 * Los cinco indicadores del historial de cuadres. Plegado sigue diciendo las
 * cifras en una línea: plegar no es esconder el dato.
 */
export default function KpisCuadre({ resumen, abierto, id }: { resumen: ResumenArqueos; abierto: boolean; id: string }) {
  const aRevisar = resumen.sinConteo + resumen.imposibles;
  const items: { label: string; valor: string; tono: Tono; Icono: typeof Calculator; title?: string }[] = [
    { label: "Cuadres", valor: String(resumen.total), tono: "neutral", Icono: Calculator },
    { label: "Conformes", valor: `${resumen.conformes}${resumen.conformesPct != null ? ` · ${resumen.conformesPct} %` : ""}`, tono: "success", Icono: CheckCircle2, title: "El % va sobre los cuadres donde alguien contó" },
    {
      label: "A revisar",
      valor: String(aRevisar),
      tono: aRevisar > 0 ? "error" : "neutral",
      Icono: AlertTriangle,
      title: `${resumen.sinConteo} cerradas sin conteo · ${resumen.imposibles} con esperado negativo`,
    },
    { label: "Faltantes", valor: fmt(resumen.totalFaltanteS), tono: "error", Icono: TrendingDown, title: "Sólo los cuadres donde alguien contó" },
    { label: "Sobrantes", valor: fmt(resumen.totalSobranteS), tono: "success", Icono: TrendingUp },
  ];

  if (!abierto) {
    return (
      <p id={id} className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--text-secondary)]">
        {items.map((it) => (
          <span key={it.label} title={it.title}>
            {it.label} <strong className={cn("font-bold tabular-nums", TONOS[it.tono].cifra)}>{it.valor}</strong>
          </span>
        ))}
      </p>
    );
  }

  return (
    <div id={id} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map(({ label, valor, tono, Icono, title }) => (
        <div key={label} title={title} className={cn("flex items-start gap-3 rounded-xl border p-4", TONOS[tono].caja)}>
          <Icono className={cn("mt-0.5 h-5 w-5", TONOS[tono].cifra)} strokeWidth={1.75} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="libro-kicker truncate">{label}</p>
            <p className={cn("mt-0.5 text-xl font-extrabold tabular-nums", TONOS[tono].cifra)}>{valor}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
