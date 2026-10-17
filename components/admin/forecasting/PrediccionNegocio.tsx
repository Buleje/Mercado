"use client";

/**
 * Las piezas del pronóstico del negocio entero que reparte Análisis ›
 * Predicción entre sus secciones (11-10, «todo parejo»). Antes eran cinco
 * tarjetas apiladas en `PredictiveAnalyticsTab.tsx`, cada una con su estilo:
 *   · Ventas          → tres cifras (`StatCard`): ventas de la próxima semana,
 *                       hora con más clientes, mejor día para el proveedor.
 *   · Stock y compras → «Se agotan pronto», tabla.
 *   · Clientes        → «Clientes que no regresan», tabla con WhatsApp.
 * Lo que explicaba cada tarjeta va en el ⓘ de la cabecera de su sección.
 * Los datos: `use-predicciones.ts` (una sola carga para las tres).
 */

import { DataTable, StatCard } from "@buleje/design-system";
import { AlertTriangle, Calendar, Clock, ExternalLink, RefreshCw, TrendingDown, TrendingUp, Users } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PanelCard } from "./ForecastPiezas";
import type { EstadoPredicciones } from "./use-predicciones";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Error de la carga: una línea y «Reintentar», dentro de la sección. */
function ErrorPredicciones({ estado }: { estado: EstadoPredicciones }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--data-warning-500)]" aria-hidden />
      <p className="text-sm text-[var(--text-secondary)]">No se pudo calcular el pronóstico ({estado.error}).</p>
      <button type="button" onClick={estado.recargar} className={button({ variant: "secondary", className: "ml-auto gap-2 rounded-xl" })}>
        <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
      </button>
    </div>
  );
}

/** Ventas: las tres cifras del ritmo del negocio, en una fila. */
export function PrediccionVentas({ estado }: { estado: EstadoPredicciones }) {
  const { data, cargando, error } = estado;
  if (error && !data) return <ErrorPredicciones estado={estado} />;
  if (cargando && !data) {
    return (
      <div className="grid gap-3 sm:grid-cols-3" aria-busy="true">
        {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />)}
      </div>
    );
  }
  if (!data) return null;
  const sube = data.trendPct >= 0;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard
        label="Ventas próxima semana"
        value={formatCurrency(Number(data.salesForecast))}
        delta={data.trendPct}
        deltaLabel="vs. 4 semanas"
        icon={sube ? TrendingUp : TrendingDown}
      />
      <StatCard
        label="Hora con más clientes"
        value={data.peakHour.label}
        subValue={`${plural(data.peakHour.salesCount, "venta", "ventas")} en 28 días`}
        icon={Clock}
      />
      <StatCard
        label="Mejor día para ir al proveedor"
        value={data.bestPurchaseDay.day}
        subValue="el día más tranquilo"
        icon={Calendar}
      />
    </div>
  );
}

const PASTILLA_DIAS = (dias: number) =>
  cn(
    "inline-block rounded-full px-2 py-0.5 text-sm font-bold",
    dias <= 2
      ? "bg-[var(--data-error-500)]/12 text-[var(--data-error-ink)]"
      : "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-ink)]",
  );

/** Stock y compras: lo que se acaba según lo que se vende por día. */
export function PrediccionAgotan({ estado }: { estado: EstadoPredicciones }) {
  const { data, cargando, error } = estado;
  if (error && !data) return <ErrorPredicciones estado={estado} />;
  const filas = data?.stockRisk ?? [];
  return (
    <PanelCard
      icon={<AlertTriangle className="h-4 w-4" />}
      title="Se agotan pronto"
      loading={cargando && !data}
      error={null}
      isEmpty={filas.length === 0}
      emptyMsg="Ningún producto se agota esta semana."
    >
      <DataTable className="w-full">
        <thead>
          <tr>
            <th>Producto</th>
            <th className="w-28 text-right">Quedan</th>
            <th className="w-32 text-right">Se agota en</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((p) => (
            <tr key={p.id}>
              <td><span className="font-semibold text-[var(--text-primary)]">{p.name}</span></td>
              <td className="whitespace-nowrap text-right">{plural(p.stock, "unidad", "unidades")}</td>
              <td className="text-right">
                <span className={PASTILLA_DIAS(p.daysLeft)}>{p.daysLeft <= 0 ? "Hoy" : plural(p.daysLeft, "día", "días")}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </PanelCard>
  );
}

/** Clientes: los que dejaron de comprar, con su WhatsApp a un toque. */
export function PrediccionClientes({ estado }: { estado: EstadoPredicciones }) {
  const { data, cargando, error } = estado;
  if (error && !data) return <ErrorPredicciones estado={estado} />;
  const filas = data?.churnRisk ?? [];
  return (
    <PanelCard
      icon={<Users className="h-4 w-4" />}
      title="Clientes que no regresan"
      loading={cargando && !data}
      error={null}
      isEmpty={filas.length === 0}
      emptyMsg="Todos tus clientes compraron hace poco."
    >
      <DataTable className="w-full">
        <thead>
          <tr>
            <th>Cliente</th>
            <th className="text-right">Sin comprar</th>
            <th className="w-40 text-right">Escríbele</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((c) => (
            <tr key={c.id}>
              <td><span className="font-semibold text-[var(--text-primary)]">{c.name}</span></td>
              <td className="whitespace-nowrap text-right">{c.daysAgo !== null ? plural(c.daysAgo, "día", "días") : "Sin historial"}</td>
              <td className="text-right">
                {c.whatsappUrl ? (
                  <a
                    href={c.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Escribirle a ${c.name} por WhatsApp`}
                    className={button({ variant: "ghost", className: "gap-1.5 rounded-xl px-3 text-[var(--accent-ink)]" })}
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden /> WhatsApp
                  </a>
                ) : (
                  <span className="text-[var(--text-tertiary)]">Sin teléfono</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </PanelCard>
  );
}
