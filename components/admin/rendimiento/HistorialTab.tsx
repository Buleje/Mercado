"use client";

/**
 * HistorialTab — historial de velocidad REAL del negocio: rollup diario de
 * Core Web Vitals de los clientes del storefront (RUM), no del navegador
 * del admin. Se llena solo con visitas reales — sin botón "Medir ahora".
 *
 * Reemplaza al historial viejo en localStorage que: (a) medía la compu del
 * admin, (b) se perdía al limpiar caché, (c) guardaba CLS/FID siempre en 0
 * por leer getEntriesByType sin observer.
 */

import { useEffect, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { BarChart3, Store, Users } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface DayAgg {
  sum: number;
  n: number;
  good: number;
  regular: number;
  poor: number;
}

type Day = Partial<Record<"lcp" | "cls" | "inp" | "ttfb", DayAgg>>;

// Umbrales LCP oficiales en ms (web-vitals reporta LCP en ms).
const LCP_GOOD = 2500;
const LCP_POOR = 4000;

function lcpGradeColor(avgMs: number): string {
  if (avgMs <= LCP_GOOD) return "bg-[var(--data-success-500)]";
  if (avgMs <= LCP_POOR) return "bg-[var(--data-warning-500)]";
  return "bg-[var(--data-error-500)]";
}

function fmtDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

export default function HistorialTab() {
  const [days, setDays] = useState<Record<string, Day> | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/perf-history", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        if (!cancelled) setDays((json?.days as Record<string, Day>) ?? {});
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          No se pudo cargar el historial. Probá recargar la página.
        </p>
      </div>
    );
  }

  if (days === null) {
    return (
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6">
        <div className="h-24 animate-pulse rounded-lg bg-[var(--surface-sunken)]" />
      </div>
    );
  }

  const sorted = Object.entries(days)
    .filter(([, d]) => d.lcp && d.lcp.n > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  const last14 = sorted.slice(-14);

  // Resumen 30 días (sobre lo almacenado)
  const totalVisits = sorted.reduce((acc, [, d]) => acc + (d.lcp?.n ?? 0), 0);
  const totalGood = sorted.reduce((acc, [, d]) => acc + (d.lcp?.good ?? 0), 0);
  const goodPct = totalVisits > 0 ? Math.round((totalGood / totalVisits) * 100) : 0;
  const last7 = sorted.slice(-7);
  const lcp7Sum = last7.reduce((acc, [, d]) => acc + (d.lcp?.sum ?? 0), 0);
  const lcp7N = last7.reduce((acc, [, d]) => acc + (d.lcp?.n ?? 0), 0);
  const lcp7Avg = lcp7N > 0 ? lcp7Sum / lcp7N : 0;

  if (last14.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 text-center">
        <Store className="mx-auto mb-3 h-8 w-8 text-[var(--text-tertiary)]" aria-hidden />
        <p className="text-base font-bold text-[var(--text-primary)]">
          Todavía no hay visitas medidas
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-[var(--text-secondary)]">
          Este historial se llena solo, con la velocidad REAL que sienten tus clientes al
          entrar a tu tienda — no hay que medir nada a mano. Compartí tu tienda y volvé
          mañana.
        </p>
      </div>
    );
  }

  const maxAvg = Math.max(...last14.map(([, d]) => (d.lcp!.sum / d.lcp!.n)), 1);

  const stats = [
    { icon: Users, label: "Visitas medidas (30 d)", value: totalVisits.toLocaleString("es-PE") },
    { icon: BarChart3, label: "Experiencias rápidas", value: `${goodPct}%` },
    { icon: Store, label: "Carga promedio (7 d)", value: `${(lcp7Avg / 1000).toFixed(1)} s` },
  ];

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
            <div className="mb-1.5 flex items-center gap-2">
              <Icon className="h-4 w-4 text-[var(--accent)]" aria-hidden />
              <span className="text-sm font-semibold text-[var(--text-secondary)]">{label}</span>
            </div>
            <p className="text-xl font-extrabold tabular-nums text-[var(--text-primary)]">{value}</p>
          </div>
        ))}
      </div>

      {/* Barras por día */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <CardTitle className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <BarChart3 className="h-4 w-4 text-[var(--accent)]" aria-hidden />
          Carga principal por día (LCP promedio de tus clientes)
        </CardTitle>
        <p className="mb-4 mt-0.5 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
          Verde = rápida (≤2.5 s) · Ámbar = mejorable · Rojo = lenta (&gt;4 s)
        </p>
        <div className="space-y-1.5">
          {last14.map(([date, d]) => {
            const avg = d.lcp!.sum / d.lcp!.n;
            const width = Math.max((avg / maxAvg) * 100, 6);
            return (
              <div key={date} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-sm text-[var(--text-tertiary)]">{fmtDay(date)}</span>
                <div className="h-4 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                  <div
                    className={cn("h-full rounded-full transition-all", lcpGradeColor(avg))}
                    style={{ width: `${width}%` }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-sm font-bold tabular-nums text-[var(--text-primary)]">
                  {(avg / 1000).toFixed(1)} s
                </span>
                <span className="w-20 shrink-0 text-right text-[length:var(--ts-xs)] tabular-nums text-[var(--text-tertiary)]">
                  {d.lcp!.n} visitas
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
