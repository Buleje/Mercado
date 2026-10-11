"use client";

/**
 * Análisis › Alertas › Qué revisar: lo raro del negocio que pide una acción
 * (`/api/analytics/anomalias`: venta baja, stock muerto, fiado vencido, margen
 * crítico), una alerta por fila, las de prioridad alta primero.
 *
 * Antes vivía al fondo de «Business Intelligence», debajo de seis tarjetas que
 * repetían Inicio y de una proyección que repetía Predicción. Su «→» llevaba a
 * `/admin/ventas`, `/admin/productos?search=…` y `/admin/fiados`: rutas que no
 * existen (404). Ahora cada fila abre la pestaña del panel que corresponde.
 */

import { useEffect, useState } from "react";
import { LoadingState } from "@buleje/design-system";
import { AlertTriangle, ChevronRight, RefreshCw } from "@buleje/design-system/icons";
import type { Anomalia } from "@/app/api/analytics/anomalias/route";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

export interface EstadoAlertas {
  alertas: Anomalia[] | null;
  cargando: boolean;
  error: boolean;
  recargar: () => void;
}

const ORDEN: Record<Anomalia["severity"], number> = { alto: 0, medio: 1, bajo: 2 };

/** Una sola carga para la cuenta de la barra y para la lista. */
export function useAlertasNegocio(): EstadoAlertas {
  const [alertas, setAlertas] = useState<Anomalia[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    setCargando(true);
    setError(false);
    fetch("/api/analytics/anomalias", { credentials: "include", signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { anomalias?: Anomalia[] }) => {
        const lista = [...(d.anomalias ?? [])].sort((a, b) => ORDEN[a.severity] - ORDEN[b.severity]);
        setAlertas(lista);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        logger.warn("[AlertasNegocio] no cargaron las alertas", { error: String(err).slice(0, 120) });
        setError(true);
      })
      .finally(() => { if (!ac.signal.aborted) setCargando(false); });
    return () => ac.abort();
  }, [vuelta]);

  return { alertas, cargando, error, recargar: () => setVuelta((v) => v + 1) };
}

/** Adónde lleva cada tipo, dentro del panel. */
const DESTINO: Record<Anomalia["type"], { href: string; rotulo: string }> = {
  venta_baja: { href: "/admin?tab=ventas-caja", rotulo: "Ver ventas" },
  stock_muerto: { href: "/admin?tab=inventario", rotulo: "Ver productos" },
  margen_critico: { href: "/admin?tab=inventario", rotulo: "Ver productos" },
  fiado_vencido: { href: "/admin?tab=fiados", rotulo: "Ver fiados" },
};

const SEVERIDAD: Record<Anomalia["severity"], { rotulo: string; clase: string }> = {
  alto: { rotulo: "Alta", clase: "bg-[var(--data-error-500)]/12 text-[var(--data-error-ink)]" },
  medio: { rotulo: "Media", clase: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-ink)]" },
  bajo: { rotulo: "Baja", clase: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
};

export function AlertasNegocio({ estado }: { estado: EstadoAlertas }) {
  const { alertas, cargando, error, recargar } = estado;

  if (cargando && !alertas) return <LoadingState />;
  if (error && !alertas) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)]" aria-hidden />
        <p className="text-sm text-[var(--data-error-ink)]">No se pudieron revisar las alertas.</p>
        <button type="button" onClick={recargar} className="ml-auto inline-flex min-h-12 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-[var(--accent-ink)] hover:bg-primary/10">
          <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
        </button>
      </div>
    );
  }
  if (!alertas || alertas.length === 0) {
    return <p className="rounded-xl border border-dashed border-[var(--rule-base)] p-6 text-center text-sm text-[var(--text-secondary)]">Nada raro por ahora: ventas, stock, fiados y márgenes dentro de lo normal.</p>;
  }

  return (
    <ul className="divide-y divide-[var(--rule-soft)] overflow-clip rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      {alertas.map((a, i) => {
        const sev = SEVERIDAD[a.severity];
        const destino = DESTINO[a.type];
        return (
          <li key={`${a.type}-${a.title}-${i}`} className="flex items-center gap-x-3 px-3 py-2.5 sm:px-4">
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-bold", sev.clase)}>{sev.rotulo}</span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-semibold text-[var(--text-primary)] sm:truncate">{a.title}</p>
              <p className="line-clamp-2 text-sm text-[var(--text-secondary)] sm:truncate">{a.body}</p>
            </div>
            <EnlacePanel
              href={destino.href}
              apariencia="heredada"
              aria-label={destino.rotulo}
              title={destino.rotulo}
              className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-1 rounded-xl px-2 text-sm font-semibold text-[var(--accent-ink)] hover:bg-primary/10 sm:px-3"
            >
              <span className="hidden sm:inline">{destino.rotulo}</span> <ChevronRight className="h-4 w-4" aria-hidden />
            </EnlacePanel>
          </li>
        );
      })}
    </ul>
  );
}
