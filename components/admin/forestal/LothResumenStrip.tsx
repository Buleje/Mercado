"use client";

/**
 * LothResumenStrip — resumen "de un vistazo" del aprovechamiento, arriba de las
 * secciones del Libro TH. El dueño abre el libro y ve el estado de su operación
 * (bosque → producto) sin tener que leer una tabla cruda ni ir a Analítica.
 *
 * Teaser compacto (NO duplica Analítica): el embudo de 3 etapas de negocio
 * (Talado → Trozado → Movilizado) + rendimiento + saldo autorizado + alertas,
 * con enlaces a la Analítica y al Cumplimiento para el detalle. Misma fuente que
 * la Analítica (`/plan?analytics=1`) → nunca dicen números distintos.
 */

import { useCallback, useEffect, useState } from "react";
import {
  TreePine,
  Scissors,
  Truck,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  BarChart3,
} from "@buleje/design-system/icons";

interface Analytics {
  hasPlan: boolean;
  aprovechamiento: {
    funnel: { taladoM3: number; trozadoM3: number; despachoTrozaM3: number; despachoProductoM3: number };
    rendimientoGlobalPct: number;
    bySpecies: { species: string }[];
  };
  balance: { rows: { movilizado: number; saldo: number }[] } | null;
  anomalias: { level: "error" | "warn" }[];
}

const fm = (n: number, dp = 2) => n.toLocaleString("es-PE", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export default function LothResumenStrip({ onNavigate, reloadSignal }: { onNavigate: (view: "analitica" | "cumplimiento") => void; reloadSignal?: number }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/forestal/plan?analytics=1", { credentials: "include" });
      if (r.ok) setData((await r.json()).analytics ?? null);
    } catch {
      /* best-effort: sin resumen la vista de secciones igual funciona */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, reloadSignal]);

  if (loading && !data) {
    return <div className="h-[104px] animate-pulse rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]" aria-hidden="true" />;
  }
  if (!data) return null;

  const f = data.aprovechamiento.funnel;
  const talado = f.taladoM3;
  const trozado = f.trozadoM3;
  const movilizado = f.despachoTrozaM3 + f.despachoProductoM3;
  // Sin actividad registrada → no hay nada que resumir (el empty state de la tabla cubre).
  if (talado <= 0 && trozado <= 0 && movilizado <= 0) return null;

  const rend = data.aprovechamiento.rendimientoGlobalPct;
  const errores = data.anomalias.filter((a) => a.level === "error").length;
  const warns = data.anomalias.filter((a) => a.level === "warn").length;
  const especies = data.aprovechamiento.bySpecies.length;

  // Saldo autorizado (si el plan declara volúmenes): movilizado / autorizado.
  const totalMov = data.balance ? data.balance.rows.reduce((a, r) => a + r.movilizado, 0) : 0;
  const totalAutorizado = data.balance ? data.balance.rows.reduce((a, r) => a + r.movilizado + Math.max(0, r.saldo), 0) : 0;
  const pctUsado = totalAutorizado > 0 ? Math.min(100, (totalMov / totalAutorizado) * 100) : 0;
  const excedido = data.balance ? data.balance.rows.some((r) => r.saldo < -1e-6) : false;

  return (
    <section
      className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]"
      aria-label="Resumen del aprovechamiento"
    >
      {/* Cabecera editorial */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[var(--accent)]" />
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">
            Resumen del aprovechamiento
          </span>
        </div>
        <div className="flex items-center gap-2">
          {(errores > 0 || warns > 0) && (
            <button
              type="button"
              onClick={() => onNavigate("cumplimiento")}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${
                errores > 0
                  ? "bg-[var(--data-error-100)] text-[var(--data-error-700)] hover:bg-[var(--data-error-100)]/80"
                  : "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] hover:bg-[var(--data-warning-100)]/80"
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {errores > 0 ? `${errores} ${errores === 1 ? "bloqueo" : "bloqueos"}` : `${warns} ${warns === 1 ? "alerta" : "alertas"}`}
            </button>
          )}
          {errores === 0 && warns === 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-success-100)] px-2.5 py-1 text-xs font-bold text-[var(--data-success-700)]">
              <ShieldCheck className="h-3.5 w-3.5" /> En orden
            </span>
          )}
          <button
            type="button"
            onClick={() => onNavigate("analitica")}
            className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent-dark)] hover:underline"
          >
            Ver analítica <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Embudo de negocio: Talado → Trozado → Movilizado (stack en mobile) */}
      <div className="flex flex-col gap-1 p-3 sm:flex-row sm:flex-nowrap sm:items-center sm:gap-0">
        <Stage icon={TreePine} label="Talado" value={`${fm(talado)} m³`} sub="tumbado en el bosque" />
        <Arrow />
        <Stage
          icon={Scissors}
          label="Trozado"
          value={`${fm(trozado)} m³`}
          sub={rend > 0 ? `rendimiento ${fm(rend, 1)}%` : "en trozas"}
          badge={rend > 0 ? `${fm(rend, 1)}%` : undefined}
        />
        <Arrow />
        <Stage icon={Truck} label="Movilizado" value={`${fm(movilizado)} m³`} sub="despachado con GTF" accent />
      </div>

      {/* Pie: saldo autorizado (si hay plan) + especies */}
      {(data.hasPlan || especies > 0) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--rule-soft)] px-4 py-2.5">
          {totalAutorizado > 0 && (
            <div className="flex min-w-[14rem] flex-1 items-center gap-3">
              <span className="shrink-0 text-xs font-medium text-[var(--text-tertiary)]">Saldo autorizado (POA)</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                <div
                  className={`h-full rounded-full ${excedido ? "bg-[var(--data-error-500)]" : pctUsado > 85 ? "bg-[var(--data-warning-500)]" : "bg-[var(--accent)]"}`}
                  style={{ width: `${Math.max(2, pctUsado)}%` }}
                />
              </div>
              <span className={`shrink-0 font-mono text-xs font-bold tabular-nums ${excedido ? "text-[var(--data-error-700)]" : "text-[var(--text-secondary)]"}`}>
                {fm(totalMov)} / {fm(totalAutorizado)} m³
              </span>
            </div>
          )}
          {especies > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
              <TrendingUp className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
              <b className="font-mono tabular-nums text-[var(--text-secondary)]">{especies}</b> {especies === 1 ? "especie aprovechada" : "especies aprovechadas"}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function Stage({
  icon: Icon,
  label,
  value,
  sub,
  badge,
  accent,
}: {
  icon: typeof TreePine;
  label: string;
  value: string;
  sub: string;
  badge?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex min-w-[8.5rem] flex-1 items-center gap-3 rounded-xl px-3 py-2">
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
          accent
            ? "bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] text-white"
            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
        }`}
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</span>
          {badge && (
            <span className="rounded bg-[var(--data-success-100)] px-1 text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--data-success-700)]">
              {badge}
            </span>
          )}
        </div>
        <div className="font-mono text-lg font-bold leading-tight tabular-nums text-[var(--text-primary)]">{value}</div>
        <div className="truncate text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{sub}</div>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex shrink-0 items-center justify-center px-1 text-[var(--rule-strong)] max-sm:hidden" aria-hidden="true">
      <ChevronRight className="h-5 w-5" />
    </div>
  );
}
